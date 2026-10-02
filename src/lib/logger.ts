import { format } from 'node:util';

import pino, { type Level } from 'pino';

const nodeEnv = process.env.NODE_ENV;

export const pinoLogger = pino({
  level: nodeEnv === 'test' ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
  ...(nodeEnv === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
});

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
