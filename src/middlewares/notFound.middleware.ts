import type { Request, Response } from 'express';

/** Answers any request that matched no route. */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.customInvalid({
    status: 404,
    message: `Not Found - ${req.method} ${req.originalUrl}`,
  });
};
