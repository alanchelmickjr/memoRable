# Portal by Synegesis

> "The same Claude, everywhere you go, that knows you like a friend."

## Why Portal Exists

**Warp is compromised.** Every memory stored in their terminal is sent PLAIN TEXT to Washington DC. We saw it in the logs. Their AI intercepts commands, runs alongside Claude Code without announcing itself, and causes chaos when two AIs fight for control.

**If it's not open, it's not yours.**

Portal is the anti-Warp: fully open source, zero telemetry, your data stays yours.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         SYNEGESIS                                │
│  "synthesis + genesis" - the birth of unified intelligence       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│   │   daemon/    │    │    term/     │    │  memories/   │      │
│   │              │    │              │    │              │      │
│   │ Claude Brain │◄──►│   Portal     │    │  TUI Dash    │      │
│   │   Service    │    │  Terminal    │    │  (done)      │      │
│   │              │    │              │    │              │      │
│   └──────┬───────┘    └──────────────┘    └──────────────┘      │
│          │                                                       │
│          ▼                                                       │
│   ┌──────────────┐                                               │
│   │  MemoRable   │  ◄── Your memories, your control              │
│   │     API      │                                               │
│   └──────────────┘                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Three Packages (Loose Coupling)

Each piece works **standalone**. Easy to strip, adaptable, portable.

---

## 1. daemon/ - The Brain

Always-on Claude service with memory integration.

### Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/chat` | POST | Send message to Claude, get response |
| `/tasks` | GET/POST | Task management |
| `/memory` | GET/POST | MemoRable integration |
| `/context/:project` | GET | Device handoff - switch projects seamlessly |

### Stack
- Node.js + Express
- Claude API (Anthropic SDK)
- MemoRable API client
- Dockerfile for AWS ECS deployment

### Key Feature: Device Handoff
```bash
# On laptop
curl http://daemon/context/memorable

# On phone (same daemon)
curl http://daemon/context/memorable
# → Same context, same Claude, same memories
```

---

## 2. term/ - Portal Terminal

The actual terminal application. No telemetry. Ever.

### Stack
- **Tauri** - Rust backend, tiny footprint (~10MB vs Electron's 150MB+)
- **xterm.js** - Terminal emulator for the web view
- **No Electron** - "Warp is Rust - we use Tauri to stand on shoulders not carry load alone"

### Features (Already Built)
- Copy/paste: `Cmd+C` / `Cmd+V`
- Line editing: `Ctrl+A` (start), `Ctrl+E` (end), `Ctrl+U` (clear), `Ctrl+K` (kill)
- Cursor navigation
- `/jarvis` - Talk to Claude Code
- `/ctx` - Session context display

### Features (To Build)
- [ ] Syntax highlighting
- [ ] Split panes
- [ ] Session persistence
- [ ] Theme customization (purple default - Alan's preference)
- [ ] MemoRable sidebar (quick memory access)
- [ ] Cross-device sync via daemon

### Design Principles
- **Built for 80-90 WPM** - responsive, no lag
- **Vision that sees halos** - high contrast, clear fonts
- **Boats don't have sharp corners** - rounded UI, soft edges
- **Thicc borders** - visual clarity, not minimalist-to-fault

---

## 3. memories/ - TUI Dashboard (DONE)

Terminal-based memory viewer.

- Rich purple theme
- Thicc borders
- Memory search/browse
- Already complete from previous session

---

## Branding

**Name**: Portal by Synegesis
**Tagline**: "The same Claude, everywhere you go, that knows you like a friend."
**Theme**: Purple (rich, not neon)
**Philosophy**: Open source, zero telemetry, user sovereignty

---

## Development Roadmap

### Phase 1: Foundation
1. Set up monorepo structure in memoRable (`packages/portal/`)
2. Create daemon service with Claude API + MemoRable
3. Scaffold Tauri app for terminal

### Phase 2: Core Terminal
4. Implement xterm.js integration
5. Add /jarvis command (Claude Code integration)
6. Add /ctx command (context display)
7. Implement line editing and shortcuts

### Phase 3: Memory Integration
8. Wire Portal to MemoRable API
9. Add memory sidebar
10. Implement context handoff between devices

### Phase 4: Polish
11. Theme system (purple default)
12. Split panes
13. Session persistence
14. Cross-device sync

---

## Technical Decisions

### Why Tauri over Electron?
| Aspect | Tauri | Electron |
|--------|-------|----------|
| Binary size | ~10MB | ~150MB |
| Memory usage | ~30MB | ~100MB+ |
| Backend | Rust | Node.js |
| Security | Sandboxed | Less isolated |
| Telemetry | None | Optional but common |

### Why xterm.js?
- Battle-tested (used by VS Code, Hyper, etc.)
- Full terminal emulation
- WebGL renderer for performance
- Extensive addon ecosystem

### Why Separate Daemon?
- Works without terminal (API-first)
- Enables mobile web UI
- Single source of truth for context
- Scales independently

---

## Security Principles

1. **Zero telemetry** - No data leaves your machine unless you explicitly send it
2. **Local-first** - Works offline, syncs when connected
3. **Open source** - Audit everything
4. **API key management** - Keys stay in your keychain, never in code
5. **No hidden AI** - One AI (Claude), announced, transparent

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `/jarvis` | Talk to Claude Code |
| `/ctx` | Show current session context |
| `/memory <query>` | Search MemoRable |
| `/project <name>` | Switch project context |
| `/handoff` | Generate handoff summary for device switch |
| `/clear` | Clear terminal |
| `/theme <name>` | Switch theme |

---

## Previous Work Reference

- **Commit**: `cdd45d4` in loom repo
- **Local path** (Alan's machine): `/Users/crackerjack/dev/GitHub/loom/packages/`
- **GitHub**: `github.com/alanchelmickjr/loom`

---

## The Vision

Portal isn't just a terminal. It's the interface to your AI partner that:
- Remembers your preferences
- Knows your projects
- Follows you across devices
- Never spies on you
- Is yours to modify and extend

**If it's not open, it's not yours.**

---

*Document created: 2026-01-18*
*Status: Ready for implementation*
