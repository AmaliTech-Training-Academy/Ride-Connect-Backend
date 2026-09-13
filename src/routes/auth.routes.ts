import { Router } from 'express';

import { login, register } from '../controllers/auth.controller';
import { optionalAuth } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { loginSchema, registerSchema } from '../validators/auth.validator';

export const authRouter = Router();

authRouter.post('/register', optionalAuth, validate({ body: registerSchema }), register);
authRouter.post('/login', optionalAuth, validate({ body: loginSchema }), login);
