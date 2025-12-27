/**
 * @file Tests for Feature Extractor Service
 * Tests the LLM-based and heuristic feature extraction
 */

import {
  extractFeatures,
  extractFeaturesHeuristic,
  createMockLLMClient,
} from '../../../src/services/salience_service/feature_extractor';

import type { LLMClient } from '../../../src/services/salience_service/feature_extractor';

describe('Feature Extractor', () => {
  describe('extractFeaturesHeuristic', () => {
    it('should return empty features for empty text', () => {
      const features = extractFeaturesHeuristic('');

      expect(features.emotionalKeywords).toHaveLength(0);
      expect(features.peopleMentioned).toHaveLength(0);
      expect(features.moneyMentioned).toBe(false);
    });

    it('should detect emotional keywords', () => {
      const text = 'My grandmother died last week. I loved her so much.';
      const features = extractFeaturesHeuristic(text);

      expect(features.emotionalKeywords).toContain('died');
      expect(features.emotionalKeywords).toContain('loved');
    });

    it('should detect death-related keywords', () => {
      const text = 'She passed away peacefully at the funeral home.';
      const features = extractFeaturesHeuristic(text);

      expect(features.emotionalKeywords).toContain('passed away');
      expect(features.emotionalKeywords).toContain('funeral');
    });

    it('should detect positive emotional keywords', () => {
      const text = 'I am so excited and happy about this amazing opportunity!';
      const features = extractFeaturesHeuristic(text);

      expect(features.emotionalKeywords).toContain('excited');
      expect(features.emotionalKeywords).toContain('happy');
      expect(features.emotionalKeywords).toContain('amazing');
    });

    it('should detect negative emotional keywords', () => {
      const text = 'I am worried and scared about the terrible situation.';
      const features = extractFeaturesHeuristic(text);

      expect(features.emotionalKeywords).toContain('worried');
      expect(features.emotionalKeywords).toContain('scared');
      expect(features.emotionalKeywords).toContain('terrible');
    });

    it('should calculate positive sentiment for positive text', () => {
      const text = 'This is great and amazing! I feel happy and excited.';
      const features = extractFeaturesHeuristic(text);

      expect(features.sentimentScore).toBeGreaterThan(0);
    });

    it('should calculate negative sentiment for negative text', () => {
      const text = 'This is terrible and awful. I feel sad and angry.';
      const features = extractFeaturesHeuristic(text);

      expect(features.sentimentScore).toBeLessThan(0);
    });

    it('should calculate neutral sentiment for neutral text', () => {
      const text = 'The meeting is scheduled for tomorrow at 3pm.';
      const features = extractFeaturesHeuristic(text);

      expect(features.sentimentScore).toBe(0);
      expect(features.sentimentIntensity).toBe(0);
    });

    it('should detect money mentions', () => {
      const text = 'The project budget is $50,000 and we need to pay the vendor.';
      const features = extractFeaturesHeuristic(text);

      expect(features.moneyMentioned).toBe(true);
    });

    it('should detect money-related words', () => {
      const text = 'We need to discuss the salary and investment opportunities.';
      const features = extractFeaturesHeuristic(text);

      expect(features.moneyMentioned).toBe(true);
    });

    it('should not detect money when not mentioned', () => {
      const text = 'The weather is nice today.';
      const features = extractFeaturesHeuristic(text);

      expect(features.moneyMentioned).toBe(false);
    });

    it('should detect conflict presence', () => {
      const text = 'We had a big argument and there is a lot of tension.';
      const features = extractFeaturesHeuristic(text);

      expect(features.conflictPresent).toBe(true);
    });

    it('should detect disagreement as conflict', () => {
      const text = 'They strongly disagree with our approach.';
      const features = extractFeaturesHeuristic(text);

      expect(features.conflictPresent).toBe(true);
    });

    it('should detect intimacy signals', () => {
      const text = 'I love you and care about you deeply. I trust you completely.';
      const features = extractFeaturesHeuristic(text);

      expect(features.intimacySignals).toBe(true);
    });

    it('should detect vulnerability as intimacy', () => {
      const text = 'I feel vulnerable sharing my honest feelings with you.';
      const features = extractFeaturesHeuristic(text);

      expect(features.intimacySignals).toBe(true);
    });

    it('should detect relationship events - death', () => {
      const text = 'My uncle died last week after a long illness.';
      const features = extractFeaturesHeuristic(text);

      expect(features.relationshipEvents).toContain('death');
    });

    it('should detect relationship events - marriage', () => {
      const text = 'They got married at a beautiful wedding last summer.';
      const features = extractFeaturesHeuristic(text);

      expect(features.relationshipEvents).toContain('marriage');
    });

    it('should detect relationship events - birth', () => {
      const text = 'She is pregnant and the baby is due in March.';
      const features = extractFeaturesHeuristic(text);

      expect(features.relationshipEvents).toContain('birth');
    });

    it('should detect relationship events - promotion', () => {
      const text = 'He just got promoted to senior manager!';
      const features = extractFeaturesHeuristic(text);

      expect(features.relationshipEvents).toContain('promotion');
    });

    it('should detect relationship events - graduation', () => {
      const text = 'She graduated from medical school last week.';
      const features = extractFeaturesHeuristic(text);

      expect(features.relationshipEvents).toContain('graduation');
    });

    it('should detect relationship events - illness', () => {
      const text = 'He is sick with cancer and is in the hospital.';
      const features = extractFeaturesHeuristic(text);

      expect(features.relationshipEvents).toContain('illness');
    });

    it('should detect action items with reminder patterns', () => {
      const text = "I need to send the report. Don't forget to call Mom.";
      const features = extractFeaturesHeuristic(text);

      expect(features.actionItems.length).toBeGreaterThan(0);
      expect(features.actionItems[0].assignedTo).toBe('self');
    });

    it('should detect action items with will patterns', () => {
      const text = "I'll send you the document tomorrow.";
      const features = extractFeaturesHeuristic(text);

      expect(features.actionItems.length).toBeGreaterThan(0);
    });
  });

  describe('createMockLLMClient', () => {
    it('should create a functional mock client', () => {
      const mockClient = createMockLLMClient();

      expect(mockClient).toBeDefined();
      expect(typeof mockClient.complete).toBe('function');
    });

    it('should return valid JSON from mock client', async () => {
      const mockClient = createMockLLMClient();
      const response = await mockClient.complete('Test prompt');

      expect(() => JSON.parse(response)).not.toThrow();
    });
  });

  describe('extractFeatures with mock LLM', () => {
    let mockClient: LLMClient;

    beforeEach(() => {
      mockClient = createMockLLMClient();
    });

    it('should extract features from text', async () => {
      const text = 'Had a great meeting with John about the new project.';
      const features = await extractFeatures(text, mockClient);

      expect(features).toBeDefined();
      expect(features.emotionalKeywords).toBeDefined();
      expect(features.peopleMentioned).toBeDefined();
    });

    it('should handle emotional content', async () => {
      const text = 'I am so excited about this wonderful opportunity!';
      const features = await extractFeatures(text, mockClient);

      expect(features.emotionalKeywords.length).toBeGreaterThan(0);
    });

    it('should return empty features on error', async () => {
      const errorClient: LLMClient = {
        complete: async () => {
          throw new Error('API error');
        },
      };

      const features = await extractFeatures('Test text', errorClient);

      expect(features.emotionalKeywords).toHaveLength(0);
      expect(features.peopleMentioned).toHaveLength(0);
    });

    it('should handle invalid JSON response', async () => {
      const badClient: LLMClient = {
        complete: async () => 'not valid json',
      };

      const features = await extractFeatures('Test text', badClient);

      expect(features.emotionalKeywords).toHaveLength(0);
    });

    it('should strip markdown from response', async () => {
      const markdownClient: LLMClient = {
        complete: async () => '```json\n{"emotional_keywords": ["happy"]}\n```',
      };

      const features = await extractFeatures('I am happy', markdownClient);

      expect(features.emotionalKeywords).toContain('happy');
    });

    it('should use current date for resolving dates', async () => {
      const dateClient: LLMClient = {
        complete: async (prompt) => {
          expect(prompt).toContain('Current date for resolving relative dates:');
          return JSON.stringify({
            emotional_keywords: [],
            sentiment_score: 0,
            sentiment_intensity: 0,
            people_mentioned: [],
            relationship_events: [],
            topics: [],
            action_items: [],
            decisions: [],
            money_mentioned: false,
            conflict_present: false,
            intimacy_signals: false,
            commitments: [],
            dates_mentioned: [],
            questions_asked: [],
            requests_made: [],
            mutual_agreements: [],
          });
        },
      };

      await extractFeatures('Meeting tomorrow', dateClient);
    });
  });

  describe('feature transformation', () => {
    it('should transform action items correctly', async () => {
      const client: LLMClient = {
        complete: async () =>
          JSON.stringify({
            emotional_keywords: [],
            sentiment_score: 0,
            sentiment_intensity: 0,
            people_mentioned: [],
            relationship_events: [],
            topics: [],
            action_items: [
              { description: 'Send report', assigned_to: 'self', due_date: '2024-12-25' },
            ],
            decisions: [],
            money_mentioned: false,
            conflict_present: false,
            intimacy_signals: false,
            commitments: [],
            dates_mentioned: [],
            questions_asked: [],
            requests_made: [],
            mutual_agreements: [],
          }),
      };

      const features = await extractFeatures('I need to send the report', client);

      expect(features.actionItems).toHaveLength(1);
      expect(features.actionItems[0].description).toBe('Send report');
      expect(features.actionItems[0].assignedTo).toBe('self');
      expect(features.actionItems[0].dueDate).toBe('2024-12-25');
    });

    it('should transform commitments correctly', async () => {
      const client: LLMClient = {
        complete: async () =>
          JSON.stringify({
            emotional_keywords: [],
            sentiment_score: 0,
            sentiment_intensity: 0,
            people_mentioned: [],
            relationship_events: [],
            topics: [],
            action_items: [],
            decisions: [],
            money_mentioned: false,
            conflict_present: false,
            intimacy_signals: false,
            commitments: [
              {
                type: 'made',
                from: 'self',
                to: 'John',
                what: 'Send report',
                by_when: '2024-12-25',
                due_type: 'explicit',
              },
            ],
            dates_mentioned: [],
            questions_asked: [],
            requests_made: [],
            mutual_agreements: [],
          }),
      };

      const features = await extractFeatures('I promised John to send the report', client);

      expect(features.commitments).toHaveLength(1);
      expect(features.commitments[0].type).toBe('made');
      expect(features.commitments[0].what).toBe('Send report');
      expect(features.commitments[0].explicit).toBe(true);
    });

    it('should clamp sentiment values', async () => {
      const client: LLMClient = {
        complete: async () =>
          JSON.stringify({
            emotional_keywords: [],
            sentiment_score: 5, // Out of range
            sentiment_intensity: 10, // Out of range
            people_mentioned: [],
            relationship_events: [],
            topics: [],
            action_items: [],
            decisions: [],
            money_mentioned: false,
            conflict_present: false,
            intimacy_signals: false,
            commitments: [],
            dates_mentioned: [],
            questions_asked: [],
            requests_made: [],
            mutual_agreements: [],
          }),
      };

      const features = await extractFeatures('Test', client);

      expect(features.sentimentScore).toBeLessThanOrEqual(1);
      expect(features.sentimentScore).toBeGreaterThanOrEqual(-1);
      expect(features.sentimentIntensity).toBeLessThanOrEqual(1);
      expect(features.sentimentIntensity).toBeGreaterThanOrEqual(0);
    });

    it('should filter invalid relationship events', async () => {
      const client: LLMClient = {
        complete: async () =>
          JSON.stringify({
            emotional_keywords: [],
            sentiment_score: 0,
            sentiment_intensity: 0,
            people_mentioned: [],
            relationship_events: ['death', 'invalid_event', 'marriage'],
            topics: [],
            action_items: [],
            decisions: [],
            money_mentioned: false,
            conflict_present: false,
            intimacy_signals: false,
            commitments: [],
            dates_mentioned: [],
            questions_asked: [],
            requests_made: [],
            mutual_agreements: [],
          }),
      };

      const features = await extractFeatures('Test', client);

      expect(features.relationshipEvents).toContain('death');
      expect(features.relationshipEvents).toContain('marriage');
      expect(features.relationshipEvents).not.toContain('invalid_event');
    });
  });

  describe('text sanitization', () => {
    it('should handle very long text', async () => {
      const mockClient = createMockLLMClient();
      const longText = 'a'.repeat(20000);

      // Should not throw
      const features = await extractFeatures(longText, mockClient);
      expect(features).toBeDefined();
    });

    it('should handle special characters', async () => {
      const mockClient = createMockLLMClient();
      const specialText = 'Test with "quotes" and\nnewlines\tand\ttabs';

      const features = await extractFeatures(specialText, mockClient);
      expect(features).toBeDefined();
    });

    it('should handle unicode characters', async () => {
      const mockClient = createMockLLMClient();
      const unicodeText = 'Test with emoji 😀 and unicode café';

      const features = await extractFeatures(unicodeText, mockClient);
      expect(features).toBeDefined();
    });
  });
});
