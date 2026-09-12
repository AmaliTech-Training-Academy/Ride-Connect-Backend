import request from 'supertest';

import { app } from './app';

describe('404 handler', () => {
  it('returns a consistent JSON 404 response for an unmatched route', async () => {
    const response = await request(app).get('/this-route-does-not-exist');

    expect(response.status).toBe(404);
    expect(response.type).toBe('application/json');
    expect(response.body).toEqual({
      success: false,
      message: 'Not Found - GET /this-route-does-not-exist',
    });
  });
});

describe('malformed request bodies', () => {
  it('reports a 400 rather than an authentication failure', async () => {
    const response = await request(app)
      .post('/this-route-does-not-exist')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ success: false, message: 'Malformed JSON body' });
  });
});
