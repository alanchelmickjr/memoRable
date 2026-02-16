/**
 * Intelligence Dashboard — ported from server.js:3333.
 * Memory count displayed smaller per Alan's ask.
 * Data from MongoDB Atlas, not in-memory store.
 */

import { head, nav } from './layout.js';
import type { DashboardSummary } from '../queries.js';

const PAGE_CSS = `
    .content { padding: 20px 30px; max-width: 1400px; margin: 0 auto; }
    h1 { color: #58a6ff; border-bottom: 1px solid #30363d; padding-bottom: 10px; font-family: 'Orbitron', sans-serif; }
    h2 { color: #8b949e; font-size: 14px; text-transform: uppercase; margin-top: 30px; letter-spacing: 2px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-top: 10px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; }
    .card h3 { margin: 0 0 10px 0; color: #58a6ff; font-size: 12px; text-transform: uppercase; }
    .big-number { font-size: 36px; font-weight: bold; color: #7ee787; margin: 10px 0; }
    .bar { height: 8px; background: #30363d; border-radius: 4px; overflow: hidden; margin: 5px 0; }
    .bar-fill { height: 100%; border-radius: 4px; }
    .bar-low { background: #484f58; }
    .bar-medium { background: #d29922; }
    .bar-high { background: #7ee787; }
    .stat-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #21262d; }
    .stat-label { color: #8b949e; }
    .stat-value { color: #c9d1d9; font-weight: bold; }
    .entity-list { max-height: 300px; overflow-y: auto; }
    .entity-item { padding: 8px; background: #21262d; border-radius: 4px; margin: 4px 0; display: flex; justify-content: space-between; }
    .entity-name { color: #58a6ff; }
    .entity-count { color: #7ee787; }
    .tag { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; margin: 2px; }
    .tag-verbatim { background: #238636; color: #fff; }
    .tag-derived { background: #9e6a03; color: #fff; }
    .tag-standard { background: #30363d; color: #c9d1d9; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #30363d; color: #484f58; font-size: 12px; }
    @media (max-width: 768px) {
      .content { padding: 15px; }
      .big-number { font-size: 28px; }
      .grid { grid-template-columns: 1fr; }
    }`;

export function renderIntelligence(data: DashboardSummary): string {
  const salienceBarClass = data.avgSalience < 40 ? 'low' : data.avgSalience < 70 ? 'medium' : 'high';
  const total = data.totalMemories || 1;

  const entityListHtml = data.topEntities.map(e =>
    `<div class="entity-item">
          <span class="entity-name">${esc(e.name)}</span>
          <span class="entity-count">${e.count} memories</span>
        </div>`).join('\n      ');

  const sourceRows = Object.entries(data.sources).map(([source, count]) =>
    `<div class="stat-row">
          <span class="stat-label">${esc(source)}</span>
          <span class="stat-value">${count}</span>
        </div>`).join('\n      ');

  return `${head('MemoRable Intelligence', PAGE_CSS, 10)}
<body>
  ${nav('/dashboard')}
  <div class="content">
  <h1>Intelligence Dashboard</h1>
  <p style="color: #8b949e;">Stop talking and start listening. Business Intelligence for the new Age.</p>

  <h2>Memory Gauges</h2>
  <div class="grid">
    <div class="card">
      <h3>Total Memories</h3>
      <div class="big-number">${data.totalMemories}</div>
    </div>
    <div class="card">
      <h3>Average Salience</h3>
      <div class="big-number">${data.avgSalience}</div>
      <div class="bar">
        <div class="bar-fill bar-${salienceBarClass}" style="width: ${data.avgSalience}%"></div>
      </div>
    </div>
    <div class="card">
      <h3>Unique Entities</h3>
      <div class="big-number">${data.uniqueEntities}</div>
    </div>
    <div class="card">
      <h3>Data Sources</h3>
      <div class="big-number">${data.dataSources}</div>
    </div>
  </div>

  <h2>Salience Distribution</h2>
  <div class="grid">
    <div class="card">
      <div class="stat-row">
        <span class="stat-label">High (70-100)</span>
        <span class="stat-value">${data.salience.high}</span>
      </div>
      <div class="bar"><div class="bar-fill bar-high" style="width: ${(data.salience.high / total * 100).toFixed(1)}%"></div></div>
      <div class="stat-row">
        <span class="stat-label">Medium (40-69)</span>
        <span class="stat-value">${data.salience.medium}</span>
      </div>
      <div class="bar"><div class="bar-fill bar-medium" style="width: ${(data.salience.medium / total * 100).toFixed(1)}%"></div></div>
      <div class="stat-row">
        <span class="stat-label">Low (0-39)</span>
        <span class="stat-value">${data.salience.low}</span>
      </div>
      <div class="bar"><div class="bar-fill bar-low" style="width: ${(data.salience.low / total * 100).toFixed(1)}%"></div></div>
    </div>
    <div class="card">
      <h3>Fidelity Types</h3>
      <div class="stat-row">
        <span class="stat-label">Verbatim (exact quotes)</span>
        <span class="stat-value"><span class="tag tag-verbatim">${data.fidelity.verbatim}</span></span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Derived (interpretations)</span>
        <span class="stat-value"><span class="tag tag-derived">${data.fidelity.derived}</span></span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Standard</span>
        <span class="stat-value"><span class="tag tag-standard">${data.fidelity.standard}</span></span>
      </div>
    </div>
  </div>

  <h2>Data Sources</h2>
  <div class="grid">
    <div class="card">
      ${sourceRows || '<div class="stat-row"><span class="stat-label">No sources yet</span></div>'}
    </div>
  </div>

  <h2>Top Entities</h2>
  <div class="card">
    <div class="entity-list">
      ${entityListHtml || '<div class="entity-item"><span class="entity-name">No entities yet</span></div>'}
    </div>
  </div>

  <div class="footer">
    <strong>MemoRable</strong> &mdash; Context Intelligence for AI Agents<br>
    Dashboard auto-refreshes every 10 seconds &bull; Open loops: ${data.openLoops}
  </div>
  </div>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
