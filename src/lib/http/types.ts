import type { Request } from 'express';

import type { Auth } from '../../auth/auth.config';

/** The authenticated user and the session that proved it. */
export type AuthContext = Auth['$Infer']['Session'];

export interface ValidatedShape {
  body?: unknown;
  query?: unknown;
  params?: unknown;
}

export interface Validated<V extends ValidatedShape> {
  body: V extends { body: infer B } ? B : unknown;
  query: V extends { query: infer Q } ? Q : unknown;
  params: V extends { params: infer P } ? P : unknown;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
      validated?: { body?: unknown; query?: unknown; params?: unknown };
    }
  }
}

/** The request a public controller receives: the caller may or may not be signed in. */
export interface AppRequest<V extends ValidatedShape = ValidatedShape> extends Request {
  auth?: AuthContext;
  validated: Validated<V>;
}

/** The request a protected controller receives: `auth` is guaranteed by the wrapper. */
export interface AuthedRequest<V extends ValidatedShape = ValidatedShape> extends Request {
  auth: AuthContext;
  validated: Validated<V>;
}
