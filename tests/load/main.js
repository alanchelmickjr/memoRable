/* global __ENV, __VU */
import http from "k6/http";
import { check } from "k6";

// All config from environment — no hardcoded values
const RAMP_UP = __ENV.K6_RAMP_UP || "30s";
const SUSTAIN = __ENV.K6_SUSTAIN || "1m";
const RAMP_DOWN = __ENV.K6_RAMP_DOWN || "30s";
const TARGET_VUS = parseInt(__ENV.K6_TARGET_VUS || "10", 10);
const P95_THRESHOLD = __ENV.K6_P95_THRESHOLD || "p(95)<2000";
const FAIL_RATE_THRESHOLD = __ENV.K6_FAIL_RATE_THRESHOLD || "rate<0.05";

// Cloud endpoints — NOTHING IS LOCAL
const BASE_URL = __ENV.MEMORABLE_API_URL;
if (!BASE_URL) {
  throw new Error(
    "MEMORABLE_API_URL is required. Set it to the cloud endpoint (Elastic IP:8080). NOTHING IS LOCAL."
  );
}

// Dev passphrase — production overrides via K6_PASSPHRASE env var
const PASSPHRASE =
  __ENV.K6_PASSPHRASE || "I remember what I have learned from you.";

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

// Authenticate once before all VUs start — THE ONE GATE
export function setup() {
  const headers = { "Content-Type": "application/json" };

  // Step 1: Knock to get a challenge
  const knockRes = http.post(
    `${BASE_URL}/auth/knock`,
    JSON.stringify({ device: { type: "terminal", name: "k6-load-test" } }),
    { headers }
  );

  const challenge = knockRes.json("challenge");
  if (!challenge) {
    throw new Error(`Auth knock failed: ${knockRes.status} ${knockRes.body}`);
  }

  // Step 2: Exchange passphrase for API key
  const exchangeRes = http.post(
    `${BASE_URL}/auth/exchange`,
    JSON.stringify({
      challenge,
      passphrase: PASSPHRASE,
      device: { type: "terminal", name: "k6-load-test" },
    }),
    { headers }
  );

  const apiKey = exchangeRes.json("api_key");
  if (!apiKey) {
    throw new Error(
      `Auth exchange failed: ${exchangeRes.status} ${exchangeRes.body}`
    );
  }

  return { apiKey };
}

export default function (data) {
  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": data.apiKey,
  };

  // Health check (public, no auth needed)
  const health = http.get(`${BASE_URL}/health`);
  check(health, {
    "api is healthy": (r) => r.status === 200,
  });

  // Test memory ingestion — POST /memory expects { content, entity }
  const ingestPayload = JSON.stringify({
    content: `Load test memory entry at ${new Date().toISOString()}`,
    entity: `load-test-user-${__VU}`,
    entityType: "test",
    metadata: { source: "k6-load-test" },
  });

  const ingestResponse = http.post(`${BASE_URL}/memory`, ingestPayload, {
    headers,
  });

  check(ingestResponse, {
    "ingestion returns 200 or 201": (r) => r.status === 200 || r.status === 201,
    "ingestion accepted": (r) => {
      try {
        return r.body.includes("success") || r.body.includes("stored");
      } catch (e) {
        return false;
      }
    },
  });

  // Test retrieval — GET /memory/search (not POST)
  const retrieveResponse = http.get(
    `${BASE_URL}/memory/search?query=test+query&limit=10`,
    { headers: { "X-API-Key": data.apiKey } }
  );

  check(retrieveResponse, {
    "retrieval returns 200": (r) => r.status === 200,
    "retrieval has results": (r) => {
      try {
        return r.body.includes("memories");
      } catch (e) {
        return false;
      }
    },
  });
}
