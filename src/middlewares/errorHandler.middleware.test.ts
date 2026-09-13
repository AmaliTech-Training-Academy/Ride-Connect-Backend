import express, { type Express, type RequestHandler } from 'express';
import request from 'supertest';

import { logger } from '../lib/logger';
import { errorHandler } from './errorHandler.middleware';
import { responseMiddleware } from './response.middleware';

/** A rejected duplicate, carrying the internal fields `pg` attaches to one. */
function uniqueViolation(): Error & { code: string; constraint: string; detail: string } {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
    constraint: 'unique_ride_request',
    detail: 'Key (ride_id, passenger_id)=(a, b) already exists.',
  });
}

function buildApp(handler: RequestHandler): Express {
  const app = express();

  app.use(responseMiddleware);
  app.get('/probe', handler);
  app.use(errorHandler);

  return app;
}

describe('errorHandler', () => {
  const originalLoggerError = logger.error;

  beforeEach(() => {
    logger.error = () => undefined;
  });

  afterEach(() => {
    logger.error = originalLoggerError;
  });

  it('returns a consistent JSON 500 response for a synchronously thrown error, without leaking the stack trace', async () => {
    const response = await request(
      buildApp(() => {
        throw new Error('Synchronous test error');
      }),
    ).get('/probe');

    expect(response.status).toBe(500);
    expect(response.type).toBe('application/json');
    expect(response.body).toEqual({
      success: false,
      message: 'An internal server error occurred',
    });
    expect(JSON.stringify(response.body)).not.toContain('.ts');
  });

  it('returns a consistent JSON 500 response for an error passed to next()', async () => {
    const response = await request(
      buildApp((_req, _res, next) => {
        next(new Error('Async test error'));
      }),
    ).get('/probe');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: 'An internal server error occurred',
    });
  });

  it('delegates to the default Express handler instead of double-sending a response', async () => {
    const response = await request(
      buildApp((_req, res, next) => {
        res.status(200).send('partial response');
        next(new Error('Error after the response was already sent'));
      }),
    ).get('/probe');

    expect(response.status).toBe(200);
    expect(response.text).toBe('partial response');
  });

  it('answers 409 when a write loses a race against a unique constraint', async () => {
    const response = await request(
      buildApp(() => {
        throw uniqueViolation();
      }),
    ).get('/probe');

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      message: 'Resource already exists',
    });
  });

  it('keeps the constraint name and the offending values out of the response', async () => {
    const response = await request(
      buildApp(() => {
        throw uniqueViolation();
      }),
    ).get('/probe');

    const body = JSON.stringify(response.body);
    expect(body).not.toContain('unique_ride_request');
    expect(body).not.toContain('passenger_id');
  });

  it('leaves other database errors as 500s rather than reporting a conflict', async () => {
    const foreignKeyViolation = Object.assign(new Error('insert or update violates foreign key'), {
      code: '23503',
    });

    const response = await request(
      buildApp(() => {
        throw foreignKeyViolation;
      }),
    ).get('/probe');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: 'An internal server error occurred',
    });
  });
});
