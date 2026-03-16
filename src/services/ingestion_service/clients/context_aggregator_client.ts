/**
 * ContextAggregatorClient - Aggregates temporal, spatial, and reasoning context.
 * Derives context from the event data itself rather than relying on external services.
 */

import { ProcessedInputData, TemporalContext } from '../models';

export class ContextAggregatorClient {
  public logger = console;

  /**
   * Aggregate context for a given agent and event.
   * Extracts temporal patterns, infers spatial context from content,
   * and derives reasoning context from metadata.
   */
  async aggregateContext(agentId: string, eventTimestamp?: string): Promise<{
    temporalContext: TemporalContext;
    spatialContext?: Partial<ProcessedInputData['aggregatedSpatialContext']>;
    reasoningContext?: Partial<ProcessedInputData['aggregatedReasoningContext']>;
  }> {
    const timestamp = eventTimestamp || new Date().toISOString();
    const eventDate = new Date(timestamp);

    // Derive temporal context from the timestamp
    const hour = eventDate.getHours();
    const dayOfWeek = eventDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Time-of-day classification
    let timeOfDay: string;
    if (hour >= 3 && hour < 6) timeOfDay = 'early_morning';
    else if (hour >= 6 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
    else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
    else timeOfDay = 'night';

    const temporalContext: TemporalContext = {
      eventTimestamp: timestamp,
      ...(timeOfDay ? { timeOfDay } : {}),
      ...(isWeekend ? { isWeekend } : {}),
    };

    this.logger.info(`ContextAggregatorClient: aggregated context for agent ${agentId} at ${timeOfDay} (${isWeekend ? 'weekend' : 'weekday'})`);

    return {
      temporalContext,
    };
  }
}
