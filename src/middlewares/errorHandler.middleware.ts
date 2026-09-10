import type { NextFunction, Request, Response } from 'express';

import { sendJsonError } from '../utils/sendJsonError';

/**
 * Catches any error thrown by route handlers or passed to `next(err)`,
 * logs it server-side, and responds with a consistent JSON shape that never
 * leaks internals (e.g. a stack trace) to the client. Must be registered
 * last, after the 404 handler.
 */
export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Per Express docs: if headers are already sent, delegate to Express's
  // default handler instead of trying to send a second response.
  if (res.headersSent) {
    next(err);
    return;
  }

  console.error(err);

  sendJsonError(res, 500, 'Internal Server Error');
};
