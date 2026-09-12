import { isAPIError } from 'better-auth/api';
import type { NextFunction, Request, Response } from 'express';

import { CustomError, sendCustomError } from '../lib/http/errors';

const authErrorMap: Record<string, { status: number; message: string }> = {
  USER_ALREADY_EXISTS: {
    status: 409,
    message: 'An account with this email already exists.',
  },
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: {
    status: 409,
    message: 'An account with this email already exists.',
  },
  INVALID_EMAIL_OR_PASSWORD: {
    status: 401,
    message: 'Invalid email or password',
  },
  INVALID_PASSWORD: {
    status: 401,
    message: 'Invalid email or password',
  },
  PASSWORD_TOO_SHORT: {
    status: 400,
    message: 'Password must be at least 8 characters.',
  },
  PASSWORD_TOO_LONG: {
    status: 400,
    message: 'Password is too long.',
  },
  INVALID_EMAIL: {
    status: 400,
    message: 'Please provide a valid email address.',
  },
};

const isBodyParserError = (err: unknown): boolean => err instanceof SyntaxError && 'body' in err;

const toCustomError = (err: unknown): CustomError | undefined => {
  if (err instanceof CustomError) {
    return err;
  }

  if (isAPIError(err)) {
    const code = err.body?.code;
    const mapped = code ? authErrorMap[code] : undefined;
    const status = mapped?.status ?? err.statusCode;
    const message = mapped?.message ?? err.body?.message ?? 'Authentication request failed.';
    // A 401 must not reveal whether the email or the password was wrong, and the
    // two better-auth codes behind it differ. Withholding the code is what keeps
    // the two responses byte-identical.
    const details = code && status !== 401 ? { code } : undefined;

    return new CustomError(status, message, details);
  }

  if (isBodyParserError(err)) {
    return CustomError.badRequest('Malformed JSON body');
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

  console.error(err);

  res.customFailure();
};
