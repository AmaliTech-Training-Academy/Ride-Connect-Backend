import request from 'supertest';

import { app } from '../app';

describe('GET /api/docs/openapi.json', () => {
  it('serves the spec unenveloped, so an OpenAPI client can read it', async () => {
    const response = await request(app).get('/api/docs/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.0.0');
    expect(response.body.info.title).toBe('RideConnect API');
    expect(response.body.servers).toEqual([{ url: '/api' }]);
    expect(response.body.success).toBeUndefined();
  });

  // Exact, not a subset: a route added without `documentedRoute` fails here rather
  // than going quietly missing from the reference.
  it('documents every mounted route, with path parameters in OpenAPI form', async () => {
    const response = await request(app).get('/api/docs/openapi.json');
    const operations = Object.entries(response.body.paths).flatMap(([path, item]) =>
      Object.keys(item as object).map((method) => `${method} ${path}`),
    );

    expect(operations.sort()).toEqual(
      [
        'get /health',
        'get /rides',
        'post /rides',
        'patch /rides/{rideId}/status',
        'post /rides/{rideId}/requests',
        'get /rides/{rideId}/requests',
        'patch /rides/{rideId}/requests/{requestId}/accept',
        'patch /rides/{rideId}/requests/{requestId}/decline',
      ].sort(),
    );
  });

  it('describes the ride body by the fields the caller sends, not the transformed ones', async () => {
    const response = await request(app).get('/api/docs/openapi.json');
    const body = response.body.paths['/rides'].post.requestBody.content['application/json'].schema;

    expect(Object.keys(body.properties)).toEqual(
      expect.arrayContaining(['departureDate', 'departureTime', 'availableSeats']),
    );
    expect(body.properties.seatsOffered).toBeUndefined();
    expect(body.properties.departureAt).toBeUndefined();
  });
});

describe('GET /api/docs', () => {
  it('serves the reference page', async () => {
    const response = await request(app).get('/api/docs');

    expect(response.status).toBe(200);
    expect(response.text).toContain('/api/docs/openapi.json');
    expect(response.text).toContain('/api/auth/open-api/generate-schema');
  });

  it('relaxes the script policy enough for the reference to boot', async () => {
    const response = await request(app).get('/api/docs');
    const policy = response.headers['content-security-policy'] ?? '';
    const scriptSrc = policy.split(';').find((directive) => directive.startsWith('script-src'));

    expect(scriptSrc).toContain('https://cdn.jsdelivr.net');
    expect(scriptSrc).toContain("'unsafe-inline'");
  });
});
