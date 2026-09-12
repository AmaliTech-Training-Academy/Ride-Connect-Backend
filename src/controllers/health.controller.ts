import type { Request, Response } from 'express';

/** GET /health — reports that the process is up. Touches no dependency. */
export const getHealth = (_req: Request, res: Response): void => {
  res.customSuccess({
    message: 'Service is healthy',
    data: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
};
