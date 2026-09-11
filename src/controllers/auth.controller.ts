import { fromNodeHeaders } from 'better-auth/node';
import type { RequestHandler, Response } from 'express';

import { auth } from '../auth/auth.config';

/**
 * Where a successfully authenticated client should navigate next. The redirect
 * itself is performed by the client; the server never issues a 3xx here.
 */
export const POST_LOGIN_REDIRECT = '/rides';

function forwardAuthCookies(res: Response, headers: Headers): void {
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) {
    res.append('Set-Cookie', cookies);
  }
}

export const register: RequestHandler = async (req, res, next) => {
  try {
    const { name, email, password } = req.body ?? {};

    const { headers, response } = await auth.api.signUpEmail({
      body: { name, email, password },
      headers: fromNodeHeaders(req.headers),
      returnHeaders: true,
    });

    forwardAuthCookies(res, headers);

    res.status(201).json({
      user: response.user,
      token: response.token,
    });
  } catch (error) {
    next(error);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};

    const { headers, response } = await auth.api.signInEmail({
      body: { email, password },
      headers: fromNodeHeaders(req.headers),
      returnHeaders: true,
    });

    forwardAuthCookies(res, headers);

    res.status(200).json({
      user: response.user,
      token: response.token,
      redirectTo: POST_LOGIN_REDIRECT,
    });
  } catch (error) {
    next(error);
  }
};
