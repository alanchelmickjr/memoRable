import { logger } from '../utils/logger.js';
import mongoose from 'mongoose';

export class ConfidenceService {
  constructor() {
    this.patternSchema = new mongoose.Schema({
      userId: mongoose.Schema.Types.ObjectId,
      patterns: [{
        type: String,
        startDate: Date,
        lastSeen: Date,
        occurrences: Number,
        confidence: Number,
        category: {
          type: String,
          enum: ['habit', 'response', 'emotional', 'cognitive']
        }
      }],
      mentalHealth: {
        stress: Number,
        engagement: Number,
        satisfaction: Number,
        lastUpdate: Date
      },
      attentionMetrics: {
        focusAreas: Map,
        decayRates: Map,
        lastCleanup: Date
      }
    });

    this.Pattern = mongoose.model('Pattern', this.patternSchema);
    
    // Confidence thresholds
    this.thresholds = {
      quickResponse: 0.4,
      patternFormation: 0.6,
      habitConfirmation: 0.8
    };

    // Time windows
    this.windows = {
      pattern: 21 * 24 * 60 * 60 * 1000, // 21 days
      attention: 7 * 24 * 60 * 60 * 1000, // 7 days
      cleanup: 24 * 60 * 60 * 1000 // 1 day
    };
  }

  async quick(finalResponse, userId, context) {
    try {
      // Get user's pattern history
      const userPatterns = await this.Pattern.findOne({ userId });
      if (!userPatterns) {
        return this.thresholds.quickResponse; // Default confidence
      }

      // Calculate quick confidence score
      const score = await this.calculateQuickConfidence(
        finalResponse,
        userPatterns,
        context
      );

      // Update pattern tracking if confidence is high
      if (score > this.thresholds.patternFormation) {
        await this.trackPattern(userId, finalResponse, context);
      }

      return score;
    } catch (error) {
      logger.error('Error in quick confidence check:', error);
      return this.thresholds.quickResponse;
    }
  }

  async calculateQuickConfidence(response, patterns, context) {
    let confidence = this.thresholds.quickResponse;

    // Check against existing patterns
    for (const pattern of patterns.patterns) {
      if (this.matchesPattern(response, pattern)) {
        confidence = Math.max(confidence, pattern.confidence);
      }
    }

    // Adjust for mental health metrics
    const mentalHealthFactor = this.calculateMentalHealthFactor(patterns.mentalHealth);
    confidence *= mentalHealthFactor;

    // Adjust for attention metrics
    const attentionFactor = this.calculateAttentionFactor(
      patterns.attentionMetrics,
      context
    );
    confidence *= attentionFactor;

    return Math.min(1, confidence);
  }

  matchesPattern(response, pattern) {
    // Simple pattern matching for quick checks
    return response.toLowerCase().includes(pattern.type.toLowerCase());
  }

  calculateMentalHealthFactor(metrics) {
    if (!metrics || !metrics.lastUpdate) return 1;

    const factor = (
      (metrics.engagement + metrics.satisfaction) / 2 -
      metrics.stress * 0.5
    ) / 100;

    return Math.max(0.5, Math.min(1.5, 1 + factor));
  }

  calculateAttentionFactor(metrics, context) {
    if (!metrics || !metrics.focusAreas.size) return 1;

    const relevantFocus = Array.from(metrics.focusAreas.keys())
      .find(area => context.includes(area));

    if (!relevantFocus) return 1;

    const focusStrength = metrics.focusAreas.get(relevantFocus);
    const decayRate = metrics.decayRates.get(relevantFocus) || 0.1;
    const timeSinceLastCleanup = Date.now() - metrics.lastCleanup;
    
    return Math.max(
      0.5,
      focusStrength * Math.exp(-decayRate * timeSinceLastCleanup / this.windows.attention)
    );
  }

  async trackPattern(userId, response, context) {
    try {
      let userPatterns = await this.Pattern.findOne({ userId });
      
      if (!userPatterns) {
        userPatterns = await this.Pattern.create({
          userId,
          patterns: [],
          mentalHealth: {
            stress: 50,
            engagement: 50,
            satisfaction: 50,
            lastUpdate: new Date()
          },
          attentionMetrics: {
            focusAreas: new Map(),
            decayRates: new Map(),
            lastCleanup: new Date()
          }
        });
      }

      // Update or add pattern
      const patternType = this.extractPatternType(response);
      const existingPattern = userPatterns.patterns.find(p => p.type === patternType);

      if (existingPattern) {
        existingPattern.occurrences += 1;
        existingPattern.lastSeen = new Date();
        existingPattern.confidence = this.calculatePatternConfidence(existingPattern);
      } else {
        userPatterns.patterns.push({
          type: patternType,
          startDate: new Date(),
          lastSeen: new Date(),
          occurrences: 1,
          confidence: this.thresholds.quickResponse,
          category: this.categorizePattern(response, context)
        });
      }

      // Update attention metrics
      this.updateAttentionMetrics(userPatterns.attentionMetrics, context);

      await userPatterns.save();
      return true;
    } catch (error) {
      logger.error('Error tracking pattern:', error);
      return false;
    }
  }

  extractPatternType(response) {
    // Simple pattern extraction for demonstration
    return response.toLowerCase().slice(0, 50);
  }

  categorizePattern(response, context) {
    if (context.includes('emotional')) return 'emotional';
    if (context.includes('habit')) return 'habit';
    if (context.includes('cognitive')) return 'cognitive';
    return 'response';
  }

  calculatePatternConfidence(pattern) {
    const daysSinceStart = (Date.now() - pattern.startDate) / (24 * 60 * 60 * 1000);
    
    if (daysSinceStart <= 21) {
      // During 21-day formation period
      return Math.min(
        this.thresholds.habitConfirmation,
        this.thresholds.patternFormation + 
        (pattern.occurrences / 21) * 
        (this.thresholds.habitConfirmation - this.thresholds.patternFormation)
      );
    }

    // After 21 days, confidence based on consistency
    const consistency = pattern.occurrences / daysSinceStart;
    return Math.min(1, consistency * this.thresholds.habitConfirmation);
  }

  updateAttentionMetrics(metrics, context) {
    const now = Date.now();

    // Clean up old focus areas
    if (now - metrics.lastCleanup > this.windows.cleanup) {
      for (const [area, strength] of metrics.focusAreas.entries()) {
        const decayRate = metrics.decayRates.get(area) || 0.1;
        const newStrength = strength * Math.exp(-decayRate);

        if (newStrength < 0.1) {
          metrics.focusAreas.delete(area);
          metrics.decayRates.delete(area);
        } else {
          metrics.focusAreas.set(area, newStrength);
        }
      }
      metrics.lastCleanup = now;
    }

    // Update focus areas from context
    const contextAreas = context.split(',');
    for (const area of contextAreas) {
      const currentStrength = metrics.focusAreas.get(area) || 0;
      metrics.focusAreas.set(area, Math.min(1, currentStrength + 0.1));
      
      // Adjust decay rate based on frequency
      const currentDecay = metrics.decayRates.get(area) || 0.1;
      metrics.decayRates.set(area, Math.max(0.01, currentDecay - 0.01));
    }
  }

  async updateMentalHealth(userId, metrics) {
    try {
      const userPatterns = await this.Pattern.findOne({ userId });
      if (!userPatterns) return false;

      userPatterns.mentalHealth = {
        ...userPatterns.mentalHealth,
        ...metrics,
        lastUpdate: new Date()
      };

      await userPatterns.save();
      return true;
    } catch (error) {
      logger.error('Error updating mental health metrics:', error);
      return false;
    }
  }
}

// Create singleton instance
const confidenceService = new ConfidenceService();

export default confidenceService;