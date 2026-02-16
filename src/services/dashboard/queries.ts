/**
 * Dashboard MongoDB queries.
 * All data comes from MongoDB Atlas — zero in-memory stores.
 */

import type { Db } from 'mongodb';

export interface DashboardSummary {
  totalMemories: number;
  avgImportance: number;
  avgSalience: number;
  uniqueEntities: number;
  dataSources: number;
  openLoops: number;
  salience: { low: number; medium: number; high: number };
  fidelity: { verbatim: number; derived: number; standard: number };
  sources: Record<string, number>;
  topEntities: Array<{ name: string; count: number }>;
}

export interface CalendarDay {
  date: string;
  dayName: string;
  count: number;
  avgSalience: number;
  topEntities: string[];
  loops: number;
}

export interface CalendarData {
  week: CalendarDay[];
  today: { date: string; count: number; timeOfDay: Record<string, number> };
  patterns: {
    observationDays: number;
    readyForPrediction: boolean;
    confidence: number;
    daysUntilHabitComplete: number;
  };
  totals: { memories: number; avgSalience: number; entities: number; openLoops: number };
}

export interface MissionControlData extends DashboardSummary {
  uptimeSeconds: number;
}

/**
 * Core dashboard summary — all aggregation done in MongoDB.
 */
export async function getDashboardSummary(db: Db, userId?: string): Promise<DashboardSummary> {
  const memories = db.collection('memories');
  const openLoops = db.collection('open_loops');
  const filter: Record<string, unknown> = userId ? { userId } : {};

  // Run aggregations in parallel
  const [
    totalMemories,
    importanceAgg,
    salienceDistribution,
    fidelityAgg,
    sourceAgg,
    entityAgg,
    loopCount,
  ] = await Promise.all([
    memories.countDocuments(filter),

    // Average importance (predictive_memories uses 0-1 scale, memories may use 0-100 salience)
    memories.aggregate([
      { $match: filter },
      { $group: {
        _id: null,
        avgSalience: { $avg: { $ifNull: ['$salience', { $ifNull: [{ $multiply: ['$salienceScore', 100] }, 0] }] } },
        avgImportance: { $avg: { $ifNull: ['$salienceScore', { $ifNull: [{ $divide: ['$salience', 100] }, 0] }] } },
      }},
    ]).toArray(),

    // Salience distribution (0-100 scale)
    memories.aggregate([
      { $match: filter },
      { $addFields: { sal: { $ifNull: ['$salience', { $ifNull: [{ $multiply: ['$salienceScore', 100] }, 0] }] } } },
      { $group: {
        _id: null,
        low: { $sum: { $cond: [{ $lt: ['$sal', 40] }, 1, 0] } },
        medium: { $sum: { $cond: [{ $and: [{ $gte: ['$sal', 40] }, { $lt: ['$sal', 70] }] }, 1, 0] } },
        high: { $sum: { $cond: [{ $gte: ['$sal', 70] }, 1, 0] } },
      }},
    ]).toArray(),

    // Fidelity breakdown
    memories.aggregate([
      { $match: filter },
      { $group: {
        _id: { $ifNull: ['$fidelity', { $ifNull: ['$metadata.fidelity', 'standard'] }] },
        count: { $sum: 1 },
      }},
    ]).toArray(),

    // Source breakdown
    memories.aggregate([
      { $match: filter },
      { $group: {
        _id: { $ifNull: ['$context.source', 'direct'] },
        count: { $sum: 1 },
      }},
    ]).toArray(),

    // Entity breakdown — handles both entities[] array and tags[]
    memories.aggregate([
      { $match: filter },
      { $project: { allEntities: {
        $concatArrays: [
          { $ifNull: ['$entities', []] },
          { $ifNull: ['$tags', []] },
          { $cond: [{ $ifNull: ['$entity', false] }, [{ $ifNull: ['$entity', ''] }], []] },
        ],
      }}},
      { $unwind: '$allEntities' },
      { $match: { allEntities: { $ne: '' } } },
      { $group: { _id: '$allEntities', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]).toArray(),

    // Open loops
    openLoops.countDocuments({ ...filter, status: { $ne: 'resolved' } }),
  ]);

  const salAgg = salienceDistribution[0] || { low: 0, medium: 0, high: 0 };
  const impAgg = importanceAgg[0] || { avgSalience: 0, avgImportance: 0 };

  const fidelity = { verbatim: 0, derived: 0, standard: 0 };
  for (const f of fidelityAgg) {
    if (f._id === 'verbatim') fidelity.verbatim = f.count;
    else if (f._id === 'derived') fidelity.derived = f.count;
    else fidelity.standard += f.count;
  }

  const sources: Record<string, number> = {};
  for (const s of sourceAgg) {
    sources[s._id as string] = s.count;
  }

  return {
    totalMemories,
    avgImportance: Math.round((impAgg.avgImportance || 0) * 100) / 100,
    avgSalience: Math.round(impAgg.avgSalience || 0),
    uniqueEntities: entityAgg.length,
    dataSources: Object.keys(sources).length,
    openLoops: loopCount,
    salience: { low: salAgg.low, medium: salAgg.medium, high: salAgg.high },
    fidelity,
    sources,
    topEntities: entityAgg.map(e => ({ name: e._id as string, count: e.count })),
  };
}

/**
 * Calendar data — 7-day rolling window from MongoDB.
 */
export async function getCalendarData(db: Db, userId?: string, days = 7): Promise<CalendarData> {
  const memories = db.collection('memories');
  const openLoops = db.collection('open_loops');
  const filter: Record<string, unknown> = userId ? { userId } : {};

  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - (days - 1));
  startDate.setHours(0, 0, 0, 0);

  // Get all memories in the window
  const windowMemories = await memories.find({
    ...filter,
    $or: [
      { timestamp: { $gte: startDate.toISOString() } },
      { createdAt: { $gte: startDate } },
      { created_at: { $gte: startDate.toISOString() } },
    ],
  }).toArray();

  // Build day-by-day data
  const week: CalendarDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    const dayMemories = windowMemories.filter(m => {
      const memDate = new Date(m.timestamp || m.createdAt || m.created_at).toISOString().split('T')[0];
      return memDate === dateStr;
    });

    const entities = [...new Set(dayMemories.flatMap(m =>
      [...(m.entities || []), ...(m.tags || []), ...(m.entity ? [m.entity] : [])],
    ))].slice(0, 5);

    week.push({
      date: dateStr,
      dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
      count: dayMemories.length,
      avgSalience: dayMemories.length > 0
        ? Math.round(dayMemories.reduce((s, m) => s + (m.salience || (m.salienceScore || 0) * 100 || 0), 0) / dayMemories.length)
        : 0,
      topEntities: entities as string[],
      loops: dayMemories.filter(m => m.metadata?.hasLoop || m.hasOpenLoops).length,
    });
  }

  // Today's time-of-day breakdown
  const todayStr = now.toISOString().split('T')[0];
  const todayMemories = windowMemories.filter(m => {
    const memDate = new Date(m.timestamp || m.createdAt || m.created_at).toISOString().split('T')[0];
    return memDate === todayStr;
  });

  const timeOfDay = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  for (const m of todayMemories) {
    const h = new Date(m.timestamp || m.createdAt).getHours();
    if (h >= 5 && h < 12) timeOfDay.morning++;
    else if (h >= 12 && h < 17) timeOfDay.afternoon++;
    else if (h >= 17 && h < 21) timeOfDay.evening++;
    else timeOfDay.night++;
  }

  // Pattern stats from detected_patterns collection
  const patterns = await db.collection('detected_patterns').find(filter).toArray();
  const observationDays = patterns.length > 0
    ? Math.max(...patterns.map(p => p.stabilityDays || 0))
    : 0;
  const maxConfidence = patterns.length > 0
    ? Math.max(...patterns.map(p => p.confidence || 0))
    : 0;

  // Totals
  const totalMemories = await memories.countDocuments(filter);
  const totalEntities = await memories.aggregate([
    { $match: filter },
    { $project: { allEntities: {
      $concatArrays: [
        { $ifNull: ['$entities', []] },
        { $ifNull: ['$tags', []] },
      ],
    }}},
    { $unwind: '$allEntities' },
    { $group: { _id: '$allEntities' } },
  ]).toArray();

  const loopCount = await openLoops.countDocuments({ ...filter, status: { $ne: 'resolved' } });

  const avgSalience = totalMemories > 0
    ? (await memories.aggregate([
        { $match: filter },
        { $group: { _id: null, avg: { $avg: { $ifNull: ['$salience', { $multiply: [{ $ifNull: ['$salienceScore', 0] }, 100] }] } } } },
      ]).toArray())[0]?.avg || 0
    : 0;

  return {
    week,
    today: { date: todayStr, count: todayMemories.length, timeOfDay },
    patterns: {
      observationDays,
      readyForPrediction: observationDays >= 21,
      confidence: maxConfidence,
      daysUntilHabitComplete: Math.max(0, 21 - observationDays),
    },
    totals: {
      memories: totalMemories,
      avgSalience: Math.round(avgSalience),
      entities: totalEntities.length,
      openLoops: loopCount,
    },
  };
}

/**
 * Mission control data — extends summary with uptime.
 */
export async function getMissionControlData(db: Db, startTime: number, userId?: string): Promise<MissionControlData> {
  const summary = await getDashboardSummary(db, userId);
  return {
    ...summary,
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
  };
}

/**
 * Full JSON payload for /dashboard/json.
 */
export async function getDashboardJSON(db: Db, userId?: string) {
  const summary = await getDashboardSummary(db, userId);
  return {
    summary: {
      totalMemories: summary.totalMemories,
      avgSalience: summary.avgSalience,
      uniqueEntities: summary.uniqueEntities,
      dataSources: summary.dataSources,
    },
    salience: summary.salience,
    fidelity: summary.fidelity,
    sources: summary.sources,
    topEntities: summary.topEntities,
  };
}
