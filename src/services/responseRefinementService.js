import { logger } from '../utils/logger.js';
import identityService from './identityService.js';
import modelSelectionService from './modelSelectionService.js';
import mongoose from 'mongoose';

export class ResponseRefinementService {
  constructor() {
    this.responseSchema = new mongoose.Schema({
      userId: mongoose.Schema.Types.ObjectId,
      originalResponse: String,
      refinedResponse: String,
      context: {
        messageStream: [String],
        timestamp: Date,
        preferences: Object
      },
      refinements: [{
        type: String, // 'pattern', 'preference', 'retraction', 'improvement'
        reason: String,
        timestamp: Date
      }],
      status: {
        type: String,
        enum: ['active', 'retracted', 'updated'],
        default: 'active'
      }
    });

    this.Response = mongoose.model('Response', this.responseSchema);
    this.activeResponses = new Map(); // Track responses that might be updated
    this.responseWindow = 300000; // 5-minute window for possible updates
  }

  async refineResponse(userId, originalResponse, messageStream) {
    try {
      const user = await identityService.getPreferences(userId);
      if (!user) {
        logger.warn('User preferences not found for response refinement');
        return originalResponse;
      }

      let refinedResponse = originalResponse;
      const refinements = [];

      // Quick preference filtering
      refinedResponse = await this.applyPreferenceFilters(
        refinedResponse,
        user.preferences,
        refinements
      );

      // Apply learned patterns
      refinedResponse = await this.applyLearnedPatterns(
        refinedResponse,
        messageStream,
        refinements
      );

      // Store response for possible updates
      const response = await this.Response.create({
        userId,
        originalResponse,
        refinedResponse,
        context: {
          messageStream,
          timestamp: new Date(),
          preferences: user.preferences
        },
        refinements
      });

      this.activeResponses.set(response._id.toString(), {
        response,
        timestamp: Date.now()
      });

      // Clean up old responses
      this.cleanupOldResponses();

      return {
        responseId: response._id,
        content: refinedResponse,
        refinements
      };
    } catch (error) {
      logger.error('Error refining response:', error);
      return { content: originalResponse, refinements: [] };
    }
  }

  async applyPreferenceFilters(response, preferences, refinements) {
    let refined = response;

    // Quick check against likes/dislikes
    for (const like of preferences.likes) {
      if (response.toLowerCase().includes(like.toLowerCase())) {
        refinements.push({
          type: 'preference',
          reason: `Reinforced positive preference: ${like}`,
          timestamp: new Date()
        });
      }
    }

    for (const dislike of preferences.dislikes) {
      if (response.toLowerCase().includes(dislike.toLowerCase())) {
        refined = refined.replace(
          new RegExp(dislike, 'gi'),
          '[FILTERED]'
        );
        refinements.push({
          type: 'preference',
          reason: `Filtered negative preference: ${dislike}`,
          timestamp: new Date()
        });
      }
    }

    // Check against peeves
    for (const peeve of preferences.peeves) {
      if (response.toLowerCase().includes(peeve.toLowerCase())) {
        refined = refined.replace(
          new RegExp(peeve, 'gi'),
          '[ADJUSTED]'
        );
        refinements.push({
          type: 'preference',
          reason: `Adjusted for user peeve: ${peeve}`,
          timestamp: new Date()
        });
      }
    }

    return refined;
  }

  async applyLearnedPatterns(response, messageStream, refinements) {
    try {
      // Get cached response if similar pattern exists
      const cachedResponse = await modelSelectionService.getMemoizedResponse(
        messageStream[messageStream.length - 1], // Last message
        'response-refinement',
        'pattern-matching'
      );

      if (cachedResponse) {
        refinements.push({
          type: 'pattern',
          reason: 'Applied learned response pattern',
          timestamp: new Date()
        });
        return cachedResponse;
      }

      // If no cache hit, store this response for future pattern matching
      await modelSelectionService.memoizeResponse(
        messageStream[messageStream.length - 1],
        response,
        'response-refinement',
        'pattern-matching',
        0.8 // High criticality for response patterns
      );

      return response;
    } catch (error) {
      logger.error('Error applying learned patterns:', error);
      return response;
    }
  }

  async updateResponse(responseId, newContent, reason) {
    try {
      const activeResponse = this.activeResponses.get(responseId);
      if (!activeResponse) {
        logger.warn('Response not found or outside update window');
        return false;
      }

      const response = await this.Response.findById(responseId);
      if (!response) return false;

      // Mark current response as updated
      response.status = 'updated';
      response.refinedResponse = newContent;
      response.refinements.push({
        type: 'improvement',
        reason,
        timestamp: new Date()
      });

      await response.save();

      // Update cache with improved response
      await modelSelectionService.memoizeResponse(
        response.context.messageStream[response.context.messageStream.length - 1],
        newContent,
        'response-refinement',
        'pattern-matching',
        0.9 // Higher criticality for improvements
      );

      return true;
    } catch (error) {
      logger.error('Error updating response:', error);
      return false;
    }
  }

  async retractResponse(responseId, reason) {
    try {
      const response = await this.Response.findById(responseId);
      if (!response) return false;

      response.status = 'retracted';
      response.refinements.push({
        type: 'retraction',
        reason,
        timestamp: new Date()
      });

      await response.save();
      this.activeResponses.delete(responseId);

      return true;
    } catch (error) {
      logger.error('Error retracting response:', error);
      return false;
    }
  }

  cleanupOldResponses() {
    const now = Date.now();
    for (const [id, data] of this.activeResponses.entries()) {
      if (now - data.timestamp > this.responseWindow) {
        this.activeResponses.delete(id);
      }
    }
  }

  async getResponseHistory(userId) {
    try {
      return await this.Response.find({
        userId,
        timestamp: { $gte: new Date(Date.now() - 86400000) } // Last 24 hours
      }).sort({ timestamp: -1 });
    } catch (error) {
      logger.error('Error fetching response history:', error);
      return [];
    }
  }
}

// Create singleton instance
const responseRefinementService = new ResponseRefinementService();

export default responseRefinementService;