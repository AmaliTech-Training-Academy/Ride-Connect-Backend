import express, { type Express, type RequestHandler } from 'express';
import request from 'supertest';

import type { AuthContext } from '../lib/http/types';
import { logger } from '../lib/logger';
import { createOptionalAuth, createRequireAuth, type SessionLookup } from './auth.middleware';
import { errorHandler } from './errorHandler.middleware';
import { responseMiddleware } from './response.middleware';

const issuedAt = new Date('2026-01-01T00:00:00.000Z');

const authContext: AuthContext = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Grace Hopper',
    email: 'grace@rideconnect.test',
    emailVerified: true,
    createdAt: issuedAt,
    updatedAt: issuedAt,
  },
  session: {
    id: '22222222-2222-4222-8222-222222222222',
    token: 'session-token',
    userId: '11111111-1111-4111-8111-111111111111',
    expiresAt: new Date('2026-01-08T00:00:00.000Z'),
    createdAt: issuedAt,
    updatedAt: issuedAt,
  },
};

const resolves: SessionLookup = () => Promise.resolve(authContext);
const findsNothing: SessionLookup = () => Promise.resolve(null);
const throws: SessionLookup = () => Promise.reject(new Error('auth store unreachable'));

function buildApp(middleware: RequestHandler): Express {
  const app = express();

  app.use(responseMiddleware);
  app.get('/probe', middleware, (req, res) => {
    res.customSuccess({ data: { userId: req.auth?.user.id ?? null } });
  });
  app.use(errorHandler);

  return app;
}

describe('requireAuth', () => {
  const originalLoggerError = logger.error;

  beforeEach(() => {
    logger.error = () => undefined;
  });

  afterEach(() => {
    logger.error = originalLoggerError;
  });

  it('attaches the auth context when the lookup finds a session', async () => {
    const response = await request(buildApp(createRequireAuth(resolves))).get('/probe');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ userId: authContext.user.id });
  });

  it('answers 401 when there is no session', async () => {
    const response = await request(buildApp(createRequireAuth(findsNothing))).get('/probe');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  });

  it('answers 500 when the lookup itself fails, rather than reporting a logout', async () => {
    const response = await request(buildApp(createRequireAuth(throws))).get('/probe');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: 'An internal server error occurred',
    });
  });
});

describe('optionalAuth', () => {
  const originalLoggerWarn = logger.warn;
  let warnings: unknown[][];

  beforeEach(() => {
    warnings = [];
    logger.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
  });

  afterEach(() => {
    logger.warn = originalLoggerWarn;
  });

  it('attaches the auth context when the lookup finds a session', async () => {
    const response = await request(buildApp(createOptionalAuth(resolves))).get('/probe');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ userId: authContext.user.id });
  });

  it('serves the request anonymously when there is no session', async () => {
    const response = await request(buildApp(createOptionalAuth(findsNothing))).get('/probe');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ userId: null });
    expect(warnings).toHaveLength(0);
  });

  it('serves the request anonymously and warns when the lookup fails', async () => {
    const response = await request(buildApp(createOptionalAuth(throws))).get('/probe');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ userId: null });
    expect(warnings).toHaveLength(1);
  });
});
