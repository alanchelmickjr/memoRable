import { logger } from '../utils/logger.js';
import mongoose from 'mongoose';
import crypto from 'crypto';

export class IdentityService {
  constructor() {
    this.userSchema = new mongoose.Schema({
      passphrase: {
        hash: String,
        salt: String,
        iterations: Number
      },
      preferences: {
        likes: [String],
        dislikes: [String],
        cares: [String],
        wants: [String],
        peeves: [String],
        priorities: [String]
      },
      memoryAccess: {
        allowedPatterns: [String],
        restrictedTopics: [String],
        trustLevel: Number
      },
      lastInteraction: Date,
      interactionCount: Number
    });

    this.User = mongoose.model('User', this.userSchema);
    this.activeUsers = new Map(); // In-memory cache of active users
    this.PBKDF2_ITERATIONS = 100000;
  }

  async authenticateUser(passphrase) {
    try {
      // Check in-memory cache first
      if (this.activeUsers.has(passphrase)) {
        const cached = this.activeUsers.get(passphrase);
        if (Date.now() - cached.timestamp < 3600000) { // 1 hour cache
          return cached.user;
        }
        this.activeUsers.delete(passphrase);
      }

      // Find user by passphrase hash
      const { hash, salt } = await this.hashPassphrase(passphrase);
      const user = await this.User.findOne({ 'passphrase.hash': hash });

      if (!user) {
        logger.warn('Authentication failed: User not found');
        return null;
      }

      // Update interaction metrics
      user.lastInteraction = new Date();
      user.interactionCount += 1;
      await user.save();

      // Cache for future requests
      this.activeUsers.set(passphrase, {
        user,
        timestamp: Date.now()
      });

      return user;
    } catch (error) {
      logger.error('Authentication error:', error);
      return null;
    }
  }

  async createUser(passphrase, initialPreferences = {}) {
    try {
      const { hash, salt } = await this.hashPassphrase(passphrase);

      const user = await this.User.create({
        passphrase: {
          hash,
          salt,
          iterations: this.PBKDF2_ITERATIONS
        },
        preferences: {
          likes: initialPreferences.likes || [],
          dislikes: initialPreferences.dislikes || [],
          cares: initialPreferences.cares || [],
          wants: initialPreferences.wants || [],
          peeves: initialPreferences.peeves || [],
          priorities: initialPreferences.priorities || []
        },
        memoryAccess: {
          allowedPatterns: ['*'],
          restrictedTopics: [],
          trustLevel: 1
        },
        lastInteraction: new Date(),
        interactionCount: 1
      });

      logger.info('New user created');
      return user;
    } catch (error) {
      logger.error('Error creating user:', error);
      return null;
    }
  }

  async hashPassphrase(passphrase) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await new Promise((resolve, reject) => {
      crypto.pbkdf2(
        passphrase,
        salt,
        this.PBKDF2_ITERATIONS,
        64,
        'sha512',
        (err, derivedKey) => {
          if (err) reject(err);
          resolve(derivedKey.toString('hex'));
        }
      );
    });

    return { hash, salt };
  }

  async updatePreferences(userId, preferences) {
    try {
      const user = await this.User.findById(userId);
      if (!user) {
        logger.warn('User not found for preference update');
        return false;
      }

      // Update only provided preferences
      Object.keys(preferences).forEach(key => {
        if (user.preferences[key]) {
          user.preferences[key] = [
            ...new Set([...user.preferences[key], ...preferences[key]])
          ];
        }
      });

      await user.save();
      return true;
    } catch (error) {
      logger.error('Error updating preferences:', error);
      return false;
    }
  }

  async getPreferences(userId) {
    try {
      const user = await this.User.findById(userId);
      return user ? user.preferences : null;
    } catch (error) {
      logger.error('Error fetching preferences:', error);
      return null;
    }
  }

  async validateMemoryAccess(userId, pattern) {
    try {
      const user = await this.User.findById(userId);
      if (!user) return false;

      // Check if pattern matches any allowed patterns
      return user.memoryAccess.allowedPatterns.some(allowed => {
        if (allowed === '*') return true;
        const regex = new RegExp(allowed.replace('*', '.*'));
        return regex.test(pattern);
      });
    } catch (error) {
      logger.error('Error validating memory access:', error);
      return false;
    }
  }

  async updateTrustLevel(userId, newLevel) {
    try {
      const user = await this.User.findById(userId);
      if (!user) return false;

      user.memoryAccess.trustLevel = Math.max(1, Math.min(10, newLevel));
      await user.save();
      return true;
    } catch (error) {
      logger.error('Error updating trust level:', error);
      return false;
    }
  }
}

// Create singleton instance
const identityService = new IdentityService();

export default identityService;