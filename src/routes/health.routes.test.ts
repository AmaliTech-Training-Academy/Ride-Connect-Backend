import request from 'supertest';

import { app } from '../app';

describe('GET /health', () => {
  it('returns 200 with status, uptime, and timestamp', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      uptime: expect.any(Number),
      timestamp: expect.any(String),
    });
    expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
  });
});
