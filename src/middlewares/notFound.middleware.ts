import type { Request, Response } from 'express';

import { sendJsonError } from '../utils/sendJsonError';

export const notFoundHandler = (req: Request, res: Response): void => {
  sendJsonError(res, 404, `Route not found: ${req.method} ${req.originalUrl}`);
};
