import { Router } from 'express';

import { login, register } from '../controllers/auth.controller';
import {
  errorEnvelope,
  successEnvelope,
  validationErrorEnvelope,
} from '../lib/http/envelope.schema';
import { optionalAuth } from '../middlewares/auth.middleware';
import { documentedRoute } from '../middlewares/documentedRoute.middleware';
import {
  loginResponseSchema,
  loginSchema,
  registerResponseSchema,
  registerSchema,
} from '../validators/auth.validator';

export const authRouter = Router();

authRouter.post(
  '/register',
  optionalAuth,
  documentedRoute({
    method: 'post',
    path: '/register',
    tags: ['Auth'],
    summary: 'Create an account and sign in',
    body: registerSchema,
    responses: {
      201: { description: 'Account created', schema: successEnvelope(registerResponseSchema) },
      400: { description: 'Invalid details', schema: validationErrorEnvelope },
      409: { description: 'Email already registered', schema: errorEnvelope },
    },
  }),
  register,
);

authRouter.post(
  '/login',
  optionalAuth,
  documentedRoute({
    method: 'post',
    path: '/login',
    tags: ['Auth'],
    summary: 'Sign in with email and password',
    body: loginSchema,
    responses: {
      200: { description: 'Signed in', schema: successEnvelope(loginResponseSchema) },
      400: { description: 'Invalid details', schema: validationErrorEnvelope },
      401: { description: 'Wrong email or password', schema: errorEnvelope },
    },
  }),
  login,
);
