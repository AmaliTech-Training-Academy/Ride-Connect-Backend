import type { NextFunction, RequestHandler, Response } from 'express';

import { CustomError } from './errors';
import type { AppRequest, AuthedRequest, ValidatedShape } from './types';

type Handler<R> = (req: R, res: Response, next: NextFunction) => Promise<void> | void;

const wrap =
  <R>(fn: Handler<R>, requiresAuthContext: boolean): RequestHandler =>
  async (req, res, next) => {
    try {
      if (requiresAuthContext && !req.auth) {
        // The route is missing requireAuth. Fail closed rather than read through a
        // req.auth the type system has already promised is there.
        throw CustomError.unauthorized();
      }

      req.validated ??= {};

      await fn(req as unknown as R, res, next);
    } catch (error) {
      next(error);
    }
  };

/** Wraps a public controller. Pair with `optionalAuth` when it needs to know the caller. */
export const controller = <V extends ValidatedShape = ValidatedShape>(
  fn: Handler<AppRequest<V>>,
): RequestHandler => wrap<AppRequest<V>>(fn, false);

/** Wraps a protected controller. Pair with `requireAuth`, which this re-checks at runtime. */
export const authedController = <V extends ValidatedShape = ValidatedShape>(
  fn: Handler<AuthedRequest<V>>,
): RequestHandler => wrap<AuthedRequest<V>>(fn, true);
