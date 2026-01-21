/**
 * @file Event Daemon - Real-time external event processor
 *
 * The PROACTIVE arm of MemoRable. While the MCP server waits for tool calls,
 * the daemon acts on external events in real-time:
 *
 * - Phone rings → Answer for Betty
 * - Scam detected → Intercept immediately
 * - Time trigger → Remind Betty to eat
 * - Distress pattern → Alert care circle
 *
 * "ring ring betty's phone is ringing... she doesn't remember where it is...
 *  Opus can you answer it for her? yeah... real time man"
 *
 * External event → Daemon evaluates → Action taken
 * No one asked. The system ACTS.
 */

import { EventEmitter } from 'events';
import { getDatabase } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { notificationService, type AlertLevel } from '../notification_service/index.js';
import { calculateDistressScore, buildDistressSignals } from '../salience_service/distress_scorer.js';
import { getEntityPressure } from '../salience_service/entity.js';

// ============================================================================
// Types
// ============================================================================

export type EventType =
  | 'phone_ring'
  | 'phone_call_content'  // Audio/transcript from active call
  | 'doorbell'
  | 'email_received'
  | 'calendar_reminder'
  | 'time_trigger'
  | 'sensor_alert'
  | 'device_input'
  | 'silence_detected'    // No activity for threshold period
  | 'location_change'
  | 'market_data'
  | 'custom_webhook';

export interface ExternalEvent {
  eventId: string;
  type: EventType;
  timestamp: string;
  entityId: string;        // Who this event is about
  deviceId?: string;       // Which device detected it
  payload: Record<string, unknown>;
  metadata?: {
    callerId?: string;
    callerName?: string;
    callerNumber?: string;
    location?: string;
    transcript?: string;
    keywords?: string[];
  };
}

export interface ThreatPattern {
  patternId: string;
  name: string;
  description: string;
  indicators: string[];    // Keywords, patterns, behaviors
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  action: 'flag' | 'warn' | 'intercept' | 'block';
  response: string;        // What to say/do
}

export interface GuardianAction {
  actionId: string;
  eventId: string;
  entityId: string;
  actionType: 'intercept' | 'notify' | 'remind' | 'assist' | 'alert' | 'log';
  executed: boolean;
  executedAt?: string;
  result?: string;
  notifiedCareCircle: boolean;
}

// ============================================================================
// Threat Patterns (Scams, Exploitation, Danger)
// ============================================================================

const THREAT_PATTERNS: ThreatPattern[] = [
  // Financial exploitation
  {
    patternId: 'scam_bank_card',
    name: 'Bank Card Scam',
    description: 'Caller asking for credit/debit card numbers',
    indicators: [
      'credit card', 'debit card', 'card number', 'verify your card',
      'read me your card', 'card details', 'expiration date', 'cvv',
      'security code', 'bank verification', 'account verification'
    ],
    threatLevel: 'critical',
    action: 'intercept',
    response: 'This call is being recorded. Banks never request card numbers by phone. Goodbye.'
  },
  {
    patternId: 'scam_social_security',
    name: 'SSN Scam',
    description: 'Caller asking for social security number',
    indicators: [
      'social security', 'ssn', 'social security number',
      'verify your social', 'confirm your social'
    ],
    threatLevel: 'critical',
    action: 'intercept',
    response: 'This call is being recorded. Government agencies never request SSN by phone. Goodbye.'
  },
  {
    patternId: 'scam_gift_card',
    name: 'Gift Card Scam',
    description: 'Caller requesting payment via gift cards',
    indicators: [
      'gift card', 'itunes card', 'google play card', 'amazon card',
      'buy gift cards', 'pay with gift cards', 'scratch off the back'
    ],
    threatLevel: 'critical',
    action: 'intercept',
    response: 'No legitimate business accepts gift cards as payment. This is a scam. Goodbye.'
  },
  {
    patternId: 'scam_irs',
    name: 'IRS Impersonation Scam',
    description: 'Caller claiming to be IRS threatening arrest',
    indicators: [
      'irs', 'internal revenue', 'tax fraud', 'warrant for arrest',
      'police will come', 'you will be arrested', 'owe back taxes'
    ],
    threatLevel: 'critical',
    action: 'intercept',
    response: 'The IRS never calls threatening arrest. This is a scam. Goodbye.'
  },
  {
    patternId: 'scam_grandchild',
    name: 'Grandchild Emergency Scam',
    description: 'Caller pretending to be relative in emergency',
    indicators: [
      'grandma', 'grandpa', 'don\'t tell mom', 'don\'t tell dad',
      'i\'m in trouble', 'i need money', 'i\'m in jail', 'accident',
      'don\'t tell anyone', 'wire money', 'western union'
    ],
    threatLevel: 'high',
    action: 'warn',
    response: 'This may be a scam. Please verify by calling your grandchild directly on their known number.'
  },
  {
    patternId: 'scam_tech_support',
    name: 'Tech Support Scam',
    description: 'Caller claiming computer has virus',
    indicators: [
      'microsoft support', 'tech support', 'your computer',
      'virus detected', 'malware', 'remote access', 'teamviewer',
      'let me connect to your computer'
    ],
    threatLevel: 'high',
    action: 'intercept',
    response: 'Microsoft and Apple never make unsolicited calls. This is a scam. Goodbye.'
  },
  // Urgent situations
  {
    patternId: 'medical_emergency',
    name: 'Medical Emergency',
    description: 'Signs of medical distress',
    indicators: [
      'can\'t breathe', 'chest pain', 'heart attack', 'stroke',
      'fell down', 'i fell', 'help me', 'call 911'
    ],
    threatLevel: 'critical',
    action: 'alert',
    response: 'Medical emergency detected. Alerting care circle and considering emergency services.'
  }
];

// ============================================================================
// Event Daemon Class
// ============================================================================

class EventDaemon extends EventEmitter {
  private running: boolean = false;
  private eventQueue: ExternalEvent[] = [];
  private processingInterval: NodeJS.Timeout | null = null;
  private scheduledChecks: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    logger.info('[EventDaemon] Initialized');
  }

  /**
   * Start the daemon
   */
  start(): void {
    if (this.running) {
      logger.warn('[EventDaemon] Already running');
      return;
    }

    this.running = true;

    // Process events continuously
    this.processingInterval = setInterval(() => {
      this.processEventQueue();
    }, 100); // Check every 100ms for real-time response

    logger.info('[EventDaemon] Started - listening for external events');
    this.emit('started');
  }

  /**
   * Stop the daemon
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Clear all scheduled checks
    for (const [id, timeout] of this.scheduledChecks) {
      clearTimeout(timeout);
    }
    this.scheduledChecks.clear();

    logger.info('[EventDaemon] Stopped');
    this.emit('stopped');
  }

  /**
   * Ingest an external event for processing
   */
  async ingestEvent(event: ExternalEvent): Promise<void> {
    // Add to queue for processing
    this.eventQueue.push(event);

    // Log the event
    const db = getDatabase();
    await db.collection('external_events').insertOne({
      ...event,
      ingestedAt: new Date().toISOString(),
      processed: false
    });

    logger.info(`[EventDaemon] Event ingested: ${event.type} for ${event.entityId}`);

    // For critical events, process immediately (don't wait for queue)
    if (this.isCriticalEvent(event)) {
      await this.processEvent(event);
    }
  }

  /**
   * Check if event needs immediate processing
   */
  private isCriticalEvent(event: ExternalEvent): boolean {
    return event.type === 'phone_call_content' ||
           event.type === 'sensor_alert' ||
           (event.metadata?.keywords?.some(k =>
             THREAT_PATTERNS.some(p => p.indicators.includes(k.toLowerCase()))
           ) ?? false);
  }

  /**
   * Process event queue
   */
  private async processEventQueue(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    // Process one event at a time
    const event = this.eventQueue.shift();
    if (event) {
      await this.processEvent(event);
    }
  }

  /**
   * Main event processing logic
   */
  async processEvent(event: ExternalEvent): Promise<GuardianAction | null> {
    logger.debug(`[EventDaemon] Processing event: ${event.type}`);

    // Get entity context
    const db = getDatabase();
    const entity = await db.collection('entities').findOne({ entityId: event.entityId });
    const pressure = await getEntityPressure(event.entityId);

    // Build context for decision making
    const context = {
      entity,
      pressure,
      event,
      vulnerability: entity?.vulnerability || 'normal', // normal, moderate, high
      careCircle: entity?.careCircle || [],
    };

    let action: GuardianAction | null = null;

    // Route by event type
    switch (event.type) {
      case 'phone_ring':
        action = await this.handlePhoneRing(event, context);
        break;
      case 'phone_call_content':
        action = await this.handlePhoneCallContent(event, context);
        break;
      case 'doorbell':
        action = await this.handleDoorbell(event, context);
        break;
      case 'time_trigger':
        action = await this.handleTimeTrigger(event, context);
        break;
      case 'silence_detected':
        action = await this.handleSilenceDetected(event, context);
        break;
      case 'sensor_alert':
        action = await this.handleSensorAlert(event, context);
        break;
      default:
        action = await this.handleGenericEvent(event, context);
    }

    // Mark event as processed
    await db.collection('external_events').updateOne(
      { eventId: event.eventId },
      {
        $set: {
          processed: true,
          processedAt: new Date().toISOString(),
          actionTaken: action?.actionType || 'none'
        }
      }
    );

    // Store action if taken
    if (action) {
      await db.collection('guardian_actions').insertOne(action);
      this.emit('action', action);
    }

    return action;
  }

  /**
   * Handle phone ringing - assess if intervention needed
   */
  private async handlePhoneRing(
    event: ExternalEvent,
    context: Record<string, unknown>
  ): Promise<GuardianAction | null> {
    const { entityId, metadata } = event;
    const callerNumber = metadata?.callerNumber;
    const callerName = metadata?.callerName;

    // Check if caller is known (in contacts)
    const db = getDatabase();
    const knownContact = callerNumber
      ? await db.collection('contacts').findOne({
          entityId,
          $or: [
            { phone: callerNumber },
            { name: callerName }
          ]
        })
      : null;

    // Check entity vulnerability
    const vulnerability = (context.entity as Record<string, unknown>)?.vulnerability as string;

    // If vulnerable entity and unknown caller, consider intercepting
    if (vulnerability === 'high' && !knownContact) {
      logger.info(`[EventDaemon] Unknown caller for vulnerable entity ${entityId}`);

      return {
        actionId: `action_${Date.now().toString(36)}`,
        eventId: event.eventId,
        entityId,
        actionType: 'assist',
        executed: true,
        executedAt: new Date().toISOString(),
        result: `Monitoring call from ${callerNumber || 'unknown'} for ${entityId}`,
        notifiedCareCircle: false
      };
    }

    // Known caller - assist with recognition if needed
    if (knownContact && vulnerability === 'high') {
      return {
        actionId: `action_${Date.now().toString(36)}`,
        eventId: event.eventId,
        entityId,
        actionType: 'assist',
        executed: true,
        executedAt: new Date().toISOString(),
        result: `Call from ${knownContact.name} (${knownContact.relationship || 'contact'})`,
        notifiedCareCircle: false
      };
    }

    return null;
  }

  /**
   * Handle phone call content - detect scams in real-time
   */
  private async handlePhoneCallContent(
    event: ExternalEvent,
    context: Record<string, unknown>
  ): Promise<GuardianAction | null> {
    const { entityId, metadata } = event;
    const transcript = metadata?.transcript || '';
    const transcriptLower = transcript.toLowerCase();

    // Check against all threat patterns
    for (const pattern of THREAT_PATTERNS) {
      const matchedIndicators = pattern.indicators.filter(
        indicator => transcriptLower.includes(indicator.toLowerCase())
      );

      if (matchedIndicators.length > 0) {
        logger.warn(
          `[EventDaemon] THREAT DETECTED: ${pattern.name} for ${entityId}. ` +
          `Matched: ${matchedIndicators.join(', ')}`
        );

        // Take action based on pattern
        if (pattern.action === 'intercept' || pattern.action === 'block') {
          // INTERCEPT - Opus takes over
          const action: GuardianAction = {
            actionId: `action_${Date.now().toString(36)}`,
            eventId: event.eventId,
            entityId,
            actionType: 'intercept',
            executed: true,
            executedAt: new Date().toISOString(),
            result: pattern.response,
            notifiedCareCircle: true
          };

          // Alert care circle
          const careCircle = (context.entity as Record<string, unknown>)?.careCircle as string[] | undefined;
          if (careCircle && careCircle.length > 0) {
            await notificationService.checkAndNotify(entityId, {
              pressureScore: 10, // Max pressure - active threat
              interventionUrgency: 'urgent',
              patterns: {
                receivingFromMultipleSources: false,
                transmittingToOthers: false,
                isolating: false,
                escalating: true
              },
              careCircle
            });
          }

          // Store scam attempt for pattern learning
          const db = getDatabase();
          await db.collection('scam_attempts').insertOne({
            entityId,
            eventId: event.eventId,
            pattern: pattern.patternId,
            matchedIndicators,
            transcript,
            callerNumber: metadata?.callerNumber,
            intercepted: true,
            timestamp: new Date().toISOString()
          });

          this.emit('threat_intercepted', { pattern, event, action });
          return action;
        }

        if (pattern.action === 'warn') {
          // WARN - Alert entity without full intercept
          return {
            actionId: `action_${Date.now().toString(36)}`,
            eventId: event.eventId,
            entityId,
            actionType: 'alert',
            executed: true,
            executedAt: new Date().toISOString(),
            result: pattern.response,
            notifiedCareCircle: false
          };
        }
      }
    }

    return null;
  }

  /**
   * Handle doorbell - identify visitor
   */
  private async handleDoorbell(
    event: ExternalEvent,
    context: Record<string, unknown>
  ): Promise<GuardianAction | null> {
    const { entityId } = event;
    const vulnerability = (context.entity as Record<string, unknown>)?.vulnerability as string;

    if (vulnerability === 'high') {
      // For vulnerable entities, always assist with doorbell
      return {
        actionId: `action_${Date.now().toString(36)}`,
        eventId: event.eventId,
        entityId,
        actionType: 'assist',
        executed: true,
        executedAt: new Date().toISOString(),
        result: 'Someone is at the door. Checking if they are expected.',
        notifiedCareCircle: false
      };
    }

    return null;
  }

  /**
   * Handle time-based triggers (reminders, scheduled checks)
   */
  private async handleTimeTrigger(
    event: ExternalEvent,
    context: Record<string, unknown>
  ): Promise<GuardianAction | null> {
    const { entityId, payload } = event;
    const triggerType = payload.triggerType as string;

    if (triggerType === 'meal_reminder') {
      return {
        actionId: `action_${Date.now().toString(36)}`,
        eventId: event.eventId,
        entityId,
        actionType: 'remind',
        executed: true,
        executedAt: new Date().toISOString(),
        result: payload.message as string || 'Time for your meal',
        notifiedCareCircle: false
      };
    }

    if (triggerType === 'medication_reminder') {
      return {
        actionId: `action_${Date.now().toString(36)}`,
        eventId: event.eventId,
        entityId,
        actionType: 'remind',
        executed: true,
        executedAt: new Date().toISOString(),
        result: payload.message as string || 'Time for your medication',
        notifiedCareCircle: false
      };
    }

    if (triggerType === 'check_in') {
      // Check pressure/distress and potentially alert care circle
      const pressure = context.pressure as Record<string, unknown> | null;
      if (pressure && (pressure.pressureScore as number) > 5) {
        const careCircle = (context.entity as Record<string, unknown>)?.careCircle as string[];
        if (careCircle && careCircle.length > 0) {
          await notificationService.checkAndNotify(entityId, {
            pressureScore: pressure.pressureScore as number,
            interventionUrgency: pressure.interventionUrgency as AlertLevel,
            patterns: pressure.patterns as {
              receivingFromMultipleSources: boolean;
              transmittingToOthers: boolean;
              isolating: boolean;
              escalating: boolean;
            },
            careCircle
          });
        }
      }
    }

    return null;
  }

  /**
   * Handle silence/no activity detected
   */
  private async handleSilenceDetected(
    event: ExternalEvent,
    context: Record<string, unknown>
  ): Promise<GuardianAction | null> {
    const { entityId, payload } = event;
    const silenceDurationMinutes = payload.durationMinutes as number || 0;
    const vulnerability = (context.entity as Record<string, unknown>)?.vulnerability as string;

    // For vulnerable entities, silence can indicate a problem
    if (vulnerability === 'high' && silenceDurationMinutes > 120) { // 2 hours
      const careCircle = (context.entity as Record<string, unknown>)?.careCircle as string[];

      if (careCircle && careCircle.length > 0) {
        await notificationService.checkAndNotify(entityId, {
          pressureScore: 6,
          interventionUrgency: 'concern',
          patterns: {
            receivingFromMultipleSources: false,
            transmittingToOthers: false,
            isolating: true,
            escalating: false
          },
          careCircle
        });

        return {
          actionId: `action_${Date.now().toString(36)}`,
          eventId: event.eventId,
          entityId,
          actionType: 'alert',
          executed: true,
          executedAt: new Date().toISOString(),
          result: `No activity detected for ${silenceDurationMinutes} minutes. Care circle notified.`,
          notifiedCareCircle: true
        };
      }
    }

    return null;
  }

  /**
   * Handle sensor alerts (smoke, fall detection, etc.)
   */
  private async handleSensorAlert(
    event: ExternalEvent,
    context: Record<string, unknown>
  ): Promise<GuardianAction | null> {
    const { entityId, payload } = event;
    const alertType = payload.alertType as string;

    // Always alert care circle for sensor alerts
    const careCircle = (context.entity as Record<string, unknown>)?.careCircle as string[];

    if (alertType === 'fall_detected') {
      if (careCircle && careCircle.length > 0) {
        await notificationService.checkAndNotify(entityId, {
          pressureScore: 10,
          interventionUrgency: 'urgent',
          patterns: {
            receivingFromMultipleSources: false,
            transmittingToOthers: false,
            isolating: false,
            escalating: true
          },
          careCircle
        });
      }

      return {
        actionId: `action_${Date.now().toString(36)}`,
        eventId: event.eventId,
        entityId,
        actionType: 'alert',
        executed: true,
        executedAt: new Date().toISOString(),
        result: 'Fall detected. Care circle notified. Checking on you.',
        notifiedCareCircle: true
      };
    }

    if (alertType === 'smoke_detected' || alertType === 'fire') {
      return {
        actionId: `action_${Date.now().toString(36)}`,
        eventId: event.eventId,
        entityId,
        actionType: 'alert',
        executed: true,
        executedAt: new Date().toISOString(),
        result: 'Smoke/fire detected. Please evacuate. Emergency services may be contacted.',
        notifiedCareCircle: true
      };
    }

    return null;
  }

  /**
   * Handle generic events
   */
  private async handleGenericEvent(
    event: ExternalEvent,
    context: Record<string, unknown>
  ): Promise<GuardianAction | null> {
    // Log for pattern learning
    logger.debug(`[EventDaemon] Generic event: ${event.type} for ${event.entityId}`);
    return null;
  }

  /**
   * Schedule a time-based check
   */
  scheduleCheck(
    entityId: string,
    checkType: string,
    delayMs: number,
    payload: Record<string, unknown> = {}
  ): string {
    const checkId = `check_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const timeout = setTimeout(async () => {
      await this.ingestEvent({
        eventId: `event_${Date.now().toString(36)}`,
        type: 'time_trigger',
        timestamp: new Date().toISOString(),
        entityId,
        payload: {
          triggerType: checkType,
          scheduledCheckId: checkId,
          ...payload
        }
      });

      this.scheduledChecks.delete(checkId);
    }, delayMs);

    this.scheduledChecks.set(checkId, timeout);
    return checkId;
  }

  /**
   * Cancel a scheduled check
   */
  cancelCheck(checkId: string): boolean {
    const timeout = this.scheduledChecks.get(checkId);
    if (timeout) {
      clearTimeout(timeout);
      this.scheduledChecks.delete(checkId);
      return true;
    }
    return false;
  }

  /**
   * Get daemon status
   */
  getStatus(): {
    running: boolean;
    queueLength: number;
    scheduledChecks: number;
  } {
    return {
      running: this.running,
      queueLength: this.eventQueue.length,
      scheduledChecks: this.scheduledChecks.size
    };
  }
}

// Singleton
export const eventDaemon = new EventDaemon();

// Export types and class
export { EventDaemon, THREAT_PATTERNS };
