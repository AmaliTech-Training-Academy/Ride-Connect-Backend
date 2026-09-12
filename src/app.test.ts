import request from 'supertest';
import { vi } from 'vitest';

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

describe('global error handler', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('returns a consistent JSON 500 response for a synchronously thrown error, without leaking the stack trace', async () => {
    const response = await request(app).get('/__test/throw');

    expect(response.status).toBe(500);
    expect(response.type).toBe('application/json');
    expect(response.body).toEqual({
      success: false,
      message: 'An internal server error occurred',
    });
    expect(JSON.stringify(response.body)).not.toContain('.ts');
  });

  it('returns a consistent JSON 500 response for an error passed to next()', async () => {
    const response = await request(app).get('/__test/next-error');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: 'An internal server error occurred',
    });
  });

  it('delegates to the default Express handler instead of double-sending a response', async () => {
    const response = await request(app).get('/__test/error-after-response');

    expect(response.status).toBe(200);
    expect(response.text).toBe('partial response');
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

describe('test-only routes', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    vi.resetModules();
  });

  it('are not mounted when NODE_ENV is not "test"', async () => {
    process.env.NODE_ENV = 'production';
    vi.resetModules();

    const { app: appInNonTestEnv } = await import('./app.js');
    const response = await request(appInNonTestEnv).get('/__test/throw');

    expect(response.status).toBe(404);
  });
});
