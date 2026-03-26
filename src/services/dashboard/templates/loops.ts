/**
 * Commitment Tracker Dashboard — /dashboard/loops
 * Shows open loops in three panels: I Owe / They Owe / Overdue.
 * Close button fires POST /loops/:id/close and removes the card from DOM.
 */

import { head, nav } from './layout.js';

export interface LoopItem {
  id: string;
  description: string;
  owner: 'self' | 'them' | 'mutual' | string;
  otherParty?: string;
  dueDate?: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent' | string;
  isOverdue?: boolean;
  loopType?: string;
  category?: string;
}

export interface LoopsData {
  iOwe: LoopItem[];
  theyOwe: LoopItem[];
  overdue: LoopItem[];
  total: number;
}

const PAGE_CSS = `
  .content { padding: 20px 30px; max-width: 1400px; margin: 0 auto; }
  h1 { font-family: 'Orbitron', sans-serif; color: #00ffff; border-bottom: 1px solid #30363d; padding-bottom: 10px; margin-bottom: 6px; }
  .subtitle { color: #6e7681; font-size: 13px; margin-bottom: 30px; }
  .panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; }
  .panel { background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 20px; }
  .panel-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid #30363d;
  }
  .panel-title.i-owe { color: #ff00ff; border-bottom-color: rgba(255,0,255,0.3); }
  .panel-title.they-owe { color: #00ff41; border-bottom-color: rgba(0,255,65,0.3); }
  .panel-title.overdue { color: #ff0040; border-bottom-color: rgba(255,0,64,0.3); }
  .loop-card {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 14px;
    margin-bottom: 10px;
    transition: border-color 0.2s;
  }
  .loop-card:hover { border-color: #58a6ff; }
  .loop-card.overdue-card { border-color: rgba(255,0,64,0.5); box-shadow: 0 0 8px rgba(255,0,64,0.15); }
  .loop-desc { color: #c9d1d9; font-size: 14px; line-height: 1.5; margin-bottom: 10px; }
  .loop-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 10px; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 600;
  }
  .badge-iowe { background: rgba(255,0,255,0.15); color: #ff00ff; border: 1px solid rgba(255,0,255,0.4); }
  .badge-theyowe { background: rgba(0,255,65,0.15); color: #00ff41; border: 1px solid rgba(0,255,65,0.4); }
  .badge-mutual { background: rgba(0,255,255,0.15); color: #00ffff; border: 1px solid rgba(0,255,255,0.4); }
  .badge-urgent { background: rgba(255,0,64,0.2); color: #ff0040; border: 1px solid rgba(255,0,64,0.5); }
  .badge-high { background: rgba(255,136,0,0.2); color: #ff8800; border: 1px solid rgba(255,136,0,0.5); }
  .badge-normal { background: rgba(0,255,255,0.1); color: #00ffff; border: 1px solid rgba(0,255,255,0.3); }
  .badge-low { background: rgba(110,118,129,0.2); color: #6e7681; border: 1px solid #30363d; }
  .badge-overdue { background: rgba(255,0,64,0.2); color: #ff0040; border: 1px solid rgba(255,0,64,0.5); }
  .loop-person { color: #58a6ff; font-size: 12px; }
  .loop-due { color: #6e7681; font-size: 11px; }
  .loop-due.soon { color: #ff8800; }
  .loop-footer { display: flex; justify-content: flex-end; }
  .btn-close {
    font-family: 'Share Tech Mono', monospace;
    font-size: 11px;
    padding: 5px 12px;
    border: 1px solid #30363d;
    border-radius: 4px;
    background: transparent;
    color: #6e7681;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 1px;
    transition: all 0.2s;
  }
  .btn-close:hover { border-color: #00ff41; color: #00ff41; box-shadow: 0 0 8px rgba(0,255,65,0.2); }
  .btn-close:disabled { opacity: 0.4; cursor: not-allowed; }
  .empty { color: #484f58; font-size: 13px; text-align: center; padding: 30px 0; }
  .summary-bar {
    display: flex;
    gap: 20px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }
  .summary-stat { font-size: 12px; color: #6e7681; }
  .summary-stat strong { color: #c9d1d9; font-size: 20px; display: block; font-family: 'Orbitron', sans-serif; }
  @media (max-width: 768px) {
    .content { padding: 15px; }
    .panels { grid-template-columns: 1fr; gap: 16px; }
    .summary-bar { gap: 15px; }
  }
  @media (max-width: 480px) {
    h1 { font-size: 18px; }
    .loop-desc { font-size: 13px; }
  }
`;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ownerBadge(owner: string): string {
  if (owner === 'self') return '<span class="badge badge-iowe">I Owe</span>';
  if (owner === 'them') return '<span class="badge badge-theyowe">Owed to Me</span>';
  return '<span class="badge badge-mutual">Mutual</span>';
}

function urgencyBadge(urgency: string): string {
  const cls = ['urgent', 'high', 'normal', 'low'].includes(urgency) ? urgency : 'normal';
  const label = urgency === 'urgent' ? 'URGENT' : urgency.toUpperCase();
  return `<span class="badge badge-${cls}">${label}</span>`;
}

function dueLabel(dueDate?: string, isOverdue?: boolean): string {
  if (!dueDate) return '';
  const due = new Date(dueDate);
  const daysUntil = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const label = isOverdue
    ? `Overdue by ${Math.abs(daysUntil)}d`
    : daysUntil === 0 ? 'Due today'
    : daysUntil === 1 ? 'Due tomorrow'
    : `Due in ${daysUntil}d`;
  const cls = (isOverdue || daysUntil <= 2) ? 'loop-due soon' : 'loop-due';
  return `<span class="${cls}">${label}</span>`;
}

function loopCard(loop: LoopItem): string {
  const cardClass = loop.isOverdue ? 'loop-card overdue-card' : 'loop-card';
  const person = loop.otherParty ? `<span class="loop-person">↔ ${esc(loop.otherParty)}</span>` : '';
  const due = dueLabel(loop.dueDate, loop.isOverdue);
  const overdueBadge = loop.isOverdue ? '<span class="badge badge-overdue">Overdue</span>' : '';

  return `
  <div class="${cardClass}" id="loop-${esc(loop.id)}">
    <div class="loop-desc">${esc(loop.description)}</div>
    <div class="loop-meta">
      ${ownerBadge(loop.owner)}
      ${urgencyBadge(loop.urgency)}
      ${overdueBadge}
      ${person}
      ${due}
    </div>
    <div class="loop-footer">
      <button class="btn-close" onclick="closeLoop('${esc(loop.id)}', this)">Mark Done</button>
    </div>
  </div>`;
}

function panel(title: string, cssClass: string, loops: LoopItem[]): string {
  const cards = loops.length
    ? loops.map(loopCard).join('')
    : '<div class="empty">All clear</div>';
  return `
  <div class="panel">
    <div class="panel-title ${cssClass}">${title} <span style="color:#484f58;font-size:11px;">(${loops.length})</span></div>
    ${cards}
  </div>`;
}

export function renderLoops(data: LoopsData): string {
  const totalOverdue = data.overdue.length;
  const totalOpen = data.iOwe.length + data.theyOwe.length + data.overdue.length;

  return `${head('Commitments — MemoRable', PAGE_CSS)}
<body>
  ${nav('/dashboard/loops')}
  <div class="content">
    <h1>Commitments</h1>
    <p class="subtitle">Open loops. Things that need closing. The world runs on keeping your word.</p>

    <div class="summary-bar">
      <div class="summary-stat"><strong>${data.iOwe.length}</strong>I Owe</div>
      <div class="summary-stat"><strong>${data.theyOwe.length}</strong>Owed to Me</div>
      <div class="summary-stat"><strong style="color:${totalOverdue > 0 ? '#ff0040' : '#00ff41'}">${totalOverdue}</strong>Overdue</div>
      <div class="summary-stat"><strong>${totalOpen}</strong>Total Open</div>
    </div>

    <div class="panels">
      ${panel('I Owe', 'i-owe', data.iOwe)}
      ${panel('Owed to Me', 'they-owe', data.theyOwe)}
      ${panel('Overdue', 'overdue', data.overdue)}
    </div>
  </div>

  <script>
    async function closeLoop(id, btn) {
      btn.disabled = true;
      btn.textContent = 'Closing...';
      try {
        const res = await fetch('/loops/' + id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (res.ok) {
          const card = document.getElementById('loop-' + id);
          if (card) { card.style.opacity = '0'; card.style.transition = 'opacity 0.3s'; setTimeout(() => card.remove(), 300); }
        } else {
          btn.disabled = false;
          btn.textContent = 'Mark Done';
        }
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Mark Done';
      }
    }
  </script>
</body>
</html>`;
}
