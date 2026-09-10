import type { Response } from 'express';

/**
 * Sends the API's consistent JSON error envelope. Shared by the 404 and
 * global error-handling middleware so both produce the same shape.
 */
export const sendJsonError = (res: Response, statusCode: number, message: string): void => {
  res.status(statusCode).json({
    error: {
      message,
    },
  });
};
