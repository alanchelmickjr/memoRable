/**
 * @file Notification Service - Delivers alerts to care circle when pressure thresholds are reached
 *
 * This is the critical piece that connects pressure tracking to action.
 * When an entity's pressure reaches a threshold, their care circle gets notified.
 *
 * Notification channels (configured per entity in care circle):
 * - SMS (via Twilio or AWS SNS)
 * - Email (via SendGrid or AWS SES)
 * - Push notification (via FCM/APNS)
 * - Webhook (for custom integrations)
 *
 * IMPORTANT: This service never sends unsolicited notifications.
 * It only fires when:
 * 1. A care circle is explicitly set for an entity
 * 2. The entity's pressure reaches the configured threshold
 * 3. Notification wasn't already sent in the cooldown period
 */

import { getDatabase } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export type NotificationChannel = 'sms' | 'email' | 'push' | 'webhook';
export type AlertLevel = 'monitor' | 'concern' | 'urgent';

export interface CareCircleMember {
  entityId: string;
  name: string;
  channels: NotificationChannel[];
  contactInfo: {
    phone?: string;      // For SMS
    email?: string;      // For email
    pushToken?: string;  // For push notifications
    webhookUrl?: string; // For webhook
  };
  alertLevel: AlertLevel; // Minimum level to notify this person
}

export interface NotificationPayload {
  entityId: string;           // Entity experiencing pressure
  entityName: string;
  alertLevel: AlertLevel;
  pressureScore: number;
  patterns: {
    receivingFromMultipleSources: boolean;
    transmittingToOthers: boolean;
    isolating: boolean;
    escalating: boolean;
  };
  message: string;            // Human-readable summary
  actionUrl?: string;         // Deep link to dashboard/details
}

export interface NotificationRecord {
  notificationId: string;
  entityId: string;           // Entity the notification is about
  recipientEntityId: string;  // Care circle member who received it
  channel: NotificationChannel;
  payload: NotificationPayload;
  sentAt: string;
  deliveryStatus: 'pending' | 'sent' | 'delivered' | 'failed';
  errorMessage?: string;
}

// ============================================================================
// Notification Service
// ============================================================================

class NotificationService {
  private cooldownMs: number = 4 * 60 * 60 * 1000; // 4 hours default
  private enabled: boolean = true;

  constructor() {
    // Check for required config
    this.enabled = process.env.NOTIFICATIONS_ENABLED !== 'false';

    if (this.enabled) {
      logger.info('[NotificationService] Initialized and ready');
    } else {
      logger.info('[NotificationService] Disabled via NOTIFICATIONS_ENABLED=false');
    }
  }

  /**
   * Check if notifications should be sent for an entity and send them
   */
  async checkAndNotify(
    entityId: string,
    pressureData: {
      pressureScore: number;
      interventionUrgency: AlertLevel | 'none';
      patterns: NotificationPayload['patterns'];
      careCircle?: string[];
    }
  ): Promise<void> {
    if (!this.enabled) {
      logger.debug('[NotificationService] Notifications disabled, skipping');
      return;
    }

    // No notification for 'none' urgency
    if (pressureData.interventionUrgency === 'none') {
      return;
    }

    // No care circle = no one to notify
    if (!pressureData.careCircle || pressureData.careCircle.length === 0) {
      logger.debug(`[NotificationService] Entity ${entityId} has no care circle`);
      return;
    }

    const db = getDatabase();

    // Check cooldown - don't spam notifications
    const recentNotification = await db.collection('notifications').findOne({
      entityId,
      sentAt: { $gte: new Date(Date.now() - this.cooldownMs).toISOString() },
      deliveryStatus: { $in: ['sent', 'delivered'] },
    });

    if (recentNotification) {
      logger.debug(`[NotificationService] Cooldown active for ${entityId}, skipping`);
      return;
    }

    // Get entity details
    const entity = await db.collection('entities').findOne({ entityId });
    const entityName = entity?.name || entityId;

    // Get care circle member details
    const careCircleMembers = await this.getCareCircleMembers(pressureData.careCircle);

    // Filter by alert level
    const urgencyOrder: AlertLevel[] = ['monitor', 'concern', 'urgent'];
    const currentLevel = pressureData.interventionUrgency;
    const currentIndex = urgencyOrder.indexOf(currentLevel);

    const eligibleMembers = careCircleMembers.filter(member => {
      const memberIndex = urgencyOrder.indexOf(member.alertLevel);
      return memberIndex <= currentIndex; // Member's threshold is at or below current level
    });

    if (eligibleMembers.length === 0) {
      logger.debug(`[NotificationService] No eligible care circle members for ${entityId}`);
      return;
    }

    // Build payload
    const payload: NotificationPayload = {
      entityId,
      entityName,
      alertLevel: currentLevel,
      pressureScore: pressureData.pressureScore,
      patterns: pressureData.patterns,
      message: this.buildAlertMessage(entityName, currentLevel, pressureData.patterns),
    };

    // Send to all eligible members
    for (const member of eligibleMembers) {
      await this.sendToMember(member, payload);
    }

    logger.info(`[NotificationService] Sent ${currentLevel} alerts for ${entityId} to ${eligibleMembers.length} care circle members`);
  }

  /**
   * Get care circle member details from the database
   */
  private async getCareCircleMembers(entityIds: string[]): Promise<CareCircleMember[]> {
    const db = getDatabase();

    const members: CareCircleMember[] = [];

    for (const entityId of entityIds) {
      // Get entity and their notification preferences
      const entity = await db.collection('entities').findOne({ entityId });
      const prefs = await db.collection('notification_preferences').findOne({ entityId });

      if (entity) {
        members.push({
          entityId,
          name: entity.name || entityId,
          channels: prefs?.channels || ['email'], // Default to email
          contactInfo: prefs?.contactInfo || {},
          alertLevel: prefs?.alertLevel || 'concern', // Default to concern level
        });
      }
    }

    return members;
  }

  /**
   * Build a human-readable alert message
   */
  private buildAlertMessage(
    entityName: string,
    level: AlertLevel,
    patterns: NotificationPayload['patterns']
  ): string {
    const levelText = {
      monitor: 'should be monitored',
      concern: 'may need support',
      urgent: 'needs attention now',
    }[level];

    let message = `${entityName} ${levelText}.`;

    const reasons: string[] = [];
    if (patterns.receivingFromMultipleSources) {
      reasons.push('stress from multiple sources');
    }
    if (patterns.transmittingToOthers) {
      reasons.push('affecting others');
    }
    if (patterns.isolating) {
      reasons.push('withdrawing from connection');
    }
    if (patterns.escalating) {
      reasons.push('situation intensifying');
    }

    if (reasons.length > 0) {
      message += ` Observed: ${reasons.join(', ')}.`;
    }

    return message;
  }

  /**
   * Send notification to a single care circle member via their preferred channels
   */
  private async sendToMember(
    member: CareCircleMember,
    payload: NotificationPayload
  ): Promise<void> {
    for (const channel of member.channels) {
      const notificationId = `notif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

      const record: NotificationRecord = {
        notificationId,
        entityId: payload.entityId,
        recipientEntityId: member.entityId,
        channel,
        payload,
        sentAt: new Date().toISOString(),
        deliveryStatus: 'pending',
      };

      try {
        await this.sendViaChannel(channel, member, payload);
        record.deliveryStatus = 'sent';
      } catch (error) {
        record.deliveryStatus = 'failed';
        record.errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`[NotificationService] Failed to send ${channel} to ${member.entityId}:`, error);
      }

      // Store notification record
      const db = getDatabase();
      await db.collection('notifications').insertOne(record);
    }
  }

  /**
   * Send via specific channel
   */
  private async sendViaChannel(
    channel: NotificationChannel,
    member: CareCircleMember,
    payload: NotificationPayload
  ): Promise<void> {
    switch (channel) {
      case 'sms':
        await this.sendSms(member.contactInfo.phone, payload);
        break;
      case 'email':
        await this.sendEmail(member.contactInfo.email, member.name, payload);
        break;
      case 'push':
        await this.sendPush(member.contactInfo.pushToken, payload);
        break;
      case 'webhook':
        await this.sendWebhook(member.contactInfo.webhookUrl, payload);
        break;
    }
  }

  /**
   * Send SMS notification
   */
  private async sendSms(phone: string | undefined, payload: NotificationPayload): Promise<void> {
    if (!phone) {
      throw new Error('No phone number configured');
    }

    // Check for Twilio or AWS SNS config
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const snsEnabled = process.env.AWS_SNS_ENABLED === 'true';

    if (twilioSid) {
      // Use Twilio
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const fromPhone = process.env.TWILIO_FROM_NUMBER;

      if (!twilioToken || !fromPhone) {
        throw new Error('Twilio not fully configured (missing auth token or from number)');
      }

      const twilio = await import('twilio').then(m => m.default);
      const client = twilio(twilioSid, twilioToken);

      await client.messages.create({
        body: payload.message,
        to: phone,
        from: fromPhone,
      });

      logger.info(`[NotificationService] SMS sent via Twilio to ${phone.slice(-4)}`);
    } else if (snsEnabled) {
      // Use AWS SNS
      const { SNSClient, PublishCommand } = await import('@aws-sdk/client-sns');
      const sns = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

      await sns.send(new PublishCommand({
        PhoneNumber: phone,
        Message: payload.message,
      }));

      logger.info(`[NotificationService] SMS sent via SNS to ${phone.slice(-4)}`);
    } else {
      // Log only mode
      logger.info(`[NotificationService] SMS (mock): ${phone} - ${payload.message}`);
    }
  }

  /**
   * Send email notification
   */
  private async sendEmail(
    email: string | undefined,
    name: string,
    payload: NotificationPayload
  ): Promise<void> {
    if (!email) {
      throw new Error('No email configured');
    }

    const sendgridKey = process.env.SENDGRID_API_KEY;
    const sesEnabled = process.env.AWS_SES_ENABLED === 'true';
    const fromEmail = process.env.NOTIFICATION_FROM_EMAIL || 'alerts@memorable.dev';

    const subject = `[${payload.alertLevel.toUpperCase()}] ${payload.entityName} - MemoRable Alert`;
    const htmlBody = `
      <h2>Care Circle Alert</h2>
      <p>${payload.message}</p>
      <hr>
      <p><strong>Alert Level:</strong> ${payload.alertLevel}</p>
      <p><strong>Pressure Score:</strong> ${payload.pressureScore.toFixed(2)}</p>
      ${payload.actionUrl ? `<p><a href="${payload.actionUrl}">View Details</a></p>` : ''}
      <hr>
      <p><small>You're receiving this because you're in ${payload.entityName}'s care circle.</small></p>
    `;

    if (sendgridKey) {
      // Use SendGrid
      const sgMail = await import('@sendgrid/mail').then(m => m.default);
      sgMail.setApiKey(sendgridKey);

      await sgMail.send({
        to: email,
        from: fromEmail,
        subject,
        html: htmlBody,
      });

      logger.info(`[NotificationService] Email sent via SendGrid to ${email}`);
    } else if (sesEnabled) {
      // Use AWS SES
      const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');
      const ses = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });

      await ses.send(new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: subject },
          Body: { Html: { Data: htmlBody } },
        },
      }));

      logger.info(`[NotificationService] Email sent via SES to ${email}`);
    } else {
      // Log only mode
      logger.info(`[NotificationService] Email (mock): ${email} - Subject: ${subject}`);
    }
  }

  /**
   * Send push notification
   */
  private async sendPush(token: string | undefined, payload: NotificationPayload): Promise<void> {
    if (!token) {
      throw new Error('No push token configured');
    }

    const fcmKey = process.env.FCM_SERVER_KEY;

    if (fcmKey) {
      // Use Firebase Cloud Messaging
      const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Authorization': `key=${fcmKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: token,
          notification: {
            title: `${payload.alertLevel.toUpperCase()}: ${payload.entityName}`,
            body: payload.message,
          },
          data: {
            entityId: payload.entityId,
            alertLevel: payload.alertLevel,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`FCM failed: ${response.status}`);
      }

      logger.info(`[NotificationService] Push sent via FCM`);
    } else {
      // Log only mode
      logger.info(`[NotificationService] Push (mock): ${token.slice(0, 10)}... - ${payload.message}`);
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(url: string | undefined, payload: NotificationPayload): Promise<void> {
    if (!url) {
      throw new Error('No webhook URL configured');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MemoRable-Alert': 'care-circle',
      },
      body: JSON.stringify({
        type: 'care_circle_alert',
        ...payload,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status}`);
    }

    logger.info(`[NotificationService] Webhook sent to ${url}`);
  }

  /**
   * Get notification history for an entity
   */
  async getNotificationHistory(
    entityId: string,
    limit: number = 10
  ): Promise<NotificationRecord[]> {
    const db = getDatabase();

    return db.collection('notifications')
      .find({ entityId })
      .sort({ sentAt: -1 })
      .limit(limit)
      .toArray() as Promise<NotificationRecord[]>;
  }

  /**
   * Set notification preferences for a care circle member
   */
  async setNotificationPreferences(
    entityId: string,
    preferences: {
      channels?: NotificationChannel[];
      contactInfo?: CareCircleMember['contactInfo'];
      alertLevel?: AlertLevel;
    }
  ): Promise<void> {
    const db = getDatabase();

    await db.collection('notification_preferences').updateOne(
      { entityId },
      {
        $set: {
          ...preferences,
          updatedAt: new Date().toISOString(),
        },
        $setOnInsert: {
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    );

    logger.info(`[NotificationService] Preferences updated for ${entityId}`);
  }
}

// Singleton instance
export const notificationService = new NotificationService();

// Export for direct use
export { NotificationService };
