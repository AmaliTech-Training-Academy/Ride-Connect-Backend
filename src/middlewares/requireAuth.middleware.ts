import { fromNodeHeaders } from 'better-auth/node';
import type { RequestHandler } from 'express';

import { auth } from '../auth/auth.config';
import { sendJsonError } from '../utils/sendJsonError';

/** Rejects the request unless a valid session cookie is present, otherwise sets `res.locals.userId`. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });

    if (!session) {
      sendJsonError(res, 401, 'Authentication required.');
      return;
    }

    res.locals.userId = session.user.id;
    next();
  } catch (error) {
    next(error);
  }
};
