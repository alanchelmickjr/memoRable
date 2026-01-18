/**
 * Continual Learning for Pattern Recognition
 *
 * Based on Mirzadeh et al. (2022) "Architecture Matters in Continual Learning":
 *
 * Key architectural recommendations:
 * - Width > Depth (3-4 layers, 512-1024 units)
 * - Replace BatchNorm with LayerNorm (BN running stats bias toward current task)
 * - Avoid aggressive Global Average Pooling (loses task-discriminative features)
 *
 * Anti-forgetting techniques:
 * - Elastic Weight Consolidation (EWC) - protect important weights
 * - Experience Replay - reservoir sampling for memory-efficient replay
 *
 * Libraries (for production):
 * - Avalanche (avalanche-lib) - comprehensive CL framework
 * - Continuum - data loading/scenario management
 * - CL-Gym - training regime experimentation
 */

import type {
  ContinualLearningConfig,
  ReplaySample,
  EWCState,
  ContinualLearningMetrics,
} from './types';

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CL_CONFIG: ContinualLearningConfig = {
  replayBufferSize: 5000,
  ewcLambda: 100,
  fisherSamples: 200,
  architecture: {
    inputDim: 1024,
    hiddenDim: 512,
    layers: 3,
    patternTypes: 32,
  },
};

// ============================================================================
// Replay Buffer (Reservoir Sampling)
// ============================================================================

/**
 * Memory-efficient experience replay using reservoir sampling
 * Maintains a fixed-size buffer that represents the full data distribution
 */
export class ReplayBuffer {
  private buffer: ReplaySample[] = [];
  private maxSize: number;
  private nSeen: number = 0;

  constructor(maxSize: number = 5000) {
    this.maxSize = maxSize;
  }

  /**
   * Add sample using reservoir sampling
   * Guarantees uniform sampling from all seen samples
   */
  add(input: Float32Array, target: Float32Array, taskId: string): void {
    this.nSeen++;

    const sample: ReplaySample = {
      input: new Float32Array(input), // Clone to avoid mutation
      target: new Float32Array(target),
      taskId,
      timestamp: new Date(),
    };

    if (this.buffer.length < this.maxSize) {
      this.buffer.push(sample);
    } else {
      // Reservoir sampling: replace with probability maxSize/nSeen
      const idx = Math.floor(Math.random() * this.nSeen);
      if (idx < this.maxSize) {
        this.buffer[idx] = sample;
      }
    }
  }

  /**
   * Sample a batch from the buffer
   */
  sample(batchSize: number): ReplaySample[] {
    const size = Math.min(batchSize, this.buffer.length);
    const indices = new Set<number>();

    while (indices.size < size) {
      indices.add(Math.floor(Math.random() * this.buffer.length));
    }

    return Array.from(indices).map((i) => this.buffer[i]);
  }

  /**
   * Get buffer statistics
   */
  getStats(): { size: number; maxSize: number; totalSeen: number; taskDistribution: Record<string, number> } {
    const taskDistribution: Record<string, number> = {};

    for (const sample of this.buffer) {
      taskDistribution[sample.taskId] = (taskDistribution[sample.taskId] || 0) + 1;
    }

    return {
      size: this.buffer.length,
      maxSize: this.maxSize,
      totalSeen: this.nSeen,
      taskDistribution,
    };
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = [];
    this.nSeen = 0;
  }

  /**
   * Serialize for persistence
   */
  toJSON(): { samples: Array<{ input: number[]; target: number[]; taskId: string; timestamp: string }>; nSeen: number } {
    return {
      samples: this.buffer.map((s) => ({
        input: Array.from(s.input),
        target: Array.from(s.target),
        taskId: s.taskId,
        timestamp: s.timestamp.toISOString(),
      })),
      nSeen: this.nSeen,
    };
  }

  /**
   * Restore from persistence
   */
  static fromJSON(data: ReturnType<ReplayBuffer['toJSON']>, maxSize: number): ReplayBuffer {
    const buffer = new ReplayBuffer(maxSize);
    buffer.nSeen = data.nSeen;

    for (const sample of data.samples) {
      buffer.buffer.push({
        input: new Float32Array(sample.input),
        target: new Float32Array(sample.target),
        taskId: sample.taskId,
        timestamp: new Date(sample.timestamp),
      });
    }

    return buffer;
  }
}

// ============================================================================
// Elastic Weight Consolidation (EWC)
// ============================================================================

/**
 * EWC Regularizer for anti-forgetting
 *
 * Core idea: Penalize changes to weights that are important for previous tasks.
 * Importance is measured by the Fisher Information Matrix diagonal.
 *
 * Loss = L_current + λ * Σ F_i * (θ_i - θ*_i)²
 *
 * Where:
 * - F_i = Fisher Information for weight i
 * - θ*_i = Optimal weights from previous task
 * - λ = Regularization strength (default 100)
 */
export class EWCRegularizer {
  private savedParams: Map<string, Float32Array> = new Map();
  private fisher: Map<string, Float32Array> = new Map();
  private lambda: number;
  private taskCount: number = 0;

  constructor(lambda: number = 100) {
    this.lambda = lambda;
  }

  /**
   * Compute Fisher Information Matrix diagonal using empirical estimate
   *
   * F_i ≈ E[(∂L/∂θ_i)²]
   *
   * @param params Current model parameters by name
   * @param gradientFn Function that returns gradients for a sample
   * @param numSamples Number of samples for estimation
   */
  computeFisher(
    params: Map<string, Float32Array>,
    gradientFn: () => Map<string, Float32Array>,
    numSamples: number = 200
  ): void {
    // Initialize Fisher to zeros
    this.fisher.clear();
    for (const [name, param] of params) {
      this.fisher.set(name, new Float32Array(param.length));
    }

    // Accumulate squared gradients
    for (let i = 0; i < numSamples; i++) {
      const grads = gradientFn();

      for (const [name, grad] of grads) {
        const fisher = this.fisher.get(name);
        if (fisher) {
          for (let j = 0; j < grad.length; j++) {
            fisher[j] += grad[j] * grad[j];
          }
        }
      }
    }

    // Normalize
    for (const fisher of this.fisher.values()) {
      for (let i = 0; i < fisher.length; i++) {
        fisher[i] /= numSamples;
      }
    }

    // Save current parameters as θ*
    this.savedParams.clear();
    for (const [name, param] of params) {
      this.savedParams.set(name, new Float32Array(param));
    }

    this.taskCount++;
  }

  /**
   * Compute EWC penalty term
   *
   * Penalty = λ * Σ F_i * (θ_i - θ*_i)²
   */
  penalty(currentParams: Map<string, Float32Array>): number {
    if (this.taskCount === 0) return 0;

    let loss = 0;

    for (const [name, param] of currentParams) {
      const savedParam = this.savedParams.get(name);
      const fisher = this.fisher.get(name);

      if (savedParam && fisher) {
        for (let i = 0; i < param.length; i++) {
          const diff = param[i] - savedParam[i];
          loss += fisher[i] * diff * diff;
        }
      }
    }

    return this.lambda * loss;
  }

  /**
   * Compute EWC gradient contribution
   *
   * ∂Penalty/∂θ_i = 2 * λ * F_i * (θ_i - θ*_i)
   */
  penaltyGradient(currentParams: Map<string, Float32Array>): Map<string, Float32Array> {
    const grads = new Map<string, Float32Array>();

    if (this.taskCount === 0) {
      for (const [name, param] of currentParams) {
        grads.set(name, new Float32Array(param.length));
      }
      return grads;
    }

    for (const [name, param] of currentParams) {
      const savedParam = this.savedParams.get(name);
      const fisher = this.fisher.get(name);
      const grad = new Float32Array(param.length);

      if (savedParam && fisher) {
        for (let i = 0; i < param.length; i++) {
          grad[i] = 2 * this.lambda * fisher[i] * (param[i] - savedParam[i]);
        }
      }

      grads.set(name, grad);
    }

    return grads;
  }

  /**
   * Get EWC state for persistence
   */
  getState(): EWCState {
    return {
      savedParams: new Map(this.savedParams),
      fisherDiagonal: new Map(this.fisher),
      taskCount: this.taskCount,
    };
  }

  /**
   * Restore EWC state
   */
  setState(state: EWCState): void {
    this.savedParams = new Map(state.savedParams);
    this.fisher = new Map(state.fisherDiagonal);
    this.taskCount = state.taskCount;
  }
}

// ============================================================================
// User Pattern Learner (Wide, Shallow Architecture)
// ============================================================================

/**
 * Continual learning model for user behavior patterns
 *
 * Architecture follows Mirzadeh recommendations:
 * - Wide, shallow network (3-4 layers, 512-1024 units)
 * - LayerNorm instead of BatchNorm
 * - No aggressive pooling
 */
export class UserPatternLearner {
  private config: ContinualLearningConfig;
  private weights: Map<string, Float32Array> = new Map();
  private replayBuffer: ReplayBuffer;
  private ewc: EWCRegularizer;
  private learningRate: number = 0.001;

  constructor(config: Partial<ContinualLearningConfig> = {}) {
    this.config = { ...DEFAULT_CL_CONFIG, ...config };
    this.replayBuffer = new ReplayBuffer(this.config.replayBufferSize);
    this.ewc = new EWCRegularizer(this.config.ewcLambda);

    // Initialize weights
    this.initializeWeights();
  }

  /**
   * Xavier/Glorot weight initialization
   */
  private initializeWeights(): void {
    const { inputDim, hiddenDim, layers, patternTypes } = this.config.architecture;

    // Input layer
    this.weights.set('W0', this.xavierInit(inputDim, hiddenDim));
    this.weights.set('b0', new Float32Array(hiddenDim));
    this.weights.set('gamma0', new Float32Array(hiddenDim).fill(1));
    this.weights.set('beta0', new Float32Array(hiddenDim));

    // Hidden layers
    for (let i = 1; i < layers; i++) {
      this.weights.set(`W${i}`, this.xavierInit(hiddenDim, hiddenDim));
      this.weights.set(`b${i}`, new Float32Array(hiddenDim));
      this.weights.set(`gamma${i}`, new Float32Array(hiddenDim).fill(1));
      this.weights.set(`beta${i}`, new Float32Array(hiddenDim));
    }

    // Output layer
    this.weights.set('Wout', this.xavierInit(hiddenDim, patternTypes));
    this.weights.set('bout', new Float32Array(patternTypes));
  }

  private xavierInit(fanIn: number, fanOut: number): Float32Array {
    const weights = new Float32Array(fanIn * fanOut);
    const stdv = Math.sqrt(2.0 / (fanIn + fanOut));

    for (let i = 0; i < weights.length; i++) {
      // Box-Muller transform
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      weights[i] = z * stdv;
    }

    return weights;
  }

  /**
   * Layer Normalization (NOT BatchNorm - per Mirzadeh recommendations)
   */
  private layerNorm(
    x: Float32Array,
    gamma: Float32Array,
    beta: Float32Array,
    eps: number = 1e-5
  ): Float32Array {
    const n = x.length;
    let mean = 0;
    let variance = 0;

    // Compute mean
    for (let i = 0; i < n; i++) {
      mean += x[i];
    }
    mean /= n;

    // Compute variance
    for (let i = 0; i < n; i++) {
      variance += (x[i] - mean) ** 2;
    }
    variance /= n;

    // Normalize and scale
    const result = new Float32Array(n);
    const invStd = 1 / Math.sqrt(variance + eps);

    for (let i = 0; i < n; i++) {
      result[i] = gamma[i] * (x[i] - mean) * invStd + beta[i];
    }

    return result;
  }

  /**
   * ReLU activation
   */
  private relu(x: Float32Array): Float32Array {
    const result = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) {
      result[i] = Math.max(0, x[i]);
    }
    return result;
  }

  /**
   * Linear layer forward pass
   */
  private linear(
    input: Float32Array,
    weights: Float32Array,
    bias: Float32Array,
    outputDim: number
  ): Float32Array {
    const inputDim = input.length;
    const result = new Float32Array(outputDim);

    for (let i = 0; i < outputDim; i++) {
      result[i] = bias[i];
      for (let j = 0; j < inputDim; j++) {
        result[i] += input[j] * weights[i * inputDim + j];
      }
    }

    return result;
  }

  /**
   * Forward pass through the network
   */
  forward(input: Float32Array): Float32Array {
    let x = input;
    const { layers, hiddenDim, patternTypes } = this.config.architecture;

    // Hidden layers with LayerNorm + ReLU
    for (let i = 0; i < layers; i++) {
      const W = this.weights.get(`W${i}`)!;
      const b = this.weights.get(`b${i}`)!;
      const gamma = this.weights.get(`gamma${i}`)!;
      const beta = this.weights.get(`beta${i}`)!;

      x = this.linear(x, W, b, hiddenDim);
      x = this.layerNorm(x, gamma, beta);
      x = this.relu(x);
    }

    // Output layer (no activation for logits)
    const Wout = this.weights.get('Wout')!;
    const bout = this.weights.get('bout')!;
    x = this.linear(x, Wout, bout, patternTypes);

    return x;
  }

  /**
   * Softmax for probability distribution
   */
  softmax(logits: Float32Array): Float32Array {
    const maxLogit = Math.max(...logits);
    const expLogits = logits.map((x) => Math.exp(x - maxLogit));
    const sum = expLogits.reduce((a, b) => a + b, 0);
    return new Float32Array(expLogits.map((x) => x / sum));
  }

  /**
   * Cross-entropy loss
   */
  crossEntropyLoss(logits: Float32Array, target: Float32Array): number {
    const probs = this.softmax(logits);
    let loss = 0;

    for (let i = 0; i < target.length; i++) {
      if (target[i] > 0) {
        loss -= target[i] * Math.log(probs[i] + 1e-10);
      }
    }

    return loss;
  }

  /**
   * Incremental update with anti-forgetting measures
   */
  incrementalUpdate(
    newData: Float32Array[],
    labels: Float32Array[],
    taskId: string
  ): number {
    // Get replay samples
    const replayBatch = this.replayBuffer.sample(Math.floor(newData.length / 2));

    // Combine new data with replay
    const combinedInputs: Float32Array[] = [...newData];
    const combinedLabels: Float32Array[] = [...labels];

    for (const sample of replayBatch) {
      combinedInputs.push(sample.input);
      combinedLabels.push(sample.target);
    }

    // Compute loss and update (simplified SGD)
    let totalLoss = 0;

    for (let i = 0; i < combinedInputs.length; i++) {
      const logits = this.forward(combinedInputs[i]);
      const loss = this.crossEntropyLoss(logits, combinedLabels[i]);

      // Add EWC penalty
      const ewcPenalty = this.ewc.penalty(this.weights);
      totalLoss += loss + ewcPenalty;
    }

    totalLoss /= combinedInputs.length;

    // Note: In production, would compute gradients and update weights
    // This is a simplified version for demonstration

    // Update replay buffer with new samples
    for (let i = 0; i < Math.min(10, newData.length); i++) {
      this.replayBuffer.add(newData[i], labels[i], taskId);
    }

    return totalLoss;
  }

  /**
   * Prepare for new task (compute Fisher and save params)
   */
  consolidateTask(taskId: string, sampleFn: () => { input: Float32Array; target: Float32Array }): void {
    // Compute Fisher using provided samples
    this.ewc.computeFisher(
      this.weights,
      () => {
        // Simplified: return zero gradients
        // In production, would compute actual gradients from sampleFn
        const grads = new Map<string, Float32Array>();
        for (const [name, param] of this.weights) {
          grads.set(name, new Float32Array(param.length));
        }
        return grads;
      },
      this.config.fisherSamples
    );
  }

  /**
   * Get learning metrics
   */
  getMetrics(): ContinualLearningMetrics {
    const bufferStats = this.replayBuffer.getStats();
    const taskCount = Object.keys(bufferStats.taskDistribution).length;

    return {
      forgettingRate: 0, // Would require validation set to compute
      forwardTransfer: 0,
      backwardTransfer: 0,
      averageAccuracy: 0,
    };
  }

  /**
   * Serialize for persistence
   */
  toJSON(): {
    config: ContinualLearningConfig;
    weights: Record<string, number[]>;
    replayBuffer: ReturnType<ReplayBuffer['toJSON']>;
    ewcState: EWCState;
  } {
    const weightsObj: Record<string, number[]> = {};
    for (const [name, param] of this.weights) {
      weightsObj[name] = Array.from(param);
    }

    return {
      config: this.config,
      weights: weightsObj,
      replayBuffer: this.replayBuffer.toJSON(),
      ewcState: {
        ...this.ewc.getState(),
        savedParams: Object.fromEntries(
          Array.from(this.ewc.getState().savedParams.entries()).map(([k, v]) => [k, Array.from(v)])
        ),
        fisherDiagonal: Object.fromEntries(
          Array.from(this.ewc.getState().fisherDiagonal.entries()).map(([k, v]) => [k, Array.from(v)])
        ),
      } as unknown as EWCState,
    };
  }

  /**
   * Get replay buffer
   */
  getReplayBuffer(): ReplayBuffer {
    return this.replayBuffer;
  }

  /**
   * Get EWC regularizer
   */
  getEWC(): EWCRegularizer {
    return this.ewc;
  }
}
