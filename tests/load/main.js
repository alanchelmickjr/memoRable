/* global __ENV, __VU */
import http from "k6/http";
import { check, sleep } from "k6";

// All config from environment — no hardcoded values
const RAMP_UP = __ENV.K6_RAMP_UP || "30s";
const SUSTAIN = __ENV.K6_SUSTAIN || "1m";
const RAMP_DOWN = __ENV.K6_RAMP_DOWN || "30s";
// One person, multiple devices. Alan: mac mini, macbook, iphone, 2 tablets, 3 robots.
// Each user gets their own instance. This is not multi-tenant load — it's one household.
const TARGET_VUS = parseInt(__ENV.K6_TARGET_VUS || "5", 10);
const P95_THRESHOLD = __ENV.K6_P95_THRESHOLD || "p(95)<2000";
const FAIL_RATE_THRESHOLD = __ENV.K6_FAIL_RATE_THRESHOLD || "rate<0.10";

// Cloud endpoints — NOTHING IS LOCAL
const BASE_URL = __ENV.MEMORABLE_API_URL;
if (!BASE_URL) {
  throw new Error(
    "MEMORABLE_API_URL is required. Set it to the cloud endpoint (Elastic IP:8080). NOTHING IS LOCAL."
  );
}

export const options = {
  stages: [
    { duration: RAMP_UP, target: TARGET_VUS },
    { duration: SUSTAIN, target: TARGET_VUS },
    { duration: RAMP_DOWN, target: 0 },
  ],
  thresholds: {
    http_req_duration: [P95_THRESHOLD],
    http_req_failed: [FAIL_RATE_THRESHOLD],
  },
};

// Verify server is reachable before VUs start
export function setup() {
  const health = http.get(`${BASE_URL}/health`);
  if (health.status !== 200) {
    throw new Error(`Health check failed: ${health.status} ${health.body}`);
  }
  return { baseUrl: BASE_URL };
}

export default function (data) {
  const headers = { "Content-Type": "application/json" };

  // 1. Health check
  const health = http.get(`${data.baseUrl}/health`);
  check(health, {
    "health returns 200": (r) => r.status === 200,
    "health status is healthy": (r) => {
      try {
        return r.json("status") === "healthy";
      } catch (e) {
        return false;
      }
    },
  });

  // 2. OAuth discovery — tests the deployed MCP server's OAuth endpoints
  const discovery = http.get(
    `${data.baseUrl}/.well-known/oauth-authorization-server`
  );
  check(discovery, {
    "oauth discovery returns 200": (r) => r.status === 200,
    "oauth has token endpoint": (r) => {
      try {
        return r.body.includes("token_endpoint");
      } catch (e) {
        return false;
      }
    },
  });

  // 3. OAuth protected resource metadata
  const resource = http.get(
    `${data.baseUrl}/.well-known/oauth-protected-resource`
  );
  check(resource, {
    "protected resource returns 200": (r) => r.status === 200,
    "resource references mcp": (r) => {
      try {
        return r.body.includes("/mcp");
      } catch (e) {
        return false;
      }
    },
  });

  // 4. Dynamic client registration
  const regPayload = JSON.stringify({
    redirect_uris: [`${data.baseUrl}/oauth/callback`],
    client_name: `k6-load-test-vu-${__VU}`,
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  });
  const regResponse = http.post(`${data.baseUrl}/register`, regPayload, {
    headers,
  });
  check(regResponse, {
    "registration returns 200 or 201": (r) =>
      r.status === 200 || r.status === 201,
    "registration returns client_id": (r) => {
      try {
        return r.body.includes("client_id");
      } catch (e) {
        return false;
      }
    },
  });

  // 5. MCP endpoint responds (JSON-RPC needs valid request, but we check it's alive)
  const mcpRes = http.post(
    `${data.baseUrl}/mcp`,
    JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
    { headers }
  );
  check(mcpRes, {
    "mcp endpoint responds": (r) => r.status !== 0 && r.status < 500,
  });

  sleep(1);
}
