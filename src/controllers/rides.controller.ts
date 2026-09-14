import { authedController } from '../lib/http/controller';
import * as ridesService from '../services/rides.service';
import type { CreateRideInput } from '../validators/rides.validator';

/** POST /api/rides — publishes a Ride the authenticated User is driving. */
export const createRide = authedController<{ body: CreateRideInput }>(async (req, res) => {
  const ride = await ridesService.createRide(req.auth.user.id, req.validated.body);

  res.customSuccess({
    status: 201,
    message: 'Ride created successfully',
    data: ride,
  });
});
