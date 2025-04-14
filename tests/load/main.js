import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 }, // Ramp up to 20 users
    { duration: '1m', target: 20 },  // Stay at 20 users
    { duration: '30s', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.01'],   // Less than 1% of requests can fail
  },
};

const BASE_URL = 'http://localhost:3000';

export default function () {
  // Health check
  const healthCheck = http.get(`${BASE_URL}/health`);
  check(healthCheck, {
    'health check status is 200': (r) => r.status === 200,
  });

  // Simulate user interaction
  const payload = {
    message: 'Test message for load testing',
    context: {
      userId: 'test-user',
      timestamp: new Date().toISOString(),
    },
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'test-auth-token',
  };

  // Test message processing
  const processMessage = http.post(
    `${BASE_URL}/api/process`,
    JSON.stringify(payload),
    { headers }
  );

  check(processMessage, {
    'process status is 200': (r) => r.status === 200,
    'response has required fields': (r) => {
      const body = JSON.parse(r.body);
      return body.success && body.response;
    },
  });

  // Test model selection
  const modelSelection = http.get(
    `${BASE_URL}/api/models/status`,
    { headers }
  );

  check(modelSelection, {
    'model status is 200': (r) => r.status === 200,
    'models are available': (r) => {
      const body = JSON.parse(r.body);
      return body.models && body.models.length > 0;
    },
  });

  sleep(1);
}