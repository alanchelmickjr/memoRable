import { EmotionAnalyzerClient } from '../../../src/services/ingestion_service/clients/emotion_analyzer_client';

describe('EmotionAnalyzerClient', () => {
  let client: EmotionAnalyzerClient;

  beforeEach(() => {
    client = new EmotionAnalyzerClient({ useHumeApi: false });
  });

  describe('analyze', () => {
    it('should return empty result for empty text', async () => {
      const result = await client.analyze('');
      expect(Object.keys(result!).length).toBe(0);
    });

    it('should detect anger/frustration', async () => {
      const result = await client.analyze('I am so frustrated with this situation!');

      expect(result!.detectedEmotionsHume).toBeDefined();
      expect(result!.detectedEmotionsHume?.length).toBeGreaterThan(0);
      expect(result!.dominantEmotion).toBe('anger');
      expect(result!.emotionalValence).toBeLessThan(0);
      expect(result!.emotionalArousal).toBeGreaterThan(0.5);
    });

    it('should detect joy/happiness', async () => {
      const result = await client.analyze('I am so happy and thrilled about this news!');

      expect(result!.detectedEmotionsHume).toBeDefined();
      expect(result!.dominantEmotion).toBe('joy');
      expect(result!.emotionalValence).toBeGreaterThan(0.5);
      expect(result!.emotionalArousal).toBeGreaterThan(0.5);
    });

    it('should detect sadness', async () => {
      const result = await client.analyze('I feel so sad and heartbroken today.');

      expect(result!.detectedEmotionsHume).toBeDefined();
      expect(result!.dominantEmotion).toBe('sadness');
      expect(result!.emotionalValence).toBeLessThan(-0.3);
      expect(result!.emotionalArousal).toBeLessThan(0.5);
    });

    it('should detect fear/anxiety', async () => {
      const result = await client.analyze('I am really scared and anxious about tomorrow.');

      expect(result!.detectedEmotionsHume).toBeDefined();
      expect(result!.emotionalValence).toBeLessThan(0);
      expect(result!.emotionalArousal).toBeGreaterThan(0.6);
    });

    it('should detect distress signals (critical for care circle)', async () => {
      const result = await client.analyze('I feel so helpless and hopeless, like there is no point.');

      expect(result!.detectedEmotionsHume).toBeDefined();
      expect(result!.dominantEmotion).toBe('distress');
      expect(result!.detectedEmotionsHume?.[0].score).toBeGreaterThan(0.8);
      expect(result!.emotionalValence).toBeLessThan(-0.5);
      expect(result!.emotionalArousal).toBeGreaterThan(0.7);
    });

    it('should detect multiple emotions and weight them', async () => {
      const result = await client.analyze('I am frustrated but also curious about why this happened.');

      expect(result!.detectedEmotionsHume).toBeDefined();
      expect(result!.detectedEmotionsHume?.length).toBeGreaterThan(1);

      const emotions = result!.detectedEmotionsHume?.map(e => e.name) ?? [];
      expect(emotions).toContain('anger');
      expect(emotions).toContain('interest');
    });

    it('should handle object input by serializing to JSON', async () => {
      const result = await client.analyze({ message: 'I am happy' });

      expect(result!.detectedEmotionsHume).toBeDefined();
      expect(result!.dominantEmotion).toBe('joy');
    });

    it('should provide evidence for pattern matches', async () => {
      const result = await client.analyze('I love this project!');

      expect(result!.detectedEmotionsHume).toBeDefined();
      expect(result!.detectedEmotionsHume?.[0].evidence).toBeDefined();
      const evidence = result!.detectedEmotionsHume?.[0].evidence as { source: string; matches: string[] };
      expect(evidence.source).toBe('pattern_matching');
      expect(evidence.matches).toContain('love');
    });

    it('should return empty for neutral text without emotional keywords', async () => {
      const result = await client.analyze('The weather is 72 degrees today.');
      expect(result!.detectedEmotionsHume).toBeUndefined();
    });
  });

  describe('valence and arousal calculations', () => {
    it('should calculate valence between -1 and 1', async () => {
      const result = await client.analyze('I am extremely angry and furious!');

      expect(result!.emotionalValence).toBeDefined();
      expect(result!.emotionalValence).toBeGreaterThanOrEqual(-1);
      expect(result!.emotionalValence).toBeLessThanOrEqual(1);
    });

    it('should calculate arousal between 0 and 1', async () => {
      const result = await client.analyze('I feel so tired and bored.');

      expect(result!.emotionalArousal).toBeDefined();
      expect(result!.emotionalArousal).toBeGreaterThanOrEqual(0);
      expect(result!.emotionalArousal).toBeLessThanOrEqual(1);
    });

    it('should have low arousal for calm emotions', async () => {
      const result = await client.analyze('I feel sad today.');
      expect(result!.emotionalArousal).toBeLessThan(0.5);
    });

    it('should have high arousal for excited emotions', async () => {
      const result = await client.analyze('I am so excited and thrilled!');
      expect(result!.emotionalArousal).toBeGreaterThan(0.6);
    });
  });
});
