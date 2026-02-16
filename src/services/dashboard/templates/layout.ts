/**
 * Shared layout: nav bar, dark theme CSS, <head>.
 * Ported from server.js dashboard pages.
 */

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;900&family=Share+Tech+Mono&display=block" rel="stylesheet">`;

const CSS_VARS = `
    :root {
      --bg-dark: #0a0a0f;
      --bg-panel: #0d1117;
      --bg-card: #161b22;
      --border: #30363d;
      --cyan: #00ffff;
      --magenta: #ff00ff;
      --yellow: #ffff00;
      --green: #00ff41;
      --red: #ff0040;
      --orange: #ff8800;
      --blue: #0088ff;
      --text: #c9d1d9;
      --text-dim: #6e7681;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Share Tech Mono', monospace;
      background: var(--bg-dark);
      color: var(--text);
      min-height: 100vh;
    }`;

export function nav(active: string): string {
  const links = [
    { href: '/dashboard', label: 'Intelligence' },
    { href: '/dashboard/mission-control', label: 'Mission Control' },
    { href: '/dashboard/synthetic', label: 'Synthetic' },
    { href: '/dashboard/logs', label: 'Logs' },
    { href: '/dashboard/calendar/view', label: 'Calendar' },
    { href: '/docs', label: 'Docs' },
  ];

  return `<nav class="nav">
    <a href="/" class="nav-logo">MEMO<span>RABLE</span></a>
    <div class="nav-links">
      ${links.map(l =>
        `<a href="${l.href}" class="nav-link${l.href === active ? ' active' : ''}">${l.label}</a>`,
      ).join('\n      ')}
    </div>
  </nav>`;
}

const NAV_CSS = `
    .nav { background: linear-gradient(180deg, #1a1a2e 0%, #0d1117 100%); border-bottom: 2px solid #00ffff; padding: 15px 30px; display: flex; justify-content: space-between; align-items: center; }
    .nav-logo { font-family: 'Orbitron', sans-serif; font-size: 20px; font-weight: 900; color: #00ffff; text-shadow: 0 0 10px #00ffff; letter-spacing: 3px; text-decoration: none; }
    .nav-logo span { color: #ff00ff; text-shadow: 0 0 10px #ff00ff; }
    .nav-links { display: flex; gap: 15px; flex-wrap: wrap; }
    .nav-link { color: #00ffff; text-decoration: none; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; padding: 8px 16px; border: 1px solid #30363d; border-radius: 4px; transition: all 0.3s; }
    .nav-link:hover { background: rgba(0,255,255,0.1); border-color: #00ffff; box-shadow: 0 0 15px rgba(0,255,255,0.3); }
    .nav-link.active { background: #00ffff; color: #0d1117; border-color: #00ffff; }
    @media (max-width: 768px) {
      .nav { flex-direction: column; gap: 10px; padding: 10px 15px; }
      .nav-links { justify-content: center; }
      .nav-link { font-size: 9px; padding: 6px 10px; }
    }`;

export function head(title: string, extraCss = '', autoRefresh?: number): string {
  const refreshMeta = autoRefresh ? `\n  <meta http-equiv="refresh" content="${autoRefresh}">` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">${refreshMeta}
  <title>${title}</title>
  ${FONTS}
  <style>${CSS_VARS}${NAV_CSS}${extraCss}
  </style>
</head>`;
}
