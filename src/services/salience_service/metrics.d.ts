/**
 * @file Real-time Metrics for Salience Service
 * Provides observability without external dependencies.
 *
 * Exports Prometheus-compatible metrics and CloudWatch-compatible format.
 * All metrics are held in memory and can be scraped via HTTP endpoint.
 */
/**
 * Metric types for different measurement patterns.
 */
type MetricType = 'counter' | 'gauge' | 'histogram';
interface MetricDefinition {
    name: string;
    help: string;
    type: MetricType;
    labels?: string[];
}
interface HistogramBucket {
    le: number;
    count: number;
}
interface HistogramData {
    buckets: HistogramBucket[];
    sum: number;
    count: number;
}
/**
 * In-memory metrics storage.
 */
declare class MetricsStore {
    private counters;
    private gauges;
    private histograms;
    private definitions;
    constructor();
    /**
     * Register all salience service metrics.
     */
    private registerDefaultMetrics;
    /**
     * Define a metric.
     */
    define(definition: MetricDefinition): void;
    /**
     * Increment a counter.
     */
    inc(name: string, labels?: Record<string, string>, value?: number): void;
    /**
     * Set a gauge value.
     */
    set(name: string, value: number, labels?: Record<string, string>): void;
    /**
     * Record a histogram observation.
     */
    observe(name: string, value: number, labels?: Record<string, string>): void;
    /**
     * Find a metric by labels.
     */
    private findMetric;
    /**
     * Find a histogram by labels.
     */
    private findHistogram;
    /**
     * Check if labels match.
     */
    private labelsMatch;
    /**
     * Format labels for Prometheus.
     */
    private formatLabels;
    /**
     * Export all metrics in Prometheus format.
     */
    toPrometheus(): string;
    /**
     * Export metrics as JSON (for CloudWatch or custom dashboards).
     */
    toJSON(): {
        counters: Record<string, {
            value: number;
            labels: Record<string, string>;
        }[]>;
        gauges: Record<string, {
            value: number;
            labels: Record<string, string>;
        }[]>;
        histograms: Record<string, {
            data: HistogramData;
            labels: Record<string, string>;
        }[]>;
        timestamp: number;
    };
    /**
     * Get summary stats (for quick health checks).
     */
    getSummary(): {
        memoriesProcessed: number;
        openLoopsCreated: number;
        openLoopsClosed: number;
        avgProcessingTimeMs: number;
        avgSalienceScore: number;
        errors: number;
    };
    /**
     * Reset all metrics (for testing).
     */
    reset(): void;
}
declare const metrics: MetricsStore;
/**
 * Timer utility for measuring durations.
 */
export declare function startTimer(): () => number;
/**
 * Decorator-style helper for timing async functions.
 */
export declare function withTiming<T>(metricName: string, labels: Record<string, string>, fn: () => Promise<T>): Promise<T>;
export { metrics };
export declare const incMemoriesProcessed: (method: "llm" | "heuristic", status: "success" | "error") => void;
export declare const incOpenLoopsCreated: (owner: "self" | "them" | "mutual") => void;
export declare const incOpenLoopsClosed: (method: "auto" | "manual") => void;
export declare const incTimelineEvents: (type: string) => void;
export declare const incRetrievals: (type: "salience" | "time_aware" | "person") => void;
export declare const incBriefings: (type: "full" | "quick") => void;
export declare const incFeatureExtractions: (method: "llm" | "heuristic") => void;
export declare const incRelationshipUpdates: () => void;
export declare const incErrors: (operation: string) => void;
export declare const setActiveLoops: (owner: "self" | "them" | "mutual", count: number) => void;
export declare const setOverdueLoops: (count: number) => void;
export declare const setActiveRelationships: (count: number) => void;
export declare const setColdRelationships: (count: number) => void;
export declare const setWeightsConfidence: (userId: string, confidence: number) => void;
export declare const observeProcessingTime: (method: "llm" | "heuristic", durationMs: number) => void;
export declare const observeFeatureExtractionTime: (method: "llm" | "heuristic", durationMs: number) => void;
export declare const observeRetrievalTime: (durationMs: number) => void;
export declare const observeBriefingTime: (type: "full" | "quick", durationMs: number) => void;
export declare const observeSalienceScore: (score: number) => void;
export declare const observeLLMCallTime: (operation: string, durationMs: number) => void;
/**
 * Express/Fastify middleware for /metrics endpoint.
 */
export declare function metricsEndpoint(): (_req: any, res: any) => Promise<void>;
/**
 * Get metrics summary for health checks.
 */
export declare function getMetricsSummary(): {
    memoriesProcessed: number;
    openLoopsCreated: number;
    openLoopsClosed: number;
    avgProcessingTimeMs: number;
    avgSalienceScore: number;
    errors: number;
};
/**
 * Export metrics in Prometheus format.
 */
export declare function exportPrometheus(): string;
/**
 * Export metrics as JSON.
 */
export declare function exportJSON(): {
    counters: Record<string, {
        value: number;
        labels: Record<string, string>;
    }[]>;
    gauges: Record<string, {
        value: number;
        labels: Record<string, string>;
    }[]>;
    histograms: Record<string, {
        data: HistogramData;
        labels: Record<string, string>;
    }[]>;
    timestamp: number;
};
/**
 * Reset all metrics (for testing).
 */
export declare function resetMetrics(): void;
