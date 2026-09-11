import type { NextFunction, Request, Response } from 'express';

import { sendJsonError } from '../utils/sendJsonError';

interface AuthApiError extends Error {
  statusCode: number;
  body?: { code?: string; message?: string };
}

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

const isAuthApiError = (err: unknown): err is AuthApiError =>
  err instanceof Error && typeof (err as Partial<AuthApiError>).statusCode === 'number';

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

  if (isAuthApiError(err)) {
    const code = err.body?.code;
    const mapped = code ? authErrorMap[code] : undefined;

    res.status(mapped?.status ?? err.statusCode).json({
      error: {
        code: code ?? 'AUTH_ERROR',
        message: mapped?.message ?? err.body?.message ?? 'Authentication request failed.',
      },
    });
    return;
  }

  console.error(err);

  sendJsonError(res, 500, 'Internal Server Error');
};
