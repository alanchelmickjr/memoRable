/**
 * Calendar view — ported from server.js:5462.
 * Client-side JS fetches /dashboard/calendar JSON and renders.
 */

export function renderCalendar(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>MemoRable Calendar</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=block" rel="stylesheet">
  <style>
    :root {
      --bg: #0a0a0f;
      --panel: #0d1117;
      --card: #161b22;
      --border: #30363d;
      --cyan: #00ffff;
      --magenta: #ff00ff;
      --green: #00ff41;
      --text: #c9d1d9;
      --dim: #6e7681;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Share Tech Mono', monospace;
      background: var(--bg);
      color: var(--text);
      padding: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .header h1 {
      font-family: 'Orbitron', sans-serif;
      color: var(--cyan);
      font-size: 2em;
      text-shadow: 0 0 20px var(--cyan);
    }
    .header .subtitle {
      color: var(--dim);
      margin-top: 5px;
    }
    .back-link {
      display: inline-block;
      margin-bottom: 20px;
      color: var(--cyan);
      text-decoration: none;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 2px;
      padding: 8px 16px;
      border: 1px solid var(--border);
      border-radius: 4px;
      transition: all 0.3s;
    }
    .back-link:hover {
      background: rgba(0,255,255,0.1);
      border-color: var(--cyan);
    }
    .week-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 10px;
      margin-bottom: 30px;
    }
    .day-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 15px;
      text-align: center;
    }
    .day-card.today {
      border-color: var(--cyan);
      box-shadow: 0 0 10px rgba(0,255,255,0.3);
    }
    .day-name { color: var(--dim); font-size: 0.8em; margin-bottom: 5px; }
    .day-date { font-size: 1.2em; margin-bottom: 10px; }
    .day-count { font-size: 2em; color: var(--green); text-shadow: 0 0 10px rgba(0,255,65,0.5); }
    .day-salience { color: var(--magenta); font-size: 0.9em; margin-top: 5px; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }
    .stat-value { font-size: 2.5em; color: var(--cyan); }
    .stat-label { color: var(--dim); font-size: 0.8em; margin-top: 5px; }
    .progress-section {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
    }
    .progress-bar {
      height: 20px;
      background: var(--card);
      border-radius: 10px;
      overflow: hidden;
      margin: 10px 0;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--cyan), var(--magenta));
      transition: width 0.5s;
    }
    @media (max-width: 768px) {
      .week-grid { grid-template-columns: repeat(3, 1fr); }
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
      .stat-value { font-size: 1.8em; }
      .day-count { font-size: 1.5em; }
    }
    @media (max-width: 480px) {
      .week-grid { grid-template-columns: repeat(2, 1fr); }
      .stats-grid { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <a href="/dashboard" class="back-link">&larr; Dashboard</a>

  <div class="header">
    <h1>MEMORABLE // CALENDAR</h1>
    <div class="subtitle">Rolling 7-day memory view &bull; Updates every 5s</div>
  </div>

  <div class="week-grid" id="weekGrid">
    <div class="day-card"><div class="day-name">Loading...</div></div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-value" id="totalMemories">-</div>
      <div class="stat-label">TOTAL MEMORIES</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="avgSalience">-</div>
      <div class="stat-label">AVG SALIENCE</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="entities">-</div>
      <div class="stat-label">ENTITIES</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="daysToPredict">-</div>
      <div class="stat-label">DAYS TO PREDICT</div>
    </div>
  </div>

  <div class="progress-section">
    <div style="display: flex; justify-content: space-between;">
      <span>PATTERN LEARNING</span>
      <span id="confidence">0%</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill" id="progressFill" style="width: 0%"></div>
    </div>
    <div style="color: var(--dim); font-size: 0.8em;">
      21 days to habit formation &bull; 63 days to stable patterns
    </div>
  </div>

  <script>
    async function loadData() {
      try {
        const res = await fetch('/dashboard/calendar');
        const data = await res.json();

        const today = new Date().toISOString().split('T')[0];
        document.getElementById('weekGrid').innerHTML = data.week.map(function(day) {
          var loopHtml = day.loops > 0
            ? '<div style="color: var(--magenta); font-size: 0.8em; margin-top: 5px;">' + day.loops + ' loops</div>'
            : '';
          return '<div class="day-card ' + (day.date === today ? 'today' : '') + '">'
            + '<div class="day-name">' + day.dayName + '</div>'
            + '<div class="day-date">' + day.date.split('-').slice(1).join('/') + '</div>'
            + '<div class="day-count">' + day.count + '</div>'
            + '<div class="day-salience">' + day.avgSalience + ' sal</div>'
            + loopHtml
            + '</div>';
        }).join('');

        document.getElementById('totalMemories').textContent = data.totals.memories;
        document.getElementById('avgSalience').textContent = data.totals.avgSalience;
        document.getElementById('entities').textContent = data.totals.entities;
        document.getElementById('daysToPredict').textContent = data.patterns.daysUntilHabitComplete;

        var conf = parseFloat(data.patterns.confidence) * 100;
        document.getElementById('confidence').textContent = conf.toFixed(1) + '%';
        document.getElementById('progressFill').style.width = conf + '%';
      } catch (err) {
        console.error('Failed to load calendar data:', err);
      }
    }

    loadData();
    setInterval(loadData, 5000);
  </script>
</body>
</html>`;
}
