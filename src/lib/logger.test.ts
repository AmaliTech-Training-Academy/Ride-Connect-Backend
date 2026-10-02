import { logger, pinoLogger } from './logger';

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
