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

  /** 400 — the request was understood but its contents are unusable. */
  static badRequest(message = 'The request is invalid', details?: unknown): CustomError {
    return new CustomError(400, message, details);
  }

  /** 401 — no usable session on a request that needs one. */
  static unauthorized(message = 'Authentication required. Please log in.'): CustomError {
    return new CustomError(401, message);
  }

  /** 403 — authenticated, but not permitted to do this. */
  static forbidden(message = 'You are not allowed to perform this action'): CustomError {
    return new CustomError(403, message);
  }

  /** 404 — the addressed resource does not exist. */
  static notFound(message = 'Resource not found'): CustomError {
    return new CustomError(404, message);
  }

  /** 409 — the request conflicts with something that already exists. */
  static conflict(message = 'Resource already exists', details?: unknown): CustomError {
    return new CustomError(409, message, details);
  }
}

/**
 * Renders a CustomError through whichever envelope helper matches its status.
 *
 * Rules §10 puts this mapping in the controller wrapper and says "nowhere else",
 * but an error raised by middleware reaches the error handler without passing
 * through any wrapper. Both paths call this so they cannot drift apart.
 */
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
