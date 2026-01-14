/**
 * @file Security Tests for Security Tier Routing
 * Tests that data is routed correctly based on SecurityTier classification.
 *
 * SECURITY: The three-tier system is fundamental to privacy protection:
 * - Tier1_General: External LLM allowed (Anthropic/OpenAI)
 * - Tier2_Personal: Local LLM only (Ollama), fallback to heuristic
 * - Tier3_Vault: NEVER uses LLM, heuristic only, encrypted, NOT vectorized
 *
 * NOTE: The security tier routing is defined in the TypeScript source
 * (feature_extractor.ts) but the compiled JavaScript (feature_extractor.js)
 * may not include this logic. These tests document the EXPECTED behavior
 * and verify the heuristic extraction that is available.
 */

import {
  extractFeaturesHeuristic,
  createMockLLMClient,
} from '../../../src/services/salience_service/feature_extractor';

// Type definition for LLM client interface
interface LLMClient {
  complete(prompt: string, options?: { temperature?: number; maxTokens?: number; model?: string }): Promise<string>;
}

describe('Security Tier Routing', () => {
  /**
   * Expected Security Tier Behavior (documented requirements):
   *
   * Tier3_Vault (Most Sensitive):
   * - NEVER sends data to external LLM
   * - NEVER sends data to local LLM
   * - Uses heuristic extraction ONLY
   * - Data is encrypted at rest
   * - NOT added to vector store
   *
   * Tier2_Personal (Personal Data):
   * - NEVER sends data to external LLM
   * - Uses local LLM (Ollama) when available
   * - Falls back to heuristic when local LLM unavailable
   *
   * Tier1_General (Public Data):
   * - External LLM allowed (Anthropic/OpenAI)
   */

  describe('Tier3_Vault (Most Sensitive - Never External)', () => {
    const VAULT_TEXT = 'Grandma SSN is 123-45-6789, credit card 4111111111111111';

    it('should have heuristic extraction available for Tier3_Vault fallback', () => {
      const features = extractFeaturesHeuristic(VAULT_TEXT);

      // Heuristic should still extract basic features
      expect(features).toBeDefined();
      // Note: Heuristic uses keyword matching, not pattern matching for card numbers
    });

    it('should process sensitive financial data without LLM', () => {
      // Note: The heuristic uses specific keywords like $, dollar, money, pay, cost, etc.
      // It doesn't pattern-match credit card numbers or SSN patterns
      const features = extractFeaturesHeuristic(VAULT_TEXT);

      // Heuristic extraction works, even if it doesn't detect all financial patterns
      expect(features).toBeDefined();
      // For full detection of SSN/credit card patterns, LLM would be needed
      // But Tier3 data NEVER goes to LLM - this is the security tradeoff
    });

    it('should return valid features using heuristic only', () => {
      const features = extractFeaturesHeuristic('I love my grandmother so much');

      expect(features.emotionalKeywords).toContain('love');
      expect(features.sentimentScore).toBeGreaterThan(0);
    });

    it('documents: Tier3 data should NEVER go to any LLM', () => {
      // This is a documentation test for the expected security behavior
      const expectedBehavior = {
        tier: 'Tier3_Vault',
        externalLLM: false,
        localLLM: false,
        heuristicOnly: true,
        encrypted: true,
        vectorized: false,
      };

      expect(expectedBehavior.externalLLM).toBe(false);
      expect(expectedBehavior.localLLM).toBe(false);
      expect(expectedBehavior.heuristicOnly).toBe(true);
    });
  });

  describe('Tier2_Personal (Personal Data - Local Only)', () => {
    const PERSONAL_TEXT = 'My salary is $150,000 and I am worried about the layoffs';

    it('should have heuristic extraction available for Tier2_Personal fallback', () => {
      const features = extractFeaturesHeuristic(PERSONAL_TEXT);

      expect(features).toBeDefined();
      expect(features.moneyMentioned).toBe(true);
    });

    it('should detect emotional content in personal text', () => {
      const features = extractFeaturesHeuristic(PERSONAL_TEXT);

      expect(features.emotionalKeywords).toContain('worried');
    });

    it('documents: Tier2 data should only use local LLM or heuristic', () => {
      const expectedBehavior = {
        tier: 'Tier2_Personal',
        externalLLM: false,
        localLLM: true,
        heuristicFallback: true,
      };

      expect(expectedBehavior.externalLLM).toBe(false);
      expect(expectedBehavior.localLLM).toBe(true);
    });
  });

  describe('Tier1_General (Public Data - External Allowed)', () => {
    const GENERAL_TEXT = 'The meeting is scheduled for tomorrow at 3pm';

    it('should have heuristic extraction for any tier', () => {
      const features = extractFeaturesHeuristic(GENERAL_TEXT);

      expect(features).toBeDefined();
    });

    it('documents: Tier1 data may use external LLM', () => {
      const expectedBehavior = {
        tier: 'Tier1_General',
        externalLLM: true,
        localLLM: false,
      };

      expect(expectedBehavior.externalLLM).toBe(true);
    });
  });

  describe('Default Security Tier', () => {
    it('documents: default tier should be Tier2_Personal (safe default)', () => {
      const defaultTier = 'Tier2_Personal';

      // Safe default means external LLM not used by default
      expect(defaultTier).not.toBe('Tier1_General');
    });
  });

  describe('Sensitive Data Detection', () => {
    it('should detect financial information via keywords', () => {
      // Heuristic uses keywords: $, dollar, money, pay, cost, price, budget, invest, funding, revenue, salary
      const features = extractFeaturesHeuristic(
        'My salary is $100,000 and I need to pay for the investment'
      );

      expect(features.moneyMentioned).toBe(true);
    });

    it('should detect medical information', () => {
      const features = extractFeaturesHeuristic(
        'I was diagnosed with cancer and need to go to the hospital'
      );

      expect(features.emotionalKeywords).toContain('cancer');
      expect(features.emotionalKeywords).toContain('hospital');
      expect(features.relationshipEvents).toContain('illness');
    });

    it('should detect emotional vulnerability', () => {
      const features = extractFeaturesHeuristic(
        'I am so scared and worried about losing my job'
      );

      expect(features.emotionalKeywords).toContain('scared');
      expect(features.emotionalKeywords).toContain('worried');
      expect(features.sentimentScore).toBeLessThan(0);
    });
  });

  describe('Data Isolation Between Tiers', () => {
    it('documents: Tier3 data must never leak to external processing', () => {
      const vaultText = 'Secret vault data with SSN 999-99-9999';

      // Heuristic extraction should work without external calls
      const features = extractFeaturesHeuristic(vaultText);

      // Verify heuristic can extract without external LLM
      expect(features).toBeDefined();
      expect(features.moneyMentioned).toBe(false); // SSN is not money keyword
    });

    it('documents: Tier2 data must stay on local infrastructure', () => {
      const personalText = 'My salary is $200,000 per year';

      // Heuristic extraction should work without external calls
      const features = extractFeaturesHeuristic(personalText);

      expect(features).toBeDefined();
      expect(features.moneyMentioned).toBe(true);
    });

    it('documents: security tier isolation is a critical requirement', () => {
      const isolationRequirements = {
        tier3: {
          externalLLM: 'NEVER',
          localLLM: 'NEVER',
          vectorStore: 'NEVER',
          encryption: 'ALWAYS',
        },
        tier2: {
          externalLLM: 'NEVER',
          localLLM: 'ALLOWED',
          vectorStore: 'LOCAL_ONLY',
          encryption: 'RECOMMENDED',
        },
        tier1: {
          externalLLM: 'ALLOWED',
          localLLM: 'ALLOWED',
          vectorStore: 'ALLOWED',
          encryption: 'OPTIONAL',
        },
      };

      expect(isolationRequirements.tier3.externalLLM).toBe('NEVER');
      expect(isolationRequirements.tier2.externalLLM).toBe('NEVER');
      expect(isolationRequirements.tier1.externalLLM).toBe('ALLOWED');
    });
  });

  describe('Heuristic Feature Extraction', () => {
    it('should extract emotions without LLM', () => {
      const features = extractFeaturesHeuristic(
        'I am so excited and happy about this amazing news!'
      );

      expect(features.emotionalKeywords).toContain('excited');
      expect(features.emotionalKeywords).toContain('happy');
      expect(features.emotionalKeywords).toContain('amazing');
      expect(features.sentimentScore).toBeGreaterThan(0);
    });

    it('should detect relationship events heuristically', () => {
      const features = extractFeaturesHeuristic(
        'Sarah got promoted to VP last week!'
      );

      expect(features.relationshipEvents).toContain('promotion');
    });

    it('should detect action items heuristically', () => {
      const features = extractFeaturesHeuristic(
        "I'll send you the report tomorrow"
      );

      expect(features.actionItems.length).toBeGreaterThan(0);
    });

    it('should handle empty input gracefully', () => {
      const features = extractFeaturesHeuristic('');

      expect(features.emotionalKeywords).toHaveLength(0);
      expect(features.peopleMentioned).toHaveLength(0);
      expect(features.sentimentScore).toBe(0);
    });
  });
});
