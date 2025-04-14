import { IdentityService } from '../../src/services/identityService.js';
import mongoose from 'mongoose';

jest.mock('mongoose');

describe('IdentityService', () => {
  let identityService;
  let mockUser;

  beforeEach(() => {
    mockUser = {
      _id: 'test-user-id',
      passphrase: {
        hash: 'test-hash',
        salt: 'test-salt',
        iterations: 100000
      },
      preferences: {
        likes: ['cats', 'coding'],
        dislikes: ['spam', 'noise'],
        cares: ['environment', 'privacy'],
        wants: ['peace', 'quiet'],
        peeves: ['rudeness', 'lateness'],
        priorities: ['family', 'health']
      },
      memoryAccess: {
        allowedPatterns: ['*'],
        restrictedTopics: [],
        trustLevel: 1
      },
      lastInteraction: new Date(),
      interactionCount: 1,
      save: jest.fn().mockResolvedValue(true)
    };

    mongoose.Schema = jest.fn();
    mongoose.model = jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue(mockUser),
      findById: jest.fn().mockResolvedValue(mockUser),
      create: jest.fn().mockResolvedValue(mockUser)
    });

    identityService = new IdentityService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should authenticate user with valid passphrase', async () => {
      const user = await identityService.authenticateUser('valid-passphrase');
      expect(user).toBeDefined();
      expect(user.interactionCount).toBe(1);
      expect(user.save).toHaveBeenCalled();
    });

    it('should return null for invalid passphrase', async () => {
      identityService.User.findOne.mockResolvedValueOnce(null);
      const user = await identityService.authenticateUser('invalid-passphrase');
      expect(user).toBeNull();
    });

    it('should use cached user data when available', async () => {
      // First authentication
      await identityService.authenticateUser('test-passphrase');
      
      // Second authentication should use cache
      const user = await identityService.authenticateUser('test-passphrase');
      expect(user).toBeDefined();
      expect(identityService.User.findOne).toHaveBeenCalledTimes(1);
    });
  });

  describe('User Creation', () => {
    it('should create new user with passphrase and preferences', async () => {
      const preferences = {
        likes: ['music'],
        dislikes: ['noise'],
        priorities: ['health']
      };

      const user = await identityService.createUser('new-passphrase', preferences);
      expect(user).toBeDefined();
      expect(user.preferences.likes).toContain('music');
      expect(user.memoryAccess.trustLevel).toBe(1);
    });

    it('should handle user creation errors', async () => {
      identityService.User.create.mockRejectedValueOnce(new Error('DB Error'));
      const user = await identityService.createUser('new-passphrase');
      expect(user).toBeNull();
    });
  });

  describe('Preference Management', () => {
    it('should update user preferences', async () => {
      const newPreferences = {
        likes: ['dogs'],
        dislikes: ['rain']
      };

      const result = await identityService.updatePreferences('test-user-id', newPreferences);
      expect(result).toBe(true);
      expect(mockUser.preferences.likes).toContain('dogs');
    });

    it('should get user preferences', async () => {
      const preferences = await identityService.getPreferences('test-user-id');
      expect(preferences).toBeDefined();
      expect(preferences.likes).toContain('cats');
      expect(preferences.dislikes).toContain('spam');
    });

    it('should handle missing user for preference updates', async () => {
      identityService.User.findById.mockResolvedValueOnce(null);
      const result = await identityService.updatePreferences('invalid-id', {});
      expect(result).toBe(false);
    });
  });

  describe('Memory Access', () => {
    it('should validate allowed memory access patterns', async () => {
      const result = await identityService.validateMemoryAccess('test-user-id', 'test-pattern');
      expect(result).toBe(true);
    });

    it('should handle restricted patterns', async () => {
      mockUser.memoryAccess.allowedPatterns = ['safe-*'];
      const result = await identityService.validateMemoryAccess('test-user-id', 'unsafe-pattern');
      expect(result).toBe(false);
    });

    it('should update trust level within bounds', async () => {
      const result = await identityService.updateTrustLevel('test-user-id', 5);
      expect(result).toBe(true);
      expect(mockUser.memoryAccess.trustLevel).toBe(5);
    });

    it('should enforce trust level bounds', async () => {
      await identityService.updateTrustLevel('test-user-id', 15);
      expect(mockUser.memoryAccess.trustLevel).toBe(10);

      await identityService.updateTrustLevel('test-user-id', 0);
      expect(mockUser.memoryAccess.trustLevel).toBe(1);
    });
  });

  describe('Passphrase Hashing', () => {
    it('should generate different salt for each hash', async () => {
      const result1 = await identityService.hashPassphrase('test-passphrase');
      const result2 = await identityService.hashPassphrase('test-passphrase');
      
      expect(result1.salt).not.toBe(result2.salt);
      expect(result1.hash).not.toBe(result2.hash);
    });

    it('should use configured iteration count', async () => {
      const result = await identityService.hashPassphrase('test-passphrase');
      expect(result.hash).toBeDefined();
      expect(result.salt).toBeDefined();
    });
  });
});