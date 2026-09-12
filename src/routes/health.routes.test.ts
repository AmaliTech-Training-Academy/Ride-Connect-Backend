import request from 'supertest';

import { app } from '../app';

describe('GET /health', () => {
  it('returns 200 with uptime and timestamp', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'Service is healthy',
      data: {
        uptime: expect.any(Number),
        timestamp: expect.any(String),
      },
    });
    expect(new Date(response.body.data.timestamp).toISOString()).toBe(response.body.data.timestamp);
  });
});
