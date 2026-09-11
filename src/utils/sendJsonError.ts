import type { Response } from 'express';

export const sendJsonError = (res: Response, statusCode: number, message: string): void => {
  res.status(statusCode).json({
    error: {
      message,
    },
  });
};
