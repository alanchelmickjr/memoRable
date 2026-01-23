# UI/UX Inventory

> Know what you have before building more. - Engineering 101

## Quick Reference

| Endpoint | Type | Description |
|----------|------|-------------|
| `/` | JSON | API info |
| `/health`, `/health/*` | JSON | Health probes (K8s) |
| `/metrics` | Prometheus | Prometheus-compatible metrics |
| `/metrics/json` | JSON | Metrics for programmatic access |
| `/metrics/dashboard` | HTML | Terminal-style metrics view |
| `/dashboard` | HTML | Intelligence dashboard |
| `/dashboard/interactive` | HTML | Gamified dashboard |
| `/dashboard/mission-control` | HTML | Space shuttle system overview |
| `/dashboard/synthetic` | HTML | Synthetic pipeline FFT status |
| `/dashboard/json` | JSON | Dashboard data export |
| `/viewer/:modelId` | HTML | 3D STL viewer (Three.js) |

## Implemented Dashboards

### 1. Metrics Dashboard (`/metrics/dashboard`)

**File**: `src/server.js:1028-1095`

```
┌─────────────────────────────────────────────────────────────┐
│  MemoRable Metrics                    Auto-refresh: 5s      │
├─────────────────────────────────────────────────────────────┤
│  System          │  Counters         │  Latency            │
│  ─────────────   │  ─────────────    │  ─────────────      │
│  Uptime: 14d 3h  │  http_reqs: 1234  │  p50: 12ms          │
│  Heap:  256 MB   │  auth_ok: 890     │  p95: 45ms          │
│  RSS:   512 MB   │  auth_fail: 12    │  p99: 120ms         │
└─────────────────────────────────────────────────────────────┘
```

- **Style**: Terminal green (`#0f0`) on dark (`#1a1a2e`)
- **Features**: Uptime, memory, request counters, latency histograms
- **Tech**: Inline CSS, auto-refresh meta tag

### 2. Intelligence Dashboard (`/dashboard`)

**File**: `src/server.js:1101-1273`

```
┌─────────────────────────────────────────────────────────────┐
│  MemoRable Intelligence                                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ 1,234   │ │   72    │ │   15    │ │    3    │           │
│  │ Total   │ │ Avg Sal │ │ Entities│ │ Sources │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
├─────────────────────────────────────────────────────────────┤
│  Salience Distribution    │  Fidelity Breakdown            │
│  Low (0-39):    ████ 234  │  Verbatim:  ██████ 45         │
│  Medium (40-69):████ 567  │  Derived:   ████ 23           │
│  High (70-100): ████ 433  │  Standard:  ████████████ 1166 │
├─────────────────────────────────────────────────────────────┤
│  Top Entities: alan (456), memorable_project (234), ...    │
└─────────────────────────────────────────────────────────────┘
```

- **Style**: GitHub dark (`#0d1117`, `#58a6ff`)
- **Features**: Memory counts, salience stats, entity breakdown, fidelity types
- **Tech**: CSS Grid, auto-fit

### 3. Gamified Dashboard (`/dashboard/interactive`)

**File**: `src/server.js:1279-2058` (~800 lines)

```
┌─────────────────────────────────────────────────────────────┐
│  ✧ MemoRable ✧                    Level 12 ████████░░ 80%  │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐  │
│  │        ╭────────────╮                                │  │
│  │        │  LVL 12    │   Memory Power: ████████ 82    │  │
│  │        │   (120)    │                                │  │
│  │        ╰────────────╯   XP: ████████░░░░ 8/10        │  │
│  └──────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Quality Meter              │  Achievements                 │
│  Legendary: ████ 12         │  🧠 First Memory             │
│  Epic:      ████████ 34     │  📚 Memory Keeper            │
│  Rare:      ████████████ 56 │  🏆 Memory Master            │
│  Common:    ████ 18         │  💎 Truth Seeker             │
├─────────────────────────────────────────────────────────────┤
│  Relationship Constellation │  Data Streams                │
│  ○ alan (center)            │  claude_code: ████████ 89   │
│    ├── betty                │  api: ████ 23               │
│    ├── project              │  mcp: ██ 8                  │
│    └── robot-001            │                              │
└─────────────────────────────────────────────────────────────┘
```

- **Style**: Sci-fi neon (cyan `#00f0ff`, magenta `#ff00ff`)
- **Features**: Level system, XP bar, achievements, quality tiers
- **Tech**: CSS animations, floating particles, Google Fonts (Orbitron)

### 4. Mission Control (`/dashboard/mission-control`)

**File**: `src/server.js:3628-4937`

```
┌─────────────────────────────────────────────────────────────┐
│  MEMORABLE MISSION CONTROL              [●] ONLINE          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────────────────────────┐  ┌────────┐ │
│  │ GAUGES  │  │                             │  │ RADAR  │ │
│  │ CPU:34% │  │         1,234               │  │ ○ ○    │ │
│  │ MEM:82% │  │    TOTAL MEMORIES           │  │   ○  ○ │ │
│  │ NET:78% │  │                             │  │  ○     │ │
│  └─────────┘  └─────────────────────────────┘  └────────┘ │
│  [INDICATOR ARRAY] ● ● ● ● ● ● ● ● ● ● ● ● ●           │
│  [WAVEFORM] ║║│║║│║║│║║│║║│║║│║║│║║│║║│║║│                 │
│  [CONTROLS] ENGAGE RECALL SYNC PURGE HEAL PULSE            │
└─────────────────────────────────────────────────────────────┘
```

- **Style**: Space shuttle (cyan neon, scanlines, animated)
- **Features**: Gauges, radar, indicator lights, waveform, control buttons
- **Tech**: CSS Grid, SVG gauges, CSS animations, auto-refresh 5s

### 5. Synthetic Pipeline (`/dashboard/synthetic`)

**File**: `src/server.js` (after calendar dashboard)

```
┌─────────────────────────────────────────────────────────────┐
│  SYNTHETIC PIPELINE                                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌─────────────────────┐  ┌───────────────┐ │
│  │ WINDOWS  │  │        84           │  │  STATS        │ │
│  │ 21d ████ │  │   DAYS OBSERVED     │  │  316 records  │ │
│  │ 63d ██   │  │   Pipeline Active   │  │  8 patterns   │ │
│  │ 84d █    │  │                     │  │  316 memories │ │
│  └──────────┘  └─────────────────────┘  └───────────────┘ │
│  [PIPELINE] ● INGEST ● ACCESS ● FFT ● 21D ● 63D ● STABLE │
│  [HEATMAP] ░░▓▓████▓▓░░░░░░░░░░░░▓▓████░░  (hourly)      │
│  [DOW] Mon████ Tue██ Wed████████ Thu███ Fri████            │
│  [FFT] DAILY 91% STABLE | WEEKLY 64% FORMING              │
└─────────────────────────────────────────────────────────────┘
```

- **Style**: Space shuttle (magenta accent, scanlines, animated)
- **Features**: 21/63/84 day gauges, pipeline stage lights, hourly heatmap, DOW chart, FFT results
- **Tech**: CSS Grid, MongoDB aggregation queries, auto-refresh 10s
- **Public**: No auth required (pattern data only, no memory content)

### 6. 3D Viewer (`/viewer/:modelId`)

**File**: `src/services/viewer_gui/index.ts` (782 lines)

```
┌─────────────────────────────────────────────────────────────┐
│  [3D Viewport - Three.js Scene]              ┌───────────┐ │
│                                              │ Controls  │ │
│          ┌───────────────┐                   ├───────────┤ │
│          │               │                   │ Color: #  │ │
│          │   STL Model   │                   │ Metal: ── │ │
│          │               │                   │ Rough: ── │ │
│          └───────────────┘                   │ Wire: [ ] │ │
│                                              │ Opacity:──│ │
│  [Grid] [Axes]                               ├───────────┤ │
│                                              │ Lighting  │ │
│                                              │ Ambient:──│ │
│  Drag: rotate                                │ Direct:── │ │
│  Scroll: zoom                                ├───────────┤ │
│  Shift+drag: pan                             │ [Export]  │ │
│                                              │ [Reset]   │ │
└─────────────────────────────────────────────────────────────┘
```

- **Style**: Dark viewport, light control panel
- **Features**: Orbit controls, material editor, lighting, screenshots
- **Tech**: Three.js r128, STLLoader, OrbitControls (CDN)

## API Endpoints (No UI)

### Authentication
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/auth/knock` | POST | No | Get challenge nonce |
| `/auth/exchange` | POST | No | Trade passphrase for API key |
| `/auth/register` | POST | No | Register new user |
| `/auth/devices` | GET | Yes | List user's devices |
| `/auth/revoke` | POST | Yes | Revoke device key |

### Memory Management
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/memory` | POST | Yes | Store memory |
| `/memory` | GET | Yes | Query memories |
| `/memory/:id` | GET | Yes | Get specific memory |
| `/memory/:id` | DELETE | Yes | Delete memory |
| `/memory/verbatim` | POST | Yes | Store exact quote |
| `/memory/interpretation` | POST | Yes | Store AI interpretation |

### Context & Analysis
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/context/sync` | POST | Yes | Sync context |
| `/context/:userId` | GET | Yes | Get user context |
| `/prosody/analyze` | POST | Yes | Emotion analysis |
| `/stylometry/baseline` | POST | Yes | Author fingerprint |
| `/stylometry/verify` | POST | Yes | Verify authenticity |

### Backup & Projects
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/backup` | POST | Yes | Create backup |
| `/backup` | GET | Yes | List backups |
| `/restore` | POST | Yes | Restore backup |
| `/project` | POST/GET | Yes | Project management |

## Technology Stack

```
┌────────────────────────────────────────────────────────────┐
│                     CURRENT STACK                          │
├────────────────────────────────────────────────────────────┤
│  Rendering:    Server-side HTML (Express)                  │
│  Styling:      Inline CSS (no external files)              │
│  3D:           Three.js r128 (CDN)                         │
│  Fonts:        Google Fonts (Orbitron, Inter)              │
│  Interactivity: Vanilla JS                                 │
│  Frameworks:   None (intentional - like Ollama)            │
│  Static Files: None (all inline)                           │
└────────────────────────────────────────────────────────────┘
```

## What's Missing (Planned)

### Phase 2: User Settings
- `/user/profile` - View/edit profile
- `/user/devices` - Device management UI
- `/user/preferences` - Settings panel
- `/user/passphrase` - Change passphrase

### Phase 3: Admin Panel
- `/admin/dashboard` - System overview
- `/admin/users` - User management
- `/admin/devices` - Device management
- `/admin/settings` - System settings

### Phase 4: Support Tools
- `/admin/support` - Support queue
- `/admin/audit` - Audit log viewer

## Statistics

| Category | Count |
|----------|-------|
| HTML Dashboards | 6 |
| JSON Endpoints | 3 |
| Auth Endpoints | 5 |
| Memory Endpoints | 6 |
| Analysis Endpoints | 4 |
| Backup Endpoints | 5 |
| Project Endpoints | 7 |
| Health Endpoints | 4 |
| **Total Implemented** | **48** |

---

*Generated: 2026-01-19*
*Status: Inventory Complete*
