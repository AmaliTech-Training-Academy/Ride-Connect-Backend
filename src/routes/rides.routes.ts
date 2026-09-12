import { Router } from 'express';

import { createRide } from '../controllers/rides.controller';
import { requireAuth } from '../middlewares/auth.middleware';

export const ridesRouter = Router();

ridesRouter.post('/rides', requireAuth, createRide);
