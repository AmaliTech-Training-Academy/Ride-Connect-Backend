import type { Request, Response } from 'express';

import { sendJsonError } from '../utils/sendJsonError';

/**
 * Catches any request that didn't match a route. Must be registered after
 * all real routes and before the error handler.
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  sendJsonError(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
};
