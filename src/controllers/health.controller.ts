import type { Request, Response } from 'express';

/**
 * Reports basic liveness info for the running process: a fixed status,
 * process uptime in seconds, and the current time.
 */
export const getHealth = (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
};
