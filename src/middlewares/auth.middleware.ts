import { fromNodeHeaders } from 'better-auth/node';
import type { Request, RequestHandler } from 'express';

import { auth } from '../auth/auth.config';
import { CustomError } from '../lib/http/errors';
import type { AuthContext } from '../lib/http/types';

export type SessionLookup = (req: Request) => Promise<AuthContext | null>;

const lookupSession: SessionLookup = (req) =>
  auth.api.getSession({ headers: fromNodeHeaders(req.headers) });

/** Builds a `requireAuth` over a given session lookup. */
export const createRequireAuth =
  (lookup: SessionLookup = lookupSession): RequestHandler =>
  async (req, _res, next) => {
    let session: AuthContext | null;

    try {
      session = await lookup(req);
    } catch (error) {
      // A failed lookup is an auth-store outage, not a missing session: telling a
      // signed-in caller they are logged out would turn a blip into a mass logout.
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

/** Builds an `optionalAuth` over a given session lookup. */
export const createOptionalAuth =
  (lookup: SessionLookup = lookupSession): RequestHandler =>
  async (req, _res, next) => {
    try {
      const session = await lookup(req);

      if (session) {
        req.auth = session;
      }
    } catch (error) {
      // A route that opted into optional auth must still answer anonymous callers,
      // so anonymous is the truthful answer here rather than a degraded one.
      console.warn('optionalAuth session lookup failed', error);
    }

    next();
  };

/** Rejects the request unless a valid session cookie is present. */
export const requireAuth = createRequireAuth();

/** Attaches the auth context when a valid session cookie is present; never rejects. */
export const optionalAuth = createOptionalAuth();
