import { Writable } from 'node:stream';

import express from 'express';
import pino from 'pino';
import request from 'supertest';

import { createHttpLogger, logger, pinoLogger } from './logger';

describe('logger', () => {
  const originalError = pinoLogger.error;
  let calls: unknown[][];

  beforeEach(() => {
    calls = [];
    pinoLogger.error = ((...args: unknown[]) => {
      calls.push(args);
    }) as typeof pinoLogger.error;
  });

  afterEach(() => {
    pinoLogger.error = originalError;
  });

  it('passes an error as the err field so its stack is serialized', () => {
    const error = new Error('boom');

    logger.error('Migration failed.', error);

    expect(calls).toEqual([[{ err: error }, 'Migration failed.']]);
  });

  it('falls back to the error message when no text is given', () => {
    const error = new Error('boom');

    logger.error(error);

    expect(calls).toEqual([[{ err: error }, 'boom']]);
  });

  it('formats plain arguments into a single message', () => {
    logger.error('Port', 3000, 'in use');

    expect(calls).toEqual([['Port 3000 in use']]);
  });
});

describe('httpLogger', () => {
  let lines: Record<string, unknown>[];

  const buildApp = () => {
    const destination = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(JSON.parse(chunk.toString()));
        done();
      },
    });
    const app = express();
    app.use(createHttpLogger(pino({ base: undefined }, destination)));
    app.get('/api/ok', (_req, res) => {
      res.json({});
    });
    app.post('/api/bad', (_req, res) => {
      res.status(400).json({});
    });
    app.get('/api/boom', (_req, res) => {
      res.status(500).json({});
    });
    return app;
  };

  beforeEach(() => {
    lines = [];
  });

  it('logs one compact line per request without headers', async () => {
    await request(buildApp()).get('/api/ok?page=2').set('Cookie', 'session=secret');

    expect(lines).toHaveLength(1);
    expect(Object.keys(lines[0] ?? {}).sort()).toEqual(
      ['level', 'msg', 'req', 'reqId', 'res', 'responseTime', 'time'].sort(),
    );
    expect(lines[0]).toMatchObject({
      req: { method: 'GET', url: '/api/ok?page=2' },
      res: { status: 200 },
      msg: 'GET /api/ok?page=2 200',
    });
  });

  it('logs client errors at warn', async () => {
    await request(buildApp()).post('/api/bad');

    expect(lines[0]).toMatchObject({ level: 40, msg: 'POST /api/bad 400' });
  });

  it('logs server errors at error without a synthetic err', async () => {
    await request(buildApp()).get('/api/boom');

    expect(lines[0]).toMatchObject({ level: 50, msg: 'GET /api/boom 500' });
    expect(lines[0]).not.toHaveProperty('err');
  });
});
