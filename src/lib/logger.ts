import { format } from 'node:util';

import type { Request, Response } from 'express';
import pino, { type Level, type Logger } from 'pino';
import { pinoHttp } from 'pino-http';

const nodeEnv = process.env.NODE_ENV;

export const pinoLogger = pino({
  level: nodeEnv === 'test' ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
  ...(nodeEnv === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
});

const describeRequest = (req: Request, res: Response): string =>
  `${req.method} ${req.originalUrl} ${res.statusCode}`;

export const createHttpLogger = (base: Logger) =>
  pinoHttp<Request, Response>({
    logger: base,
    quietReqLogger: true,
    serializers: {
      req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
      res: (res: { statusCode: number }) => ({ status: res.statusCode }),
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessMessage: describeRequest,
    customErrorMessage: describeRequest,
    customErrorObject: (_req, _res, _err, val: Record<string, unknown>) => {
      delete val.err;
      return val;
    },
  });

export const httpLogger = createHttpLogger(pinoLogger);

const write =
  (level: Level) =>
  (...args: unknown[]): void => {
    const err = args.find((arg) => arg instanceof Error);
    const rest = args.filter((arg) => arg !== err);
    const msg = rest.length > 0 ? format(...rest) : err?.message;

    if (err) {
      pinoLogger[level]({ err }, msg);
      return;
    }

    pinoLogger[level](msg);
  };

export const logger = {
  info: write('info'),
  warn: write('warn'),
  error: write('error'),
};
