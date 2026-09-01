import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Ramp-up to 50 users
    { duration: '1m', target: 50 },   // Stay at 50 users for 1 minute
    { duration: '30s', target: 0 },   // Ramp-down to 0 users
  ],
  thresholds: {
    // 95% of requests should complete within 500ms
    http_req_duration: ['p(95)<500'],
  },
};

const BASE_URL = 'http://localhost:3000';

export default function () {
  // Simulate an analyst hitting the summary endpoint
  const res = http.get(`${BASE_URL}/api/reports/summary?start=2026-08-01&end=2026-08-31`);
  
  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  // Short pause to simulate user think-time
  sleep(1);
}
