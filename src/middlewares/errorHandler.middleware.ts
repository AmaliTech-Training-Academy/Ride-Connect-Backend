import type { NextFunction, Request, Response } from 'express';

import { sendJsonError } from '../utils/sendJsonError';

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

  console.error(err);

  sendJsonError(res, 500, 'Internal Server Error');
};
