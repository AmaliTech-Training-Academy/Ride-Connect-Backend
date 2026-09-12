import type { Response } from 'express';

/** An error with an HTTP status and a user-facing message, thrown instead of returned. */
export class CustomError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'CustomError';
    this.status = status;
    this.details = details;
    Error.captureStackTrace?.(this, CustomError);
  }

  static badRequest(message = 'The request is invalid', details?: unknown): CustomError {
    return new CustomError(400, message, details);
  }

  static unauthorized(message = 'Authentication required. Please log in.'): CustomError {
    return new CustomError(401, message);
  }

  static forbidden(message = 'You are not allowed to perform this action'): CustomError {
    return new CustomError(403, message);
  }

  static notFound(message = 'Resource not found'): CustomError {
    return new CustomError(404, message);
  }

  static conflict(message = 'Resource already exists', details?: unknown): CustomError {
    return new CustomError(409, message, details);
  }
}

/** Renders a CustomError through whichever envelope helper matches its status. */
export const sendCustomError = (res: Response, error: CustomError): void => {
  const payload = { status: error.status, message: error.message, data: error.details };

  if (error.status === 401 || error.status === 403) {
    res.customUnauthorized(payload);
    return;
  }

  if (error.status < 500) {
    res.customInvalid(payload);
    return;
  }

  res.customFailure(payload);
};
