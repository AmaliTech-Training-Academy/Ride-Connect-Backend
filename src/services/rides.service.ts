import { db, type Executor } from '../db';
import { rides } from '../db/schema';
import type { CreateRideInput } from '../validators/rides.validator';

/** Publishes a Ride on behalf of its Driver, with every offered seat still free. */
export async function createRide(driverId: string, input: CreateRideInput, exec: Executor = db) {
  const [ride] = await exec
    .insert(rides)
    .values({
      driverId,
      origin: input.origin,
      destination: input.destination,
      departureAt: input.departureAt,
      totalSeats: input.seatsOffered,
      availableSeats: input.seatsOffered,
    })
    .returning({
      id: rides.id,
      driverId: rides.driverId,
      origin: rides.origin,
      destination: rides.destination,
      departureAt: rides.departureAt,
      totalSeats: rides.totalSeats,
      availableSeats: rides.availableSeats,
      status: rides.status,
      createdAt: rides.createdAt,
    });

  return ride;
}
