import http from 'k6/http';
import { check } from 'k6';

// All config from environment — no hardcoded values
const RAMP_UP = __ENV.K6_RAMP_UP || '30s';
const SUSTAIN = __ENV.K6_SUSTAIN || '1m';
const RAMP_DOWN = __ENV.K6_RAMP_DOWN || '30s';
const TARGET_VUS = parseInt(__ENV.K6_TARGET_VUS || '10', 10);
const P95_THRESHOLD = __ENV.K6_P95_THRESHOLD || 'p(95)<2000';
const FAIL_RATE_THRESHOLD = __ENV.K6_FAIL_RATE_THRESHOLD || 'rate<0.05';

// Cloud endpoints — NOTHING IS LOCAL
const BASE_URL = __ENV.MEMORABLE_API_URL;
if (!BASE_URL) {
  throw new Error(
    'MEMORABLE_API_URL is required. Set it to the cloud endpoint (Elastic IP:8080). NOTHING IS LOCAL.'
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

export default function () {
  const headers = { 'Content-Type': 'application/json' };

  // Health check
  const health = http.get(`${BASE_URL}/health`);
  check(health, {
    'api is healthy': (r) => r.status === 200,
  });

  // Test memory ingestion
  const ingestPayload = JSON.stringify({
    sourceSystem: 'MANUAL_INPUT',
    agentId: `load-test-user-${__VU}`,
    contentType: 'TEXT',
    contentRaw: `Load test memory entry at ${new Date().toISOString()}`,
    eventTimestamp: new Date().toISOString(),
  });

  const ingestResponse = http.post(
    `${BASE_URL}/memory`,
    ingestPayload,
    { headers }
  );

  check(ingestResponse, {
    'ingestion returns 200 or 202': (r) => r.status === 200 || r.status === 202,
    'ingestion accepted': (r) => r.body.includes('accepted') || r.body.includes('success'),
  });

  // Test retrieval
  const retrievePayload = JSON.stringify({
    query: 'test query',
    userId: `load-test-user-${__VU}`,
    limit: 10,
  });

  const retrieveResponse = http.post(
    `${BASE_URL}/memory/search`,
    retrievePayload,
    { headers }
  );

  check(retrieveResponse, {
    'retrieval returns 200': (r) => r.status === 200,
    'retrieval has results': (r) => r.body.includes('results') || r.body.includes('memories'),
  });
}
