import { isAPIError } from 'better-auth/api';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { CustomError, sendCustomError } from '../lib/http/errors';
import { logger } from '../lib/logger';

const isBodyParserError = (err: unknown): boolean => err instanceof SyntaxError && 'body' in err;

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';

const toCustomError = (err: unknown): CustomError | undefined => {
  if (err instanceof CustomError) {
    return err;
  }

  if (isAPIError(err)) {
    const status = err.statusCode;
    const message = err.body?.message ?? 'Authentication request failed.';
    const code = err.body?.code;
    // Codes differ between a wrong password and an unknown email; a 401 must not.
    const details = code && status !== 401 ? { code } : undefined;

    return new CustomError(status, message, details);
  }

  if (err instanceof z.ZodError) {
    return CustomError.badRequest(undefined, { fields: z.flattenError(err).fieldErrors });
  }

  if (isBodyParserError(err)) {
    return CustomError.badRequest('Malformed JSON body');
  }

  if (isUniqueViolation(err)) {
    return CustomError.conflict();
  }

  return undefined;
};

/** Renders every unhandled error through the response envelope. */
export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const known = toCustomError(err);

  if (known) {
    sendCustomError(res, known);
    return;
  }

  logger.error(err);

  res.customFailure();
};
