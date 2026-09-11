import { Router } from 'express';

import { createRide, listRides } from '../controllers/rides.controller';
import { requireAuth } from '../middlewares/requireAuth.middleware';

export const ridesRouter = Router();

ridesRouter.get('/rides', listRides);
ridesRouter.post('/rides', requireAuth, createRide);
