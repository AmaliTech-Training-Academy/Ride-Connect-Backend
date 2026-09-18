import { and, asc, eq, gte, ilike, inArray, lt, or } from 'drizzle-orm';

import { db, type Executor } from '../db';
import { rideRequests, rides, users } from '../db/schema';
import { CustomError } from '../lib/http/errors';
import { logger } from '../lib/logger';
import type { CreateRideInput, ListRidesQuery, UpdateRideStatusInput } from '../validators/rides.validator';

const RIDE_NOT_FOUND = 'Ride not found.';
const NOT_RIDE_OWNER_STATUS = 'Only the driver who owns this ride can change its status.';
const RIDE_ALREADY_CANCELLED = 'This ride has already been cancelled and cannot be changed.';
const RIDE_ALREADY_COMPLETED = 'This ride has already completed and cannot be changed.';
const RIDE_CANNOT_REOPEN = 'This ride cannot be reopened because no seats are available.';
const RIDE_STATUS_UNCHANGED = (status: string) => `This ride is already ${status}.`;
const INVALID_STATUS_TRANSITION = 'This status change is not allowed.';
const RIDE_COMPLETION_SWEEP_INTERVAL_MS = 60_000;

/** True once a Ride's departure time has passed. */
function hasDeparted(departureAt: Date): boolean {
  return departureAt.getTime() <= Date.now();
}

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
  const conditions = [eq(rides.status, 'OPEN'), gte(rides.departureAt, new Date())];

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

/** Changes a Ride's status at its Driver's request: manually closing, cancelling, or reopening it. */
export async function updateRideStatus(
  rideId: string,
  driverId: string,
  targetStatus: UpdateRideStatusInput['status'],
  exec: Executor = db,
) {
  const [ride] = await exec.select().from(rides).where(eq(rides.id, rideId));

  if (!ride) {
    throw CustomError.notFound(RIDE_NOT_FOUND);
  }

  if (ride.driverId !== driverId) {
    throw CustomError.forbidden(NOT_RIDE_OWNER_STATUS);
  }

  if (ride.status === 'CANCELLED') {
    throw CustomError.conflict(RIDE_ALREADY_CANCELLED);
  }

  const alreadyCompleted =
    ride.status === 'COMPLETED' ||
    ((ride.status === 'OPEN' || ride.status === 'FULL') && hasDeparted(ride.departureAt));

  if (alreadyCompleted) {
    throw CustomError.conflict(RIDE_ALREADY_COMPLETED);
  }

  if (ride.status === targetStatus) {
    throw CustomError.conflict(RIDE_STATUS_UNCHANGED(targetStatus));
  }

  if (targetStatus === 'OPEN') {
    if (ride.status !== 'FULL') {
      throw CustomError.conflict(INVALID_STATUS_TRANSITION);
    }

    if (ride.availableSeats <= 0) {
      throw CustomError.conflict(RIDE_CANNOT_REOPEN);
    }
  }

  const [updated] = await exec
    .update(rides)
    .set({ status: targetStatus })
    .where(eq(rides.id, rideId))
    .returning({
      id: rides.id,
      driverId: rides.driverId,
      status: rides.status,
      availableSeats: rides.availableSeats,
    });

  return updated;
}

/** Marks OPEN or FULL Rides whose departure time has passed as COMPLETED. */
export async function completePastRides(exec: Executor = db): Promise<void> {
  await exec
    .update(rides)
    .set({ status: 'COMPLETED' })
    .where(and(inArray(rides.status, ['OPEN', 'FULL']), lt(rides.departureAt, new Date())));
}

/** Starts the periodic sweep that auto-completes past-departure Rides. Returns a handle to stop it. */
export function startRideCompletionSweep(
  intervalMs: number = RIDE_COMPLETION_SWEEP_INTERVAL_MS,
): NodeJS.Timeout {
  return setInterval(() => {
    completePastRides().catch((error: unknown) => logger.error('Ride completion sweep failed', error));
  }, intervalMs);
}
