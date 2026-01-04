/**
 * @file Real-time Metrics for Salience Service
 * Provides observability without external dependencies.
 *
 * Exports Prometheus-compatible metrics and CloudWatch-compatible format.
 * All metrics are held in memory and can be scraped via HTTP endpoint.
 */
// Default histogram buckets for timing (in milliseconds)
const DEFAULT_TIMING_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
// Default histogram buckets for salience scores (0-100)
const SCORE_BUCKETS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
/**
 * In-memory metrics storage.
 */
class MetricsStore {
    constructor() {
        this.counters = new Map();
        this.gauges = new Map();
        this.histograms = new Map();
        this.definitions = new Map();
        this.registerDefaultMetrics();
    }
    /**
     * Register all salience service metrics.
     */
    registerDefaultMetrics() {
        // Counters
        this.define({
            name: 'salience_memories_processed_total',
            help: 'Total number of memories processed for salience',
            type: 'counter',
            labels: ['method', 'status'],
        });
        this.define({
            name: 'salience_open_loops_created_total',
            help: 'Total open loops created',
            type: 'counter',
            labels: ['owner'],
        });
        this.define({
            name: 'salience_open_loops_closed_total',
            help: 'Total open loops closed',
            type: 'counter',
            labels: ['method'],
        });
        this.define({
            name: 'salience_timeline_events_created_total',
            help: 'Total timeline events created',
            type: 'counter',
            labels: ['type'],
        });
        this.define({
            name: 'salience_retrievals_total',
            help: 'Total memory retrievals',
            type: 'counter',
            labels: ['type'],
        });
        this.define({
            name: 'salience_briefings_generated_total',
            help: 'Total pre-conversation briefings generated',
            type: 'counter',
            labels: ['type'],
        });
        this.define({
            name: 'salience_feature_extractions_total',
            help: 'Total feature extractions',
            type: 'counter',
            labels: ['method'],
        });
        this.define({
            name: 'salience_relationship_updates_total',
            help: 'Total relationship pattern updates',
            type: 'counter',
        });
        this.define({
            name: 'salience_errors_total',
            help: 'Total errors by operation',
            type: 'counter',
            labels: ['operation'],
        });
        // Gauges
        this.define({
            name: 'salience_open_loops_active',
            help: 'Current number of active open loops',
            type: 'gauge',
            labels: ['owner'],
        });
        this.define({
            name: 'salience_open_loops_overdue',
            help: 'Current number of overdue open loops',
            type: 'gauge',
        });
        this.define({
            name: 'salience_relationships_active',
            help: 'Current number of active relationships',
            type: 'gauge',
        });
        this.define({
            name: 'salience_relationships_cold',
            help: 'Current number of cold relationships',
            type: 'gauge',
        });
        this.define({
            name: 'salience_weights_confidence',
            help: 'Learned weights confidence score',
            type: 'gauge',
            labels: ['user_id'],
        });
        // Histograms
        this.define({
            name: 'salience_processing_duration_ms',
            help: 'Time to process memory salience in milliseconds',
            type: 'histogram',
            labels: ['method'],
        });
        this.define({
            name: 'salience_feature_extraction_duration_ms',
            help: 'Time to extract features in milliseconds',
            type: 'histogram',
            labels: ['method'],
        });
        this.define({
            name: 'salience_retrieval_duration_ms',
            help: 'Time to retrieve memories in milliseconds',
            type: 'histogram',
        });
        this.define({
            name: 'salience_briefing_duration_ms',
            help: 'Time to generate briefing in milliseconds',
            type: 'histogram',
            labels: ['type'],
        });
        this.define({
            name: 'salience_score_distribution',
            help: 'Distribution of salience scores',
            type: 'histogram',
        });
        this.define({
            name: 'salience_llm_call_duration_ms',
            help: 'Time for LLM API calls in milliseconds',
            type: 'histogram',
            labels: ['operation'],
        });
    }
    /**
     * Define a metric.
     */
    define(definition) {
        this.definitions.set(definition.name, definition);
    }
    /**
     * Increment a counter.
     */
    inc(name, labels = {}, value = 1) {
        if (!this.counters.has(name)) {
            this.counters.set(name, []);
        }
        const existing = this.findMetric(this.counters.get(name), labels);
        if (existing) {
            existing.value += value;
            existing.timestamp = Date.now();
        }
        else {
            this.counters.get(name).push({
                value,
                labels,
                timestamp: Date.now(),
            });
        }
    }
    /**
     * Set a gauge value.
     */
    set(name, value, labels = {}) {
        if (!this.gauges.has(name)) {
            this.gauges.set(name, []);
        }
        const existing = this.findMetric(this.gauges.get(name), labels);
        if (existing) {
            existing.value = value;
            existing.timestamp = Date.now();
        }
        else {
            this.gauges.get(name).push({
                value,
                labels,
                timestamp: Date.now(),
            });
        }
    }
    /**
     * Record a histogram observation.
     */
    observe(name, value, labels = {}) {
        if (!this.histograms.has(name)) {
            this.histograms.set(name, []);
        }
        const buckets = name.includes('score') ? SCORE_BUCKETS : DEFAULT_TIMING_BUCKETS;
        const existing = this.findHistogram(this.histograms.get(name), labels);
        if (existing) {
            existing.data.sum += value;
            existing.data.count += 1;
            for (const bucket of existing.data.buckets) {
                if (value <= bucket.le) {
                    bucket.count += 1;
                }
            }
            existing.timestamp = Date.now();
        }
        else {
            const newBuckets = buckets.map((le) => ({
                le,
                count: value <= le ? 1 : 0,
            }));
            newBuckets.push({ le: Infinity, count: 1 }); // +Inf bucket
            this.histograms.get(name).push({
                data: {
                    buckets: newBuckets,
                    sum: value,
                    count: 1,
                },
                labels,
                timestamp: Date.now(),
            });
        }
    }
    /**
     * Find a metric by labels.
     */
    findMetric(metrics, labels) {
        return metrics.find((m) => this.labelsMatch(m.labels, labels));
    }
    /**
     * Find a histogram by labels.
     */
    findHistogram(histograms, labels) {
        return histograms.find((h) => this.labelsMatch(h.labels, labels));
    }
    /**
     * Check if labels match.
     */
    labelsMatch(a, b) {
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length)
            return false;
        return aKeys.every((key) => a[key] === b[key]);
    }
    /**
     * Format labels for Prometheus.
     */
    formatLabels(labels) {
        const pairs = Object.entries(labels).map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`);
        return pairs.length > 0 ? `{${pairs.join(',')}}` : '';
    }
    /**
     * Export all metrics in Prometheus format.
     */
    toPrometheus() {
        const lines = [];
        // Counters
        for (const [name, metrics] of this.counters) {
            const def = this.definitions.get(name);
            if (def) {
                lines.push(`# HELP ${name} ${def.help}`);
                lines.push(`# TYPE ${name} counter`);
            }
            for (const metric of metrics) {
                lines.push(`${name}${this.formatLabels(metric.labels)} ${metric.value}`);
            }
        }
        // Gauges
        for (const [name, metrics] of this.gauges) {
            const def = this.definitions.get(name);
            if (def) {
                lines.push(`# HELP ${name} ${def.help}`);
                lines.push(`# TYPE ${name} gauge`);
            }
            for (const metric of metrics) {
                lines.push(`${name}${this.formatLabels(metric.labels)} ${metric.value}`);
            }
        }
        // Histograms
        for (const [name, histograms] of this.histograms) {
            const def = this.definitions.get(name);
            if (def) {
                lines.push(`# HELP ${name} ${def.help}`);
                lines.push(`# TYPE ${name} histogram`);
            }
            for (const hist of histograms) {
                for (const bucket of hist.data.buckets) {
                    const le = bucket.le === Infinity ? '+Inf' : bucket.le.toString();
                    const bucketLabels = { ...hist.labels, le };
                    lines.push(`${name}_bucket${this.formatLabels(bucketLabels)} ${bucket.count}`);
                }
                lines.push(`${name}_sum${this.formatLabels(hist.labels)} ${hist.data.sum}`);
                lines.push(`${name}_count${this.formatLabels(hist.labels)} ${hist.data.count}`);
            }
        }
        return lines.join('\n');
    }
    /**
     * Export metrics as JSON (for CloudWatch or custom dashboards).
     */
    toJSON() {
        const counters = {};
        const gauges = {};
        const histograms = {};
        for (const [name, metrics] of this.counters) {
            counters[name] = metrics.map((m) => ({ value: m.value, labels: m.labels }));
        }
        for (const [name, metrics] of this.gauges) {
            gauges[name] = metrics.map((m) => ({ value: m.value, labels: m.labels }));
        }
        for (const [name, hists] of this.histograms) {
            histograms[name] = hists.map((h) => ({ data: h.data, labels: h.labels }));
        }
        return { counters, gauges, histograms, timestamp: Date.now() };
    }
    /**
     * Get summary stats (for quick health checks).
     */
    getSummary() {
        const getCounterSum = (name) => {
            const metrics = this.counters.get(name) || [];
            return metrics.reduce((sum, m) => sum + m.value, 0);
        };
        const getHistogramAvg = (name) => {
            const hists = this.histograms.get(name) || [];
            let totalSum = 0;
            let totalCount = 0;
            for (const h of hists) {
                totalSum += h.data.sum;
                totalCount += h.data.count;
            }
            return totalCount > 0 ? totalSum / totalCount : 0;
        };
        return {
            memoriesProcessed: getCounterSum('salience_memories_processed_total'),
            openLoopsCreated: getCounterSum('salience_open_loops_created_total'),
            openLoopsClosed: getCounterSum('salience_open_loops_closed_total'),
            avgProcessingTimeMs: Math.round(getHistogramAvg('salience_processing_duration_ms')),
            avgSalienceScore: Math.round(getHistogramAvg('salience_score_distribution')),
            errors: getCounterSum('salience_errors_total'),
        };
    }
    /**
     * Reset all metrics (for testing).
     */
    reset() {
        this.counters.clear();
        this.gauges.clear();
        this.histograms.clear();
    }
}
// Global metrics instance
const metrics = new MetricsStore();
/**
 * Timer utility for measuring durations.
 */
export function startTimer() {
    const start = performance.now();
    return () => performance.now() - start;
}
/**
 * Decorator-style helper for timing async functions.
 */
export async function withTiming(metricName, labels, fn) {
    const end = startTimer();
    try {
        const result = await fn();
        metrics.observe(metricName, end(), labels);
        return result;
    }
    catch (error) {
        metrics.observe(metricName, end(), labels);
        throw error;
    }
}
// Export the singleton and helper functions
export { metrics };
// Convenience exports for common operations
export const incMemoriesProcessed = (method, status) => metrics.inc('salience_memories_processed_total', { method, status });
export const incOpenLoopsCreated = (owner) => metrics.inc('salience_open_loops_created_total', { owner });
export const incOpenLoopsClosed = (method) => metrics.inc('salience_open_loops_closed_total', { method });
export const incTimelineEvents = (type) => metrics.inc('salience_timeline_events_created_total', { type });
export const incRetrievals = (type) => metrics.inc('salience_retrievals_total', { type });
export const incBriefings = (type) => metrics.inc('salience_briefings_generated_total', { type });
export const incFeatureExtractions = (method) => metrics.inc('salience_feature_extractions_total', { method });
export const incRelationshipUpdates = () => metrics.inc('salience_relationship_updates_total');
export const incErrors = (operation) => metrics.inc('salience_errors_total', { operation });
export const setActiveLoops = (owner, count) => metrics.set('salience_open_loops_active', count, { owner });
export const setOverdueLoops = (count) => metrics.set('salience_open_loops_overdue', count);
export const setActiveRelationships = (count) => metrics.set('salience_relationships_active', count);
export const setColdRelationships = (count) => metrics.set('salience_relationships_cold', count);
export const setWeightsConfidence = (userId, confidence) => metrics.set('salience_weights_confidence', confidence, { user_id: userId });
export const observeProcessingTime = (method, durationMs) => metrics.observe('salience_processing_duration_ms', durationMs, { method });
export const observeFeatureExtractionTime = (method, durationMs) => metrics.observe('salience_feature_extraction_duration_ms', durationMs, { method });
export const observeRetrievalTime = (durationMs) => metrics.observe('salience_retrieval_duration_ms', durationMs);
export const observeBriefingTime = (type, durationMs) => metrics.observe('salience_briefing_duration_ms', durationMs, { type });
export const observeSalienceScore = (score) => metrics.observe('salience_score_distribution', score);
export const observeLLMCallTime = (operation, durationMs) => metrics.observe('salience_llm_call_duration_ms', durationMs, { operation });
/**
 * Express/Fastify middleware for /metrics endpoint.
 */
export function metricsEndpoint() {
    return async (_req, res) => {
        try {
            const accept = _req.headers?.accept || '';
            if (accept.includes('application/json')) {
                res.setHeader('Content-Type', 'application/json');
                res.status(200).json(metrics.toJSON());
            }
            else {
                res.setHeader('Content-Type', 'text/plain; version=0.0.4');
                res.status(200).send(metrics.toPrometheus());
            }
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to export metrics' });
        }
    };
}
/**
 * Get metrics summary for health checks.
 */
export function getMetricsSummary() {
    return metrics.getSummary();
}
/**
 * Export metrics in Prometheus format.
 */
export function exportPrometheus() {
    return metrics.toPrometheus();
}
/**
 * Export metrics as JSON.
 */
export function exportJSON() {
    return metrics.toJSON();
}
/**
 * Reset all metrics (for testing).
 */
export function resetMetrics() {
    metrics.reset();
}
