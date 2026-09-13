import { fromNodeHeaders } from 'better-auth/node';
import type { Request, RequestHandler } from 'express';

import { auth } from '../auth/auth.config';
import { CustomError } from '../lib/http/errors';
import type { AuthContext } from '../lib/http/types';
import { logger } from '../lib/logger';

export type SessionLookup = (req: Request) => Promise<AuthContext | null>;

const lookupSession: SessionLookup = (req) =>
  auth.api.getSession({ headers: fromNodeHeaders(req.headers) });

/** Rejects the request unless the lookup finds a valid session. */
export const createRequireAuth =
  (lookup: SessionLookup = lookupSession): RequestHandler =>
  async (req, _res, next) => {
    let session: AuthContext | null;

    try {
      session = await lookup(req);
    } catch (error) {
      // An outage is not a logout: a 401 here signs out every caller holding a valid session.
      next(error);
      return;
    }

    if (!session) {
      next(CustomError.unauthorized());
      return;
    }

    req.auth = session;
    next();
  };

/** Attaches the auth context when the lookup finds a session; never rejects. */
export const createOptionalAuth =
  (lookup: SessionLookup = lookupSession): RequestHandler =>
  async (req, _res, next) => {
    try {
      const session = await lookup(req);

      if (session) {
        req.auth = session;
      }
    } catch (error) {
      logger.warn('optionalAuth session lookup failed', error);
    }

    next();
  };

export const requireAuth = createRequireAuth();
export const optionalAuth = createOptionalAuth();
