import { and, asc, eq, gte, ilike, lt, or } from 'drizzle-orm';

import { db, type Executor } from '../db';
import { rides } from '../db/schema';
import type { CreateRideInput, ListRidesQuery } from '../validators/rides.validator';

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

/** Lists open Rides, soonest departure first, optionally filtered by day or route keyword. */
export async function listRides(filters: ListRidesQuery, exec: Executor = db) {
  const conditions = [eq(rides.status, 'OPEN')];

  if (filters.date) {
    const dayStart = new Date(`${filters.date}T00:00:00Z`);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    conditions.push(gte(rides.departureAt, dayStart), lt(rides.departureAt, dayEnd));
  }

  if (filters.search) {
    const keyword = `%${filters.search}%`;
    const routeMatch = or(ilike(rides.origin, keyword), ilike(rides.destination, keyword));
    if (routeMatch) {
      conditions.push(routeMatch);
    }
  }

  return exec
    .select()
    .from(rides)
    .where(and(...conditions))
    .orderBy(asc(rides.departureAt));
}
