/**
 * Landing page — ported from server.js:1121.
 * Static page, no MongoDB queries needed.
 */

export function renderHome(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MemoRable - Memory for AI Agents</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;700;900&family=Share+Tech+Mono&display=block" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #0a0a0f;
      --bg-panel: #0d1117;
      --border: #30363d;
      --cyan: #00ffff;
      --magenta: #ff00ff;
      --green: #00ff41;
      --text: #c9d1d9;
      --text-dim: #6e7681;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Share Tech Mono', monospace;
      background: var(--bg-dark);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .hero {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 40px 20px;
    }
    .logo {
      font-family: 'Orbitron', sans-serif;
      font-size: 64px;
      font-weight: 900;
      color: var(--cyan);
      text-shadow: 0 0 20px var(--cyan), 0 0 40px var(--cyan);
      letter-spacing: 8px;
      margin-bottom: 20px;
    }
    .logo span { color: var(--magenta); text-shadow: 0 0 20px var(--magenta); }
    .tagline {
      font-size: 24px;
      color: var(--text-dim);
      margin-bottom: 10px;
      letter-spacing: 2px;
    }
    .subtitle {
      font-size: 16px;
      color: var(--text-dim);
      margin-bottom: 50px;
      max-width: 600px;
    }
    .cta-buttons {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .btn {
      font-family: 'Orbitron', sans-serif;
      font-size: 14px;
      padding: 16px 40px;
      border-radius: 4px;
      text-decoration: none;
      text-transform: uppercase;
      letter-spacing: 3px;
      transition: all 0.3s;
      cursor: pointer;
    }
    .btn-primary {
      background: var(--cyan);
      color: var(--bg-dark);
      border: 2px solid var(--cyan);
    }
    .btn-primary:hover {
      background: transparent;
      color: var(--cyan);
      box-shadow: 0 0 30px var(--cyan);
    }
    .btn-secondary {
      background: transparent;
      color: var(--magenta);
      border: 2px solid var(--magenta);
    }
    .btn-secondary:hover {
      background: var(--magenta);
      color: var(--bg-dark);
      box-shadow: 0 0 30px var(--magenta);
    }
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 30px;
      padding: 60px 40px;
      max-width: 1200px;
      margin: 0 auto;
    }
    .feature {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 30px;
    }
    .feature h3 {
      font-family: 'Orbitron', sans-serif;
      color: var(--cyan);
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 15px;
    }
    .feature p {
      color: var(--text-dim);
      line-height: 1.6;
    }
    .footer {
      text-align: center;
      padding: 30px;
      border-top: 1px solid var(--border);
      color: var(--text-dim);
      font-size: 12px;
    }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      margin-top: 30px;
      font-size: 12px;
      color: var(--text-dim);
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 10px var(--green);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @media (max-width: 768px) {
      .logo { font-size: 36px; letter-spacing: 4px; }
      .tagline { font-size: 18px; }
      .btn { font-size: 12px; padding: 12px 24px; }
      .features { padding: 30px 20px; }
    }
  </style>
</head>
<body>
  <div class="hero">
    <div class="logo">MEMO<span>RABLE</span></div>
    <div class="tagline">Memory for AI Agents</div>
    <div class="subtitle">
      Context-aware memory with salience scoring, relationship intelligence,
      and predictive recall. 37 MCP tools for Claude Code integration.
    </div>
    <div class="cta-buttons">
      <a href="/login" class="btn btn-primary">Sign In</a>
      <a href="/register" class="btn btn-primary">Register</a>
      <a href="/docs" class="btn btn-secondary">Documentation</a>
      <a href="/dashboard/mission-control" class="btn btn-secondary">Mission Control</a>
      <a href="/dashboard" class="btn btn-secondary">Intelligence</a>
    </div>
    <div class="status">
      <div class="status-dot"></div>
      System Online
    </div>
  </div>

  <div class="features">
    <div class="feature">
      <h3>Salience Scoring</h3>
      <p>Not all memories matter equally. Our engine scores by emotion, novelty, relevance, social weight, and consequences.</p>
    </div>
    <div class="feature">
      <h3>MCP Native</h3>
      <p>37 tools for Claude Code. Store, recall, anticipate, track commitments, understand relationships - all via MCP.</p>
    </div>
    <div class="feature">
      <h3>Privacy First</h3>
      <p>Three-tier security: General, Personal, Vault. Your sensitive data stays encrypted, never leaves your control.</p>
    </div>
    <div class="feature">
      <h3>Predictive Memory</h3>
      <p>21-day pattern learning. Surface the right context before you ask for it. Memory that anticipates.</p>
    </div>
  </div>

  <div class="footer">
    <p>MemoRable &mdash; Context Intelligence for the Age of AI</p>
  </div>
</body>
</html>`;
}
