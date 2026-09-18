import { and, asc, eq, gte, ilike, inArray, lt, or } from 'drizzle-orm';

import { db, type Executor } from '../db';
import { rideRequests, rides, users } from '../db/schema';
import { CustomError } from '../lib/http/errors';
import type { CreateRideInput, ListRidesQuery } from '../validators/rides.validator';

/** Publishes a Ride on behalf of its Driver, with every offered seat still free. */
export async function createRide(driverId: string, input: CreateRideInput, exec: Executor = db) {
  const [ride] = await exec
    .insert(rides)
    .values({
      driverId,
      origin: input.origin,
      destination: input.destination,
      routeDescription: input.routeDescription,
      departureAt: input.departureAt,
      totalSeats: input.seatsOffered,
      availableSeats: input.seatsOffered,
    })
    .returning({
      id: rides.id,
      driverId: rides.driverId,
      origin: rides.origin,
      destination: rides.destination,
      routeDescription: rides.routeDescription,
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
    .select({
      id: rides.id,
      driverId: rides.driverId,
      driverName: users.name,
      origin: rides.origin,
      destination: rides.destination,
      routeDescription: rides.routeDescription,
      departureAt: rides.departureAt,
      totalSeats: rides.totalSeats,
      availableSeats: rides.availableSeats,
      status: rides.status,
      createdAt: rides.createdAt,
    })
    .from(rides)
    .innerJoin(users, eq(rides.driverId, users.id))
    .where(and(...conditions))
    .orderBy(asc(rides.departureAt));
}

/** Lists the rides a user is driving and the rides they are confirmed on. */
export async function listMyRides(userId: string, exec: Executor = db) {
  const driving = await exec
    .select({
      id: rides.id,
      driverId: rides.driverId,
      driverName: users.name,
      origin: rides.origin,
      destination: rides.destination,
      routeDescription: rides.routeDescription,
      departureAt: rides.departureAt,
      totalSeats: rides.totalSeats,
      availableSeats: rides.availableSeats,
      status: rides.status,
      createdAt: rides.createdAt,
    })
    .from(rides)
    .innerJoin(users, eq(rides.driverId, users.id))
    .where(eq(rides.driverId, userId))
    .orderBy(asc(rides.departureAt));

  const acceptedRideIds = await exec
    .select({ rideId: rideRequests.rideId })
    .from(rideRequests)
    .where(and(eq(rideRequests.passengerId, userId), eq(rideRequests.status, 'ACCEPTED')));

  const joined =
    acceptedRideIds.length === 0
      ? []
      : await exec
          .select({
            id: rides.id,
            driverId: rides.driverId,
            driverName: users.name,
            origin: rides.origin,
            destination: rides.destination,
            routeDescription: rides.routeDescription,
            departureAt: rides.departureAt,
            totalSeats: rides.totalSeats,
            availableSeats: rides.availableSeats,
            status: rides.status,
            createdAt: rides.createdAt,
          })
          .from(rides)
          .innerJoin(users, eq(rides.driverId, users.id))
          .where(inArray(rides.id, acceptedRideIds.map(({ rideId }) => rideId)))
          .orderBy(asc(rides.departureAt));

  return {
    driving: driving.filter((ride) => ride.status !== 'CANCELLED' && ride.status !== 'COMPLETED'),
    joined,
    pastAndCancelled: driving.filter((ride) => ride.status === 'CANCELLED' || ride.status === 'COMPLETED'),
  };
}

/** Cancels a ride owned by the authenticated driver. */
export async function cancelRide(rideId: string, driverId: string, exec: Executor = db) {
  const [ride] = await exec
    .select({ id: rides.id, driverId: rides.driverId, status: rides.status })
    .from(rides)
    .where(eq(rides.id, rideId));

  if (!ride) {
    throw CustomError.notFound('Ride not found.');
  }

  if (ride.driverId !== driverId) {
    throw CustomError.forbidden('Only the driver who owns this ride can cancel it.');
  }

  if (ride.status === 'CANCELLED') {
    throw CustomError.conflict('This ride has already been cancelled.');
  }

  const [cancelled] = await exec
    .update(rides)
    .set({ status: 'CANCELLED' })
    .where(eq(rides.id, rideId))
    .returning({
      id: rides.id,
      driverId: rides.driverId,
      origin: rides.origin,
      destination: rides.destination,
      routeDescription: rides.routeDescription,
      departureAt: rides.departureAt,
      totalSeats: rides.totalSeats,
      availableSeats: rides.availableSeats,
      status: rides.status,
      createdAt: rides.createdAt,
    });

  return cancelled;
}

