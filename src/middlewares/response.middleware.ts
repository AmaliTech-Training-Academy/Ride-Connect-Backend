import type { NextFunction, Request, Response } from 'express';

export interface ResponsePayload {
  status?: number;
  message?: string;
  data?: unknown;
  total_count?: number;
}

declare global {
  // Express publishes its types as a namespace; augmenting Response needs one too.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Response {
      customSuccess(payload?: ResponsePayload): void;
      customInvalid(payload?: ResponsePayload): void;
      customUnauthorized(payload?: ResponsePayload): void;
      customFailure(payload?: ResponsePayload): void;
    }
  }
}

const send =
  (res: Response, defaultStatus: number, success: boolean, defaultMessage: string) =>
  (payload: ResponsePayload = {}): void => {
    if (res.headersSent) {
      return;
    }

    res.status(payload.status ?? defaultStatus).json({
      success,
      message: payload.message ?? defaultMessage,
      ...(payload.data !== undefined && { data: payload.data }),
      ...(payload.total_count !== undefined && { total_count: payload.total_count }),
    });
  };

/**
 * Attaches the four envelope helpers to every response.
 *
 * Mounted ahead of `express.json()`: a malformed body makes the parser throw,
 * which skips the remaining non-error middleware, and the error handler still
 * needs the helpers to report it.
 */
export const responseMiddleware = (_req: Request, res: Response, next: NextFunction): void => {
  res.customSuccess = send(res, 200, true, 'Request was successful');
  res.customInvalid = send(res, 400, false, 'The request is invalid');
  res.customUnauthorized = send(res, 401, false, 'You are not authorized to perform this action');
  res.customFailure = send(res, 500, false, 'An internal server error occurred');

  next();
};
