import { fromNodeHeaders } from 'better-auth/node';
import type { Response } from 'express';

import { auth } from '../auth/auth.config';
import { controller } from '../lib/http/controller';
import type { LoginInput, RegisterInput } from '../validators/auth.validator';

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

/** POST /register — creates an account and signs the new user straight in. */
export const register = controller<{ body: RegisterInput }>(async (req, res) => {
  const { name, email, password } = req.validated.body;

  const { headers, response } = await auth.api.signUpEmail({
    body: { name, email, password },
    headers: fromNodeHeaders(req.headers),
    returnHeaders: true,
  });

  forwardAuthCookies(res, headers);

  res.customSuccess({
    status: 201,
    message: 'Account created successfully',
    data: {
      user: response.user,
      token: response.token,
    },
  });
});

/** POST /login — signs an existing user in. */
export const login = controller<{ body: LoginInput }>(async (req, res) => {
  const { email, password } = req.validated.body;

  const { headers, response } = await auth.api.signInEmail({
    body: { email, password },
    headers: fromNodeHeaders(req.headers),
    returnHeaders: true,
  });

  forwardAuthCookies(res, headers);

  res.customSuccess({
    message: 'Signed in successfully',
    data: {
      user: response.user,
      token: response.token,
      redirectTo: POST_LOGIN_REDIRECT,
    },
  });
});
