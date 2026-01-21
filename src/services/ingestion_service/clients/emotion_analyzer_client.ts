import { ProcessedInputData, HumeDetectedEmotion } from '../models';

// Valence-Arousal mappings for Hume.ai emotions (circumplex model)
// Valence: -1.0 (negative) to 1.0 (positive)
// Arousal: 0.0 (calm) to 1.0 (excited/activated)
const EMOTION_VALENCE_AROUSAL: Record<string, { valence: number; arousal: number }> = {
  // Positive, high arousal
  admiration: { valence: 0.7, arousal: 0.5 },
  adoration: { valence: 0.9, arousal: 0.6 },
  amusement: { valence: 0.8, arousal: 0.7 },
  ecstasy: { valence: 1.0, arousal: 1.0 },
  enthusiasm: { valence: 0.8, arousal: 0.9 },
  excitement: { valence: 0.9, arousal: 0.95 },
  joy: { valence: 0.95, arousal: 0.8 },
  triumph: { valence: 0.85, arousal: 0.9 },

  // Positive, medium arousal
  aestheticAppreciation: { valence: 0.6, arousal: 0.3 },
  awe: { valence: 0.7, arousal: 0.6 },
  gratitude: { valence: 0.8, arousal: 0.4 },
  interest: { valence: 0.5, arousal: 0.5 },
  love: { valence: 0.95, arousal: 0.6 },
  pride: { valence: 0.75, arousal: 0.6 },
  romance: { valence: 0.85, arousal: 0.5 },

  // Positive, low arousal
  calmness: { valence: 0.6, arousal: 0.1 },
  contentment: { valence: 0.7, arousal: 0.2 },
  relief: { valence: 0.6, arousal: 0.2 },
  satisfaction: { valence: 0.7, arousal: 0.3 },

  // Neutral
  concentration: { valence: 0.1, arousal: 0.6 },
  contemplation: { valence: 0.2, arousal: 0.3 },
  determination: { valence: 0.3, arousal: 0.7 },
  entrancement: { valence: 0.3, arousal: 0.4 },
  neutral: { valence: 0.0, arousal: 0.3 },
  nostalgia: { valence: 0.1, arousal: 0.3 },
  realization: { valence: 0.2, arousal: 0.5 },

  // Negative, low arousal
  boredom: { valence: -0.3, arousal: 0.1 },
  disappointment: { valence: -0.5, arousal: 0.2 },
  doubt: { valence: -0.2, arousal: 0.3 },
  guilt: { valence: -0.6, arousal: 0.3 },
  sadness: { valence: -0.7, arousal: 0.2 },
  shame: { valence: -0.7, arousal: 0.3 },
  tiredness: { valence: -0.2, arousal: 0.05 },

  // Negative, medium arousal
  annoyance: { valence: -0.5, arousal: 0.5 },
  awkwardness: { valence: -0.3, arousal: 0.4 },
  confusion: { valence: -0.3, arousal: 0.5 },
  contempt: { valence: -0.6, arousal: 0.4 },
  craving: { valence: -0.2, arousal: 0.6 },
  disapproval: { valence: -0.5, arousal: 0.4 },
  embarrassment: { valence: -0.5, arousal: 0.5 },
  empathicPain: { valence: -0.6, arousal: 0.5 },
  envy: { valence: -0.6, arousal: 0.5 },
  sympathy: { valence: 0.3, arousal: 0.4 },

  // Negative, high arousal
  anger: { valence: -0.8, arousal: 0.9 },
  anxiety: { valence: -0.6, arousal: 0.8 },
  disgust: { valence: -0.7, arousal: 0.6 },
  distress: { valence: -0.8, arousal: 0.85 },
  fear: { valence: -0.8, arousal: 0.9 },
  horror: { valence: -0.9, arousal: 0.95 },
  pain: { valence: -0.9, arousal: 0.8 },

  // Surprise variants
  surprise: { valence: 0.1, arousal: 0.8 },
  surpriseNegative: { valence: -0.3, arousal: 0.8 },
  surprisePositive: { valence: 0.5, arousal: 0.8 },

  // Sexual/desire
  sexualDesire: { valence: 0.5, arousal: 0.7 },

  // Sarcasm (complex)
  sarcasm: { valence: -0.2, arousal: 0.5 },
};

// Hume.ai API configuration
// WebSocket for real-time (lower latency, better for conversations)
const HUME_WS_ENDPOINT = 'wss://api.hume.ai/v0/stream/models';
// Batch API for throughput
const HUME_BATCH_ENDPOINT = 'https://api.hume.ai/v0/batch/jobs';

interface HumeWsResponse {
  language?: {
    predictions: Array<{
      text: string;
      position?: { begin: number; end: number };
      emotions: Array<{
        name: string;
        score: number;
      }>;
    }>;
  };
  error?: string;
}

interface HumeBatchJobResponse {
  job_id: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Analyze text via Hume WebSocket API (real-time, low latency)
 */
async function analyzeViaHumeWebSocket(
  text: string,
  apiKey: string,
  timeoutMs: number = 10000
): Promise<HumeWsResponse | null> {
  // Dynamic import WebSocket for Node.js
  const { default: WebSocket } = await import('ws');

  return new Promise((resolve, reject) => {
    // Auth via query param (browsers don't support custom headers on WebSocket)
    const ws = new WebSocket(HUME_WS_ENDPOINT, {
      headers: {
        'X-Hume-Api-Key': apiKey,
      },
    });

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Hume WebSocket timeout'));
    }, timeoutMs);

    ws.on('open', () => {
      // Send text for language analysis
      ws.send(JSON.stringify({
        models: {
          language: {},
        },
        raw_text: true,
        data: text,
      }));
    });

    ws.on('message', (data: Buffer) => {
      clearTimeout(timeout);
      try {
        const response = JSON.parse(data.toString()) as HumeWsResponse;
        ws.close();
        resolve(response);
      } catch (e) {
        ws.close();
        reject(new Error('Failed to parse Hume response'));
      }
    });

    ws.on('error', (error: Error) => {
      clearTimeout(timeout);
      reject(error);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

/**
 * Analyze text via Hume Batch API (higher throughput)
 */
async function analyzeViaHumeBatch(
  text: string,
  apiKey: string
): Promise<Array<{ name: string; score: number }>> {
  // Start job
  const startResponse = await fetch(HUME_BATCH_ENDPOINT, {
    method: 'POST',
    headers: {
      'X-Hume-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      models: {
        language: {},
      },
      text: [text],
    }),
  });

  if (!startResponse.ok) {
    throw new Error(`Hume batch API error: ${startResponse.status}`);
  }

  const { job_id } = (await startResponse.json()) as HumeBatchJobResponse;

  // Poll for completion (max 30 seconds)
  const maxAttempts = 15;
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000);

    const statusResponse = await fetch(`${HUME_BATCH_ENDPOINT}/${job_id}`, {
      headers: { 'X-Hume-Api-Key': apiKey },
    });

    if (!statusResponse.ok) continue;

    const status = await statusResponse.json() as { state: { status: string } };
    if (status.state?.status === 'COMPLETED') {
      // Get predictions
      const predictionsResponse = await fetch(`${HUME_BATCH_ENDPOINT}/${job_id}/predictions`, {
        headers: { 'X-Hume-Api-Key': apiKey },
      });

      if (predictionsResponse.ok) {
        const predictions = await predictionsResponse.json() as Array<{
          results: {
            predictions: Array<{
              models: {
                language: {
                  grouped_predictions: Array<{
                    predictions: Array<{
                      emotions: Array<{ name: string; score: number }>;
                    }>;
                  }>;
                };
              };
            }>;
          };
        }>;

        // Extract emotions from nested structure
        const emotions: Array<{ name: string; score: number }> = [];
        for (const pred of predictions) {
          const langPreds = pred.results?.predictions?.[0]?.models?.language?.grouped_predictions;
          if (langPreds) {
            for (const group of langPreds) {
              for (const p of group.predictions) {
                emotions.push(...p.emotions);
              }
            }
          }
        }
        return emotions;
      }
    } else if (status.state?.status === 'FAILED') {
      throw new Error('Hume batch job failed');
    }
  }

  throw new Error('Hume batch job timed out');
}

export class EmotionAnalyzerClient {
  public logger = console;
  private minConfidence: number;
  private useHumeApi: boolean;

  constructor(options: { minConfidence?: number; useHumeApi?: boolean } = {}) {
    this.minConfidence = options.minConfidence ?? 0.1;
    this.useHumeApi = options.useHumeApi ?? !!process.env.HUME_API_KEY;
  }

  async analyze(content: string | object): Promise<Partial<ProcessedInputData['derivedEmotionalContext']>> {
    const text = typeof content === 'string' ? content : JSON.stringify(content);

    if (!text || text.trim().length === 0) {
      return {};
    }

    // Try Hume.ai API if configured
    if (this.useHumeApi) {
      try {
        const humeResult = await this.analyzeWithHume(text);
        if (humeResult && humeResult.detectedEmotionsHume && humeResult.detectedEmotionsHume.length > 0) {
          this.logger.info('[EmotionAnalyzer] Hume.ai analysis complete:', humeResult.dominantEmotion);
          return humeResult;
        }
      } catch (error) {
        this.logger.warn('[EmotionAnalyzer] Hume.ai analysis failed, falling back to pattern matching:', error);
      }
    }

    // Fallback to local pattern matching
    return this.analyzeWithPatterns(text);
  }

  private async analyzeWithHume(text: string): Promise<Partial<ProcessedInputData['derivedEmotionalContext']>> {
    const apiKey = process.env.HUME_API_KEY;
    if (!apiKey) {
      throw new Error('HUME_API_KEY not configured');
    }

    let emotions: Array<{ name: string; score: number }> = [];

    // Try WebSocket first (faster), fall back to batch
    try {
      const wsResponse = await analyzeViaHumeWebSocket(text, apiKey);
      if (wsResponse?.language?.predictions) {
        // Aggregate emotions from all predictions
        const emotionMap = new Map<string, number>();
        for (const pred of wsResponse.language.predictions) {
          for (const emotion of pred.emotions) {
            const current = emotionMap.get(emotion.name) || 0;
            emotionMap.set(emotion.name, Math.max(current, emotion.score));
          }
        }
        emotions = Array.from(emotionMap.entries()).map(([name, score]) => ({ name, score }));
      }
    } catch (wsError) {
      this.logger.warn('[EmotionAnalyzer] WebSocket failed, trying batch API:', wsError);

      // Fall back to batch API
      try {
        emotions = await analyzeViaHumeBatch(text, apiKey);
      } catch (batchError) {
        throw new Error(`Both Hume APIs failed: WS: ${wsError}, Batch: ${batchError}`);
      }
    }

    if (!emotions || emotions.length === 0) {
      return {};
    }

    // Filter by minimum confidence and transform to our format
    const detectedEmotionsHume: HumeDetectedEmotion[] = emotions
      .filter(e => e.score >= this.minConfidence)
      .map(e => ({
        name: e.name,
        score: e.score,
        evidence: { source: 'hume_api', text: text.substring(0, 100) },
      }))
      .sort((a, b) => b.score - a.score);

    if (detectedEmotionsHume.length === 0) {
      return {};
    }

    // Find dominant emotion (highest score)
    const dominant = detectedEmotionsHume[0];

    // Calculate weighted valence and arousal
    const { valence, arousal } = this.calculateWeightedValenceArousal(detectedEmotionsHume);

    return {
      detectedEmotionsHume,
      dominantEmotion: dominant.name,
      emotionalValence: valence,
      emotionalArousal: arousal,
    };
  }

  private analyzeWithPatterns(text: string): Partial<ProcessedInputData['derivedEmotionalContext']> {
    const lowerText = text.toLowerCase();
    const detectedEmotionsHume: HumeDetectedEmotion[] = [];

    // Pattern-based emotion detection (fallback when Hume.ai unavailable)
    const patterns: Array<{ pattern: RegExp; emotion: string; baseScore: number }> = [
      // Anger/Frustration
      { pattern: /\b(frustrated|frustrating|annoyed|annoying|angry|furious|pissed|mad)\b/gi, emotion: 'anger', baseScore: 0.7 },
      { pattern: /\b(hate|despise|loathe)\b/gi, emotion: 'contempt', baseScore: 0.75 },

      // Sadness
      { pattern: /\b(sad|unhappy|depressed|miserable|heartbroken|devastated)\b/gi, emotion: 'sadness', baseScore: 0.7 },
      { pattern: /\b(crying|tears|weeping)\b/gi, emotion: 'sadness', baseScore: 0.65 },

      // Fear/Anxiety
      { pattern: /\b(scared|afraid|terrified|anxious|worried|nervous|panic)\b/gi, emotion: 'fear', baseScore: 0.7 },
      { pattern: /\b(stress|stressed|overwhelmed)\b/gi, emotion: 'anxiety', baseScore: 0.65 },

      // Joy/Happiness
      { pattern: /\b(happy|joyful|excited|thrilled|delighted|ecstatic)\b/gi, emotion: 'joy', baseScore: 0.75 },
      { pattern: /\b(love|adore|cherish)\b/gi, emotion: 'love', baseScore: 0.8 },
      { pattern: /\b(grateful|thankful|appreciate)\b/gi, emotion: 'gratitude', baseScore: 0.7 },

      // Surprise
      { pattern: /\b(surprised|shocked|amazed|astonished|wow)\b/gi, emotion: 'surprise', baseScore: 0.65 },

      // Disgust
      { pattern: /\b(disgusted|gross|revolting|repulsive)\b/gi, emotion: 'disgust', baseScore: 0.7 },

      // Interest/Curiosity
      { pattern: /\b(interested|curious|fascinated|intrigued)\b/gi, emotion: 'interest', baseScore: 0.6 },

      // Low energy/tiredness
      { pattern: /\b(tired|exhausted|drained|fatigued)\b/gi, emotion: 'tiredness', baseScore: 0.6 },
      { pattern: /\b(bored|boring|tedious|monotonous)\b/gi, emotion: 'boredom', baseScore: 0.6 },

      // Distress signals (critical for care circle)
      { pattern: /\b(help|helpless|hopeless|worthless|alone|lonely)\b/gi, emotion: 'distress', baseScore: 0.8 },
      { pattern: /\b(can't go on|give up|end it|no point)\b/gi, emotion: 'distress', baseScore: 0.95 },
    ];

    for (const { pattern, emotion, baseScore } of patterns) {
      const matches = lowerText.match(pattern);
      if (matches) {
        // Score increases with more matches
        const matchBonus = Math.min(matches.length * 0.05, 0.2);
        const score = Math.min(baseScore + matchBonus, 1.0);

        // Check if we already have this emotion
        const existing = detectedEmotionsHume.find(e => e.name === emotion);
        if (existing) {
          existing.score = Math.max(existing.score, score);
          if (typeof existing.evidence === 'object' && existing.evidence !== null) {
            (existing.evidence as any).matches = [...((existing.evidence as any).matches || []), ...matches];
          }
        } else {
          detectedEmotionsHume.push({
            name: emotion,
            score,
            evidence: { source: 'pattern_matching', matches },
          });
        }
      }
    }

    if (detectedEmotionsHume.length === 0) {
      return {};
    }

    // Sort by score descending
    detectedEmotionsHume.sort((a, b) => b.score - a.score);

    const dominant = detectedEmotionsHume[0];
    const { valence, arousal } = this.calculateWeightedValenceArousal(detectedEmotionsHume);

    this.logger.info('[EmotionAnalyzer] Pattern-based analysis complete:', dominant.name);

    return {
      detectedEmotionsHume,
      dominantEmotion: dominant.name,
      emotionalValence: valence,
      emotionalArousal: arousal,
    };
  }

  private calculateWeightedValenceArousal(emotions: HumeDetectedEmotion[]): { valence: number; arousal: number } {
    let totalWeight = 0;
    let weightedValence = 0;
    let weightedArousal = 0;

    for (const emotion of emotions) {
      const va = EMOTION_VALENCE_AROUSAL[emotion.name.toLowerCase()] ?? EMOTION_VALENCE_AROUSAL['neutral'];
      const weight = emotion.score;

      weightedValence += va.valence * weight;
      weightedArousal += va.arousal * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) {
      return { valence: 0, arousal: 0.3 };
    }

    return {
      valence: Math.max(-1, Math.min(1, weightedValence / totalWeight)),
      arousal: Math.max(0, Math.min(1, weightedArousal / totalWeight)),
    };
  }
}