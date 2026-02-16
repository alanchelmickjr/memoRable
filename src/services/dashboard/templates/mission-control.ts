/**
 * Mission Control — CRT-style dashboard.
 * Ported from server.js:4320. Alan's favorite.
 * Scanlines, radar sweep, indicator lights, wave bars, gauges.
 */

import type { MissionControlData } from '../queries.js';

export function renderMissionControl(data: MissionControlData): string {
  const memoryCount = data.totalMemories;
  const avgSalience = data.avgSalience;
  const entityCount = data.uniqueEntities;
  const sourceCount = data.dataSources;
  const uptimeHours = Math.floor(data.uptimeSeconds / 3600);

  // System vitals (randomized for CRT aesthetic)
  const cpuFake = 23 + Math.floor(Math.random() * 15);
  const memFake = 45 + Math.floor(Math.random() * 20);
  const networkFake = 78 + Math.floor(Math.random() * 20);

  // Radar blips from top entities
  const radarBlips = data.topEntities.slice(0, 5).map((_, i) => {
    const angle = (i * 72) * Math.PI / 180;
    const r = 30 + Math.random() * 40;
    const x = 50 + r * Math.cos(angle);
    const y = 50 + r * Math.sin(angle);
    return `<div class="radar-blip" style="left: ${x}%; top: ${y}%;"></div>`;
  }).join('');

  // Indicator lights
  const indicatorConfig = [
    { icon: '\u25CE', color: 'c1', label: 'context' },
    { icon: '\u263A', color: 'c2', label: 'person' },
    { icon: '\u23F1', color: 'c3', label: 'time' },
    { icon: '\u26A1', color: 'c4', label: 'alert' },
    { icon: '\u2665', color: 'c5', label: 'emotion' },
    { icon: '\u2713', color: 'c6', label: 'task' },
    { icon: '\u25C8', color: 'c7', label: 'memory' },
  ];
  const states = ['on', 'slow', 'off', 'on'];
  const indicatorLights = Array(32).fill(0).map((_, i) => {
    const cfg = indicatorConfig[i % 7];
    const state = states[Math.floor(Math.random() * 4)];
    return `<div class="indicator-light ${cfg.color} ${state}" title="${cfg.label}">${cfg.icon}</div>`;
  }).join('');

  const waveBars = Array(50).fill(0).map((_, i) =>
    `<div class="wave-bar" style="animation-delay: ${(i * 0.05).toFixed(2)}s;"></div>`,
  ).join('');

  const now = new Date();
  const timeStr = (offset: number) => new Date(Date.now() - offset).toISOString().split('T')[1].split('.')[0];

  const gaugeOffset = (pct: number) => (251.2 - (251.2 * pct / 100)).toFixed(1);

  return `<!DOCTYPE html>
<html>
<head>
  <title>MemoRable Mission Control</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="5">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;900&family=Share+Tech+Mono&display=block" rel="stylesheet">
  <style>
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
      overflow-x: hidden;
    }

    /* Scanline effect */
    body::before {
      content: '';
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: repeating-linear-gradient(
        0deg,
        rgba(0, 0, 0, 0.15),
        rgba(0, 0, 0, 0.15) 1px,
        transparent 1px,
        transparent 2px
      );
      pointer-events: none;
      z-index: 1000;
    }

    .header {
      background: linear-gradient(180deg, #1a1a2e 0%, var(--bg-dark) 100%);
      border-bottom: 2px solid var(--cyan);
      padding: 15px 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 0 30px rgba(0, 255, 255, 0.2);
    }

    .logo {
      font-family: 'Orbitron', sans-serif;
      font-size: 24px;
      font-weight: 900;
      color: var(--cyan);
      text-shadow: 0 0 10px var(--cyan), 0 0 20px var(--cyan), 0 0 40px var(--cyan);
      letter-spacing: 4px;
    }
    .logo a { color: inherit; text-decoration: none; }
    .logo span { color: var(--magenta); text-shadow: 0 0 10px var(--magenta); }

    .header-status {
      display: flex;
      gap: 30px;
      align-items: center;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .blink-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      animation: blink 1s infinite;
    }
    .blink-dot.green { background: var(--green); box-shadow: 0 0 10px var(--green); }
    .blink-dot.yellow { background: var(--yellow); box-shadow: 0 0 10px var(--yellow); animation-duration: 0.5s; }
    .blink-dot.red { background: var(--red); box-shadow: 0 0 10px var(--red); animation-duration: 0.3s; }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    .mission-grid {
      display: grid;
      grid-template-columns: 1fr 2fr 1fr;
      grid-template-rows: auto auto auto;
      gap: 15px;
      padding: 20px;
      height: calc(100vh - 70px);
    }

    .panel {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 15px;
      position: relative;
      overflow: hidden;
    }
    .panel::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--cyan), var(--magenta), var(--cyan));
      animation: borderGlow 3s linear infinite;
    }

    @keyframes borderGlow {
      0%, 100% { opacity: 0.5; }
      50% { opacity: 1; }
    }

    .panel-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 3px;
      color: var(--cyan);
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
    }

    .gauge-container { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .gauge { width: 120px; height: 120px; position: relative; }
    .gauge svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .gauge-bg { fill: none; stroke: var(--bg-card); stroke-width: 8; }
    .gauge-fill { fill: none; stroke-width: 8; stroke-linecap: round; transition: stroke-dashoffset 1s ease; }
    .gauge-value {
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
      font-family: 'Orbitron', sans-serif; font-size: 24px; font-weight: 700;
    }
    .gauge-label { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: var(--text-dim); }

    .button-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .fake-button {
      padding: 12px 8px; border-radius: 6px;
      font-family: 'Orbitron', sans-serif; font-size: 9px;
      text-transform: uppercase; letter-spacing: 1px; text-align: center;
      cursor: pointer; transition: all 0.2s; border: 1px solid;
    }
    .fake-button:hover { transform: scale(1.05); box-shadow: 0 0 20px currentColor; }
    .fake-button.cyan { background: rgba(0,255,255,0.1); border-color: var(--cyan); color: var(--cyan); }
    .fake-button.magenta { background: rgba(255,0,255,0.1); border-color: var(--magenta); color: var(--magenta); }
    .fake-button.green { background: rgba(0,255,65,0.1); border-color: var(--green); color: var(--green); }
    .fake-button.yellow { background: rgba(255,255,0,0.1); border-color: var(--yellow); color: var(--yellow); }
    .fake-button.red { background: rgba(255,0,64,0.1); border-color: var(--red); color: var(--red); }
    .fake-button.orange { background: rgba(255,136,0,0.1); border-color: var(--orange); color: var(--orange); }
    .fake-button.active { animation: buttonPulse 1.5s infinite; }

    @keyframes buttonPulse {
      0%, 100% { box-shadow: 0 0 5px currentColor; }
      50% { box-shadow: 0 0 25px currentColor, inset 0 0 10px currentColor; }
    }

    .light-panel { display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; }
    .indicator-light {
      width: 100%; aspect-ratio: 1; border-radius: 50%; border: 2px solid var(--border);
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; color: rgba(0, 0, 0, 0.7);
      text-shadow: 0 0 2px rgba(255, 255, 255, 0.5);
      cursor: help; transition: transform 0.2s ease;
    }
    .indicator-light:hover { transform: scale(1.2); z-index: 10; }
    .indicator-light.on { animation: lightBlink 0.5s infinite; }
    .indicator-light.slow { animation: lightBlink 2s infinite; }
    .indicator-light.off { opacity: 0.2; }
    .indicator-light.c1 { background: var(--cyan); box-shadow: 0 0 8px var(--cyan); }
    .indicator-light.c2 { background: var(--green); box-shadow: 0 0 8px var(--green); }
    .indicator-light.c3 { background: var(--yellow); box-shadow: 0 0 8px var(--yellow); }
    .indicator-light.c4 { background: var(--red); box-shadow: 0 0 8px var(--red); }
    .indicator-light.c5 { background: var(--magenta); box-shadow: 0 0 8px var(--magenta); }
    .indicator-light.c6 { background: var(--orange); box-shadow: 0 0 8px var(--orange); }
    .indicator-light.c7 { background: var(--blue); box-shadow: 0 0 8px var(--blue); }

    @keyframes lightBlink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .waveform { height: 60px; display: flex; align-items: center; gap: 2px; overflow: hidden; }
    .wave-bar {
      flex: 1; background: var(--cyan); min-width: 3px;
      animation: wave 0.5s ease-in-out infinite;
      box-shadow: 0 0 5px var(--cyan);
    }

    @keyframes wave {
      0%, 100% { height: 20%; }
      50% { height: 100%; }
    }

    .data-stream {
      font-size: 10px; height: 150px; overflow: hidden;
      background: var(--bg-card); padding: 10px; border-radius: 4px;
      font-family: 'Share Tech Mono', monospace;
    }
    .data-line { color: var(--green); margin: 3px 0; animation: fadeIn 0.5s ease; }
    .data-line .time { color: var(--text-dim); }
    .data-line .type { color: var(--cyan); }
    .data-line .value { color: var(--yellow); }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .big-stat { text-align: center; padding: 20px; }
    .big-number {
      font-family: 'Orbitron', sans-serif; font-size: 48px; font-weight: 900;
      background: linear-gradient(180deg, var(--cyan), var(--magenta));
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      text-shadow: 0 0 30px rgba(0, 255, 255, 0.5);
    }
    .big-label { font-size: 11px; text-transform: uppercase; letter-spacing: 3px; color: var(--text-dim); margin-top: 5px; }

    .radar-container { position: relative; width: 100%; aspect-ratio: 1; max-width: 200px; margin: 0 auto; }
    .radar {
      width: 100%; height: 100%; border-radius: 50%;
      background:
        radial-gradient(circle, transparent 30%, rgba(0, 255, 255, 0.1) 70%),
        conic-gradient(from 0deg, transparent 0deg, rgba(0, 255, 255, 0.3) 30deg, transparent 60deg);
      animation: radarSweep 4s linear infinite;
      border: 2px solid var(--cyan);
      box-shadow: 0 0 20px rgba(0, 255, 255, 0.3), inset 0 0 30px rgba(0, 255, 255, 0.1);
    }

    @keyframes radarSweep {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .radar-grid {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0; border-radius: 50%;
      background:
        radial-gradient(circle, transparent 20%, transparent 20.5%, rgba(0, 255, 255, 0.2) 21%, transparent 21.5%),
        radial-gradient(circle, transparent 40%, transparent 40.5%, rgba(0, 255, 255, 0.2) 41%, transparent 41.5%),
        radial-gradient(circle, transparent 60%, transparent 60.5%, rgba(0, 255, 255, 0.2) 61%, transparent 61.5%),
        radial-gradient(circle, transparent 80%, transparent 80.5%, rgba(0, 255, 255, 0.2) 81%, transparent 81.5%),
        linear-gradient(0deg, transparent 49.5%, rgba(0, 255, 255, 0.2) 50%, transparent 50.5%),
        linear-gradient(90deg, transparent 49.5%, rgba(0, 255, 255, 0.2) 50%, transparent 50.5%);
    }

    .radar-blip {
      position: absolute; width: 8px; height: 8px;
      background: var(--green); border-radius: 50%;
      box-shadow: 0 0 10px var(--green);
      animation: blipPulse 2s infinite;
    }

    @keyframes blipPulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.5); opacity: 0.5; }
    }

    .main-display {
      grid-column: 2; grid-row: 1 / 3;
      display: flex; flex-direction: column; gap: 15px;
    }

    .hero-panel {
      flex: 1; display: flex; flex-direction: column;
      justify-content: center; align-items: center;
      background: radial-gradient(ellipse at center, rgba(0, 255, 255, 0.05) 0%, transparent 70%);
    }

    .hero-number {
      font-family: 'Orbitron', sans-serif; font-size: 64px; font-weight: 900;
      color: var(--cyan);
      text-shadow: 0 0 20px var(--cyan), 0 0 40px var(--cyan), 0 0 60px var(--cyan);
      line-height: 1;
    }
    .hero-label {
      font-family: 'Orbitron', sans-serif; font-size: 14px;
      text-transform: uppercase; letter-spacing: 8px;
      color: var(--text-dim); margin-top: 10px;
    }
    .hero-sub {
      font-size: 12px; color: var(--magenta);
      margin-top: 20px; text-transform: uppercase; letter-spacing: 4px;
    }

    .footer-bar {
      grid-column: 1 / 4;
      background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px;
      padding: 10px 20px; display: flex; justify-content: space-between; align-items: center;
    }
    .footer-stats { display: flex; gap: 40px; }
    .footer-stat { text-align: center; }
    .footer-stat-value { font-family: 'Orbitron', sans-serif; font-size: 18px; color: var(--cyan); }
    .footer-stat-label { font-size: 9px; text-transform: uppercase; letter-spacing: 2px; color: var(--text-dim); }
    .system-time { font-family: 'Orbitron', sans-serif; font-size: 14px; color: var(--green); text-shadow: 0 0 10px var(--green); }

    .nav-links { display: flex; gap: 20px; align-items: center; }
    .nav-link {
      color: var(--cyan); text-decoration: none; font-size: 11px;
      text-transform: uppercase; letter-spacing: 2px;
      padding: 8px 12px; border: 1px solid var(--cyan); border-radius: 4px;
      transition: all 0.3s;
    }
    .nav-link:hover { background: var(--cyan); color: var(--bg-dark); box-shadow: 0 0 15px var(--cyan); }

    @media (max-width: 1024px) {
      .mission-grid { grid-template-columns: 1fr 1fr; grid-template-rows: auto auto auto auto; height: auto; min-height: calc(100vh - 70px); }
      .main-display { grid-column: 1 / 3; grid-row: 1; }
      .footer-bar { grid-column: 1 / 3; }
      .header { flex-wrap: wrap; gap: 15px; }
      .header-status { flex-wrap: wrap; gap: 15px; }
      .hero-number { font-size: 56px; }
      .footer-stats { gap: 20px; flex-wrap: wrap; }
      .nav-links { display: none; }
    }

    @media (max-width: 768px) {
      .mission-grid { grid-template-columns: 1fr; padding: 10px; gap: 10px; }
      .main-display { grid-column: 1; grid-row: auto; }
      .footer-bar { grid-column: 1; flex-direction: column; gap: 15px; text-align: center; }
      .header { padding: 10px 15px; flex-direction: column; text-align: center; }
      .logo { font-size: 18px; letter-spacing: 2px; }
      .header-status { justify-content: center; }
      .status-indicator { font-size: 10px; }
      .hero-number { font-size: 40px; }
      .hero-label { font-size: 10px; letter-spacing: 4px; }
      .panel-title { font-size: 10px; letter-spacing: 2px; }
      .gauge { width: 80px; height: 80px; }
      .gauge-value { font-size: 16px; }
      .gauge-label { font-size: 9px; }
      .button-grid { grid-template-columns: repeat(2, 1fr); }
      .fake-button { font-size: 8px; padding: 10px 6px; }
      .light-panel { grid-template-columns: repeat(4, 1fr); }
      .footer-stats { justify-content: center; }
      .footer-stat-value { font-size: 14px; }
      .big-number { font-size: 32px; }
      .radar-container { max-width: 120px; }
      .waveform { height: 40px; }
      .data-stream { height: 100px; font-size: 9px; }
    }

    @media (max-width: 480px) {
      .hero-number { font-size: 32px; }
      .gauge { width: 60px; height: 60px; }
      .gauge-value { font-size: 12px; }
      .button-grid { grid-template-columns: 1fr 1fr; gap: 6px; }
      .light-panel { grid-template-columns: repeat(4, 1fr); gap: 4px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo"><a href="/">MEMO<span>RABLE</span></a> // MISSION CONTROL</div>
    <div class="nav-links">
      <a href="/" class="nav-link">Home</a>
      <a href="/docs" class="nav-link">Docs</a>
      <a href="/dashboard" class="nav-link">Dashboard</a>
      <a href="/dashboard/calendar/view" class="nav-link">Calendar</a>
    </div>
    <div class="header-status">
      <div class="status-indicator">
        <div class="blink-dot green"></div>
        CORE ONLINE
      </div>
      <div class="status-indicator">
        <div class="blink-dot yellow"></div>
        INGESTING
      </div>
      <div class="status-indicator">
        <div class="blink-dot green"></div>
        SALIENCE ENGINE
      </div>
    </div>
  </div>

  <div class="mission-grid">
    <!-- Left column -->
    <div class="panel">
      <div class="panel-title">System Vitals</div>
      <div style="display: flex; flex-direction: column; gap: 20px; align-items: center;">
        <div class="gauge-container">
          <div class="gauge">
            <svg viewBox="0 0 100 100">
              <circle class="gauge-bg" cx="50" cy="50" r="40" />
              <circle class="gauge-fill" cx="50" cy="50" r="40"
                stroke="var(--cyan)"
                stroke-dasharray="251.2"
                stroke-dashoffset="${gaugeOffset(cpuFake)}" />
            </svg>
            <div class="gauge-value" style="color: var(--cyan);">${cpuFake}%</div>
          </div>
          <div class="gauge-label">CPU Load</div>
        </div>
        <div class="gauge-container">
          <div class="gauge">
            <svg viewBox="0 0 100 100">
              <circle class="gauge-bg" cx="50" cy="50" r="40" />
              <circle class="gauge-fill" cx="50" cy="50" r="40"
                stroke="var(--magenta)"
                stroke-dasharray="251.2"
                stroke-dashoffset="${gaugeOffset(memFake)}" />
            </svg>
            <div class="gauge-value" style="color: var(--magenta);">${memFake}%</div>
          </div>
          <div class="gauge-label">Memory</div>
        </div>
        <div class="gauge-container">
          <div class="gauge">
            <svg viewBox="0 0 100 100">
              <circle class="gauge-bg" cx="50" cy="50" r="40" />
              <circle class="gauge-fill" cx="50" cy="50" r="40"
                stroke="var(--green)"
                stroke-dasharray="251.2"
                stroke-dashoffset="${gaugeOffset(networkFake)}" />
            </svg>
            <div class="gauge-value" style="color: var(--green);">${networkFake}%</div>
          </div>
          <div class="gauge-label">Network</div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Entity Radar</div>
      <div class="radar-container">
        <div class="radar"></div>
        <div class="radar-grid"></div>
        ${radarBlips}
      </div>
      <div style="text-align: center; margin-top: 10px; font-size: 11px; color: var(--text-dim);">
        ${entityCount} ENTITIES TRACKED
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Indicator Array</div>
      <div class="light-panel">
        ${indicatorLights}
      </div>
    </div>

    <!-- Main display -->
    <div class="main-display">
      <div class="panel hero-panel">
        <div class="hero-number">${memoryCount}</div>
        <div class="hero-label">Total Memories</div>
        <div class="hero-sub">SALIENCE ENGINE ACTIVE</div>
        <div style="margin-top: 30px; padding: 15px; background: rgba(0,255,255,0.05); border: 1px solid var(--cyan); border-radius: 8px; max-width: 400px;">
          <div style="font-size: 12px; color: var(--text-dim); margin-bottom: 8px;">We've all chatted with AI...</div>
          <div style="font-size: 14px; color: var(--cyan);">When was the last time it was <span style="color: var(--magenta);">memorable</span>?</div>
          <div style="margin-top: 10px; font-size: 11px;"><a href="https://memorable.chat" style="color: var(--green); text-decoration: none;">memorable.chat</a> &mdash; Talk to AI that remembers you, like a friend.</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-title">Neural Waveform</div>
        <div class="waveform">
          ${waveBars}
        </div>
      </div>

      <div class="panel">
        <div class="panel-title">Control Matrix</div>
        <div class="button-grid">
          <div class="fake-button cyan active">ENGAGE</div>
          <div class="fake-button magenta">SYNC</div>
          <div class="fake-button green active">ACTIVE</div>
          <div class="fake-button yellow">STANDBY</div>
          <div class="fake-button cyan">RECALL</div>
          <div class="fake-button orange active">PROCESS</div>
          <div class="fake-button green">VERIFY</div>
          <div class="fake-button magenta active">INDEX</div>
          <div class="fake-button red">PURGE</div>
          <div class="fake-button cyan active">PREDICT</div>
          <div class="fake-button yellow">ARCHIVE</div>
          <div class="fake-button green active">LEARN</div>
        </div>
      </div>
    </div>

    <!-- Right column -->
    <div class="panel">
      <div class="panel-title">Salience Power</div>
      <div class="big-stat">
        <div class="big-number">${avgSalience}</div>
        <div class="big-label">Average Score</div>
      </div>
      <div class="gauge-container" style="margin-top: 20px;">
        <div class="gauge">
          <svg viewBox="0 0 100 100">
            <circle class="gauge-bg" cx="50" cy="50" r="40" />
            <circle class="gauge-fill" cx="50" cy="50" r="40"
              stroke="var(--yellow)"
              stroke-dasharray="251.2"
              stroke-dashoffset="${gaugeOffset(avgSalience)}" />
          </svg>
          <div class="gauge-value" style="color: var(--yellow);">${avgSalience}</div>
        </div>
        <div class="gauge-label">Salience Index</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Data Stream</div>
      <div class="data-stream">
        <div class="data-line"><span class="time">[${timeStr(0)}]</span> <span class="type">SYS</span> Memory core initialized</div>
        <div class="data-line"><span class="time">[${timeStr(1000)}]</span> <span class="type">SAL</span> Salience engine: <span class="value">ACTIVE</span></div>
        <div class="data-line"><span class="time">[${timeStr(2000)}]</span> <span class="type">NET</span> Entity graph: <span class="value">${entityCount} nodes</span></div>
        <div class="data-line"><span class="time">[${timeStr(3000)}]</span> <span class="type">MEM</span> Storage: <span class="value">${memoryCount} records</span></div>
        <div class="data-line"><span class="time">[${timeStr(4000)}]</span> <span class="type">AUTH</span> Gate status: <span class="value">SECURE</span></div>
        <div class="data-line"><span class="time">[${timeStr(5000)}]</span> <span class="type">SYS</span> All systems nominal</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">Quick Stats</div>
      <div style="display: flex; flex-direction: column; gap: 15px;">
        <div class="big-stat">
          <div class="big-number" style="font-size: 36px; -webkit-text-fill-color: var(--green);">${entityCount}</div>
          <div class="big-label">Entities</div>
        </div>
        <div class="big-stat">
          <div class="big-number" style="font-size: 36px; -webkit-text-fill-color: var(--orange);">${sourceCount}</div>
          <div class="big-label">Sources</div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer-bar">
      <div class="footer-stats">
        <div class="footer-stat">
          <div class="footer-stat-value">${memoryCount}</div>
          <div class="footer-stat-label">Memories</div>
        </div>
        <div class="footer-stat">
          <div class="footer-stat-value">${entityCount}</div>
          <div class="footer-stat-label">Entities</div>
        </div>
        <div class="footer-stat">
          <div class="footer-stat-value">${avgSalience}%</div>
          <div class="footer-stat-label">Avg Salience</div>
        </div>
        <div class="footer-stat">
          <div class="footer-stat-value">${uptimeHours}h</div>
          <div class="footer-stat-label">Uptime</div>
        </div>
      </div>
      <div class="system-time" id="systemTime"></div>
    </div>
  </div>

  <script>
    function updateTime() {
      const now = new Date();
      document.getElementById('systemTime').textContent =
        now.toISOString().replace('T', ' // ').split('.')[0] + ' UTC';
    }
    updateTime();
    setInterval(updateTime, 1000);

    document.querySelectorAll('.fake-button').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.style.transform = 'scale(0.95)';
        btn.style.boxShadow = '0 0 40px currentColor, inset 0 0 20px currentColor';
        setTimeout(() => {
          btn.style.transform = '';
          btn.style.boxShadow = '';
        }, 200);
      });
    });
  </script>
</body>
</html>`;
}
