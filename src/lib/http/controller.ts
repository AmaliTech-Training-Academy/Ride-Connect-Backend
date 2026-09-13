import type { NextFunction, RequestHandler, Response } from 'express';

import { CustomError } from './errors';
import type { AppRequest, AuthedRequest, ValidatedShape } from './types';

type Handler<R> = (req: R, res: Response, next: NextFunction) => Promise<void> | void;

/** Wraps a public controller. Pair with `optionalAuth` when it needs to know the caller. */
export const controller =
  <V extends ValidatedShape = ValidatedShape>(fn: Handler<AppRequest<V>>): RequestHandler =>
  async (req, res, next) => {
    req.validated ??= {};

    try {
      await fn(req as unknown as AppRequest<V>, res, next);
    } catch (error) {
      next(error);
    }
  };

/** Wraps a protected controller. Pair with `requireAuth`, which this re-checks at runtime. */
export const authedController =
  <V extends ValidatedShape = ValidatedShape>(fn: Handler<AuthedRequest<V>>): RequestHandler =>
  async (req, res, next) => {
    if (!req.auth) {
      // The route is missing requireAuth; fail closed rather than trust the type.
      next(CustomError.unauthorized());
      return;
    }

    req.validated ??= {};

    try {
      await fn(req as unknown as AuthedRequest<V>, res, next);
    } catch (error) {
      next(error);
    }
  };
