export const logger = {
  info: (...args: unknown[]): void => {
    console.log(...args);
  },
  warn: (...args: unknown[]): void => {
    console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
  stream: {
    write: (line: string): void => {
      logger.info(line.trimEnd());
    },
  },
};
