import { logger } from './logger';

describe('logger.stream', () => {
  const originalInfo = logger.info;
  let lines: unknown[][];

  beforeEach(() => {
    lines = [];
    logger.info = (...args: unknown[]) => {
      lines.push(args);
    };
  });

  afterEach(() => {
    logger.info = originalInfo;
  });

  it('strips the newline morgan appends to every line', () => {
    logger.stream.write('GET /api/health 200 4.201 ms - 87\n');

    expect(lines).toEqual([['GET /api/health 200 4.201 ms - 87']]);
  });

  it('writes through logger.info, so a stub on the logger captures request lines', () => {
    logger.stream.write('POST /api/rides 201 12.004 ms - 214\n');

    expect(lines).toHaveLength(1);
  });
});
