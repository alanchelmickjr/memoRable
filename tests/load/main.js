import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 }, // Ramp up to 10 users
    { duration: '1m', target: 10 },  // Stay at 10 users
    { duration: '30s', target: 0 },  // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests must complete below 2s
    http_req_failed: ['rate<0.05'],    // Less than 5% of requests can fail
  },
};

const INGESTION_URL = 'http://localhost:8001';
const EMBEDDING_URL = 'http://localhost:3003';
const RETRIEVAL_URL = 'http://localhost:3004';
const NNNA_URL = 'http://localhost:3005';
const WEAVIATE_URL = 'http://localhost:8080';

export default function () {
  const headers = {
    'Content-Type': 'application/json',
  };

  // Test Weaviate health
  const weaviateHealth = http.get(`${WEAVIATE_URL}/v1/.well-known/ready`);
  check(weaviateHealth, {
    'weaviate is healthy': (r) => r.status === 200,
  });

  // Test Ingestion service health
  const ingestionHealth = http.get(`${INGESTION_URL}/api/ingest/health`);
  check(ingestionHealth, {
    'ingestion service is healthy': (r) => r.status === 200,
    'ingestion status is UP': (r) => r.body.includes('UP'),
  });

  // Test Embedding service health
  const embeddingHealth = http.get(`${EMBEDDING_URL}/health`);
  check(embeddingHealth, {
    'embedding service is healthy': (r) => r.status === 200,
  });

  // Test Retrieval service health
  const retrievalHealth = http.get(`${RETRIEVAL_URL}/health`);
  check(retrievalHealth, {
    'retrieval service is healthy': (r) => r.status === 200,
  });

  // Test NNNA service health
  const nnnaHealth = http.get(`${NNNA_URL}/health`);
  check(nnnaHealth, {
    'nnna service is healthy': (r) => r.status === 200,
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
    `${INGESTION_URL}/api/ingest`,
    ingestPayload,
    { headers }
  );

  check(ingestResponse, {
    'ingestion returns 202': (r) => r.status === 202,
    'ingestion accepted': (r) => r.body.includes('accepted'),
  });

  // Test embedding generation
  const embedPayload = JSON.stringify({
    text: `Load test embedding content ${Date.now()}`,
  });

  const embedResponse = http.post(
    `${EMBEDDING_URL}/embed`,
    embedPayload,
    { headers }
  );

  check(embedResponse, {
    'embedding returns 200': (r) => r.status === 200,
    'embedding has vector': (r) => r.body.includes('embedding'),
  });

  // Test retrieval
  const retrievePayload = JSON.stringify({
    userId: `load-test-user-${__VU}`,
    query: 'test query',
  });

  const retrieveResponse = http.post(
    `${RETRIEVAL_URL}/retrieve`,
    retrievePayload,
    { headers }
  );

  check(retrieveResponse, {
    'retrieval returns 200': (r) => r.status === 200,
    'retrieval has results': (r) => r.body.includes('results'),
  });

  sleep(1);
}
