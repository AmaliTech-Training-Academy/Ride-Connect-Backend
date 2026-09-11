import request from 'supertest';

import { app } from './app';

describe('404 handler', () => {
  it('returns a consistent JSON 404 response for an unmatched route', async () => {
    const response = await request(app).get('/this-route-does-not-exist');

    expect(response.status).toBe(404);
    expect(response.type).toBe('application/json');
    expect(response.body).toEqual({
      error: { message: 'Route not found: GET /this-route-does-not-exist' },
    });
  });
});

describe('global error handler', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('returns a consistent JSON 500 response for a synchronously thrown error, without leaking the stack trace', async () => {
    const response = await request(app).get('/__test/throw');

    expect(response.status).toBe(500);
    expect(response.type).toBe('application/json');
    expect(response.body).toEqual({ error: { message: 'Internal Server Error' } });
    expect(JSON.stringify(response.body)).not.toContain('.ts');
  });

  it('returns a consistent JSON 500 response for an error passed to next()', async () => {
    const response = await request(app).get('/__test/next-error');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { message: 'Internal Server Error' } });
  });

  it('delegates to the default Express handler instead of double-sending a response', async () => {
    const response = await request(app).get('/__test/error-after-response');

    expect(response.status).toBe(200);
    expect(response.text).toBe('partial response');
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
    jest.resetModules();
  });

  it('are not mounted when NODE_ENV is not "test"', async () => {
    process.env.NODE_ENV = 'production';
    jest.resetModules();

    const { app: appInNonTestEnv } = jest.requireActual('./app') as typeof import('./app');
    const response = await request(appInNonTestEnv).get('/__test/throw');

    expect(response.status).toBe(404);
  });
});
