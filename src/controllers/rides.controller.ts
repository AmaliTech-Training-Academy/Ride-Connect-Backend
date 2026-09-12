import { db } from '../db';
import { rides } from '../db/schema';
import { authedController } from '../lib/http/controller';
import type { CreateRideInput } from '../validators/rides.validator';

/** POST /rides — publishes a Ride the authenticated User is driving. */
export const createRide = authedController<{ body: CreateRideInput }>(async (req, res) => {
  const { origin, destination, departureAt, seatsOffered } = req.validated.body;

  const [ride] = await db
    .insert(rides)
    .values({
      driverId: req.auth.user.id,
      origin,
      destination,
      departureAt,
      totalSeats: seatsOffered,
      availableSeats: seatsOffered,
    })
    .returning();

  res.customSuccess({
    status: 201,
    message: 'Ride created successfully',
    data: ride,
  });
});
