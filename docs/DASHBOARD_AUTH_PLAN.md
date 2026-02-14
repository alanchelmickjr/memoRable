# Dashboard Authentication & Logging Plan

## Current State

Dashboards are PUBLIC - anyone can access:
- `/dashboard` - Intelligence dashboard
- `/dashboard/interactive` - Gamified
- `/dashboard/mission-control` - Space shuttle style
- `/metrics/dashboard` - Metrics view

Auth API exists but dashboards don't use it.

## Goal

1. Passphrase login for all dashboard routes
2. Session-based auth (cookie, not API key per request)
3. Logging dashboard to see what's happening

## Design

### Login Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  User visits /dashboard                                          │
│         │                                                        │
│         ▼                                                        │
│  Has valid session cookie?                                       │
│         │                                                        │
│    NO   │   YES                                                  │
│    ▼    └────────────────────▶ Show dashboard                   │
│  Redirect to /login                                              │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────┐                                        │
│  │     LOGIN PAGE      │                                        │
│  │  ┌───────────────┐  │                                        │
│  │  │  Passphrase:  │  │                                        │
│  │  │  [__________] │  │                                        │
│  │  │   [Enter]     │  │                                        │
│  │  └───────────────┘  │                                        │
│  └─────────────────────┘                                        │
│         │                                                        │
│         ▼                                                        │
│  POST /login with passphrase                                     │
│         │                                                        │
│         ▼                                                        │
│  Server: knock → exchange → set session cookie                   │
│         │                                                        │
│         ▼                                                        │
│  Redirect to original URL                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Protected Routes

All dashboard routes require auth:
- `/dashboard*` - All dashboard variants
- `/metrics/dashboard` - Metrics view
- `/admin/*` - Future admin routes

Public routes (no auth):
- `/health` - K8s probes
- `/metrics` - Prometheus scrape (no sensitive data)
- `/login` - Login page
- `/auth/*` - Auth API

### Session Storage

Options:
1. **Redis sessions** (recommended) - already have Redis
2. Signed cookies only - stateless but limited
3. MongoDB sessions - heavier

Using Redis via `express-session` + `connect-redis`.

### Logging Dashboard

New route: `/dashboard/logs`

Features:
- Real-time log stream (last N entries)
- Filter by level (info, warn, error)
- Filter by source (auth, memory, hooks, etc.)
- Auto-refresh

Log storage:
- Redis list with TTL (last 1000 entries, 24hr expiry)
- Structured JSON: `{ timestamp, level, source, message, meta }`

### Implementation Steps

1. [ ] Add express-session + connect-redis
2. [ ] Create `/login` page (passphrase input)
3. [ ] Add session middleware to protected routes
4. [ ] Add logging to Redis
5. [ ] Create `/dashboard/logs` view
6. [ ] Test login flow

### Time Freedom Principle

Login sessions:
- Configurable timeout (default 24h)
- "Remember me" option for longer sessions
- User can logout anytime
- **No forced timeouts that lock user out without warning**

---

*Created: 2026-01-28*
