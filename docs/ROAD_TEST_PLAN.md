# MemoRable Road Test Plan

**Date:** 2026-01-18
**Tester:** Claude
**Purpose:** Actually run the software. Document what works. Fix what doesn't.

---

## Test Environment

- **Machine:** macOS Darwin 25.2.0
- **Working Directory:** /Users/crackerjack/dev/GitHub/memoRable
- **Live Stack URL:** http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com

### Test Credentials (Dev/Test Stack Only)

```bash
# API Key for dev/test stack (stored in SSM: /memorable/api-key)
export MEMORABLE_API_KEY="hKiToQUchIAx8bwi5Y00RWVYN6ZxRzAk"

# Test with:
curl -H "X-API-Key: $MEMORABLE_API_KEY" http://memorable-alb-1679440696.us-west-2.elb.amazonaws.com/dashboard
```

**Note:** This is the shared dev/test key. Production deployments should generate unique keys.

---

## Test 1: Fresh Clone Simulation

**Goal:** Verify the README instructions work from scratch

### Steps:
1. Check Node.js version (need 18+)
2. Check Docker is running
3. Run `npm install`
4. Run `npm run setup`
5. Verify `.env` was generated

### Success Criteria:
- [ ] No npm errors
- [ ] `.env` file created with values
- [ ] No missing dependencies

### Actual Results:
```
(to be filled during execution)
```

---

## Test 2: Docker Stack Startup

**Goal:** Verify `docker-compose up -d` brings up all services

### Steps:
1. Run `docker-compose up -d`
2. Wait 30 seconds
3. Check `docker-compose ps`
4. Verify all services healthy

### Expected Services:
| Service | Port | Status Expected |
|---------|------|-----------------|
| memorable_app | 3000 | Up |
| memorable_mcp_server | - | Up |
| memorable_mongo | 27017 | Up |
| memorable_redis | 6379 | Up |
| memorable_weaviate | 8080 | Up |

### Success Criteria:
- [ ] All containers running
- [ ] No restart loops
- [ ] Logs show successful startup

### Actual Results:
```
(to be filled during execution)
```

---

## Test 3: Health Endpoints

**Goal:** Verify health endpoints respond correctly

### Steps:
1. `curl http://localhost:3000/health`
2. `curl http://localhost:3000/health/live`
3. `curl http://localhost:3000/health/ready`

### Success Criteria:
- [ ] Returns JSON
- [ ] Status 200
- [ ] Shows connected services

### Actual Results:
```
Health: PASS - {"healthy":true,"uptime":210167234}
Dashboard: PASS - Returns full HTML dashboard with 269 memories
```

---

## Test 4: Core API Endpoints

### CRITICAL FINDING: API Mismatch

**README documents endpoints that DON'T EXIST in server.js!**

| Documented | Actual | Status |
|------------|--------|--------|
| `POST /api/memory` | `POST /memory` | Path mismatch |
| `GET /api/memory` | `GET /memory` | Path mismatch |
| `GET /api/briefing?person=X` | NONE | NOT IMPLEMENTED |
| `GET /api/loops` | NONE | NOT IMPLEMENTED |
| `GET /api/sync/status` | NONE | NOT IMPLEMENTED |

**Actual Routes in server.js (43 total):**
- `/health`, `/health/live`, `/health/ready`, `/health/startup`
- `/dashboard`, `/dashboard/json`, `/dashboard/interactive`
- `/memory`, `/memory/:id`, `/memory/:id/perspective`, `/memory/verbatim`, `/memory/interpretation`
- `/context/sync`, `/context/:userId`
- `/frame`, `/frame/:name`
- `/backup`, `/backup/:id`, `/restore`
- `/project/*` routes
- `/stylometry/*`, `/prosody/*`
- `/metrics`, `/metrics/json`, `/metrics/dashboard`

**Goal:** Verify documented API endpoints work

### Steps:
1. Store a memory:
   ```bash
   curl -X POST http://localhost:3000/api/memory \
     -H "Content-Type: application/json" \
     -d '{"text":"Test memory from road test","userId":"road-test-user"}'
   ```

2. Recall memories:
   ```bash
   curl "http://localhost:3000/api/memory?query=test&userId=road-test-user"
   ```

3. Get briefing:
   ```bash
   curl "http://localhost:3000/api/briefing?person=Sarah&userId=road-test-user"
   ```

4. List loops:
   ```bash
   curl "http://localhost:3000/api/loops?userId=road-test-user"
   ```

### Success Criteria:
- [ ] POST returns memory ID
- [ ] GET returns stored memory
- [ ] Briefing returns structured data
- [ ] Loops returns array (even if empty)

### Actual Results:
```
(to be filled during execution)
```

---

## Test 5: MCP Server

**Goal:** Verify MCP server starts and responds

### Steps:
1. Check MCP server logs: `docker logs memorable_mcp_server`
2. Verify no crash loops
3. Test stdio communication (if possible)

### Success Criteria:
- [ ] Server starts without errors
- [ ] Logs show "MCP server ready" or similar
- [ ] No connection refused errors

### Actual Results:
```
(to be filled during execution)
```

---

## Test 6: Ingestion Service

**Goal:** Verify ingestion service on port 8001

### Steps:
1. Check if service is running on 8001
2. Hit ingestion endpoint:
   ```bash
   curl -X POST http://localhost:8001/api/ingest/memory \
     -H "Content-Type: application/json" \
     -d '{"text":"Ingested memory test","userId":"road-test-user"}'
   ```

### Success Criteria:
- [ ] Port 8001 responds
- [ ] Returns success response

### Actual Results:
```
(to be filled during execution)
```

---

## Breakage Log

| Test | What Broke | Error Message | Fix Applied | Fixed? |
|------|------------|---------------|-------------|--------|
| | | | | |

---

## Summary

**Tests Passed:** _/6
**Tests Failed:** _/6
**Blockers Found:**

**Ready for v1.0 branch?** YES / NO

---

## Notes

(observations, surprises, things to improve)
