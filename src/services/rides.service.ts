import { and, asc, eq, gte, ilike, inArray, lt, or } from 'drizzle-orm';

import { db, type Executor } from '../db';
import { requestStatus, rideRequests, rides, users } from '../db/schema';
import { CustomError } from '../lib/http/errors';
import { logger } from '../lib/logger';
import type { CreateRideInput, ListRidesQuery, UpdateRideStatusInput } from '../validators/rides.validator';
import * as notifications from './notifications.service';

/** Any of the states a passenger's request to join a ride can be in. */
type RequestStatus = (typeof requestStatus.enumValues)[number];

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

/** True once a Ride has been cancelled or has run its course. */
function isPastOrCancelled(ride: { status: string }): boolean {
  return ride.status === 'CANCELLED' || ride.status === 'COMPLETED';
}

/**
 * Groups a set of Rides' pending join requests and confirmed passengers by ride id, for the
 * driver's dashboard.
 */
async function loadRequestSummaries(rideIds: string[], exec: Executor) {
  const summaries = new Map<
    string,
    {
      pendingRequests: { id: string; passengerId: string; passengerName: string; createdAt: Date | null }[];
      confirmedPassengers: { id: string; passengerId: string; passengerName: string }[];
    }
  >(rideIds.map((rideId) => [rideId, { pendingRequests: [], confirmedPassengers: [] }]));

  if (rideIds.length === 0) {
    return summaries;
  }

  const requests = await exec
    .select({
      rideId: rideRequests.rideId,
      id: rideRequests.id,
      passengerId: rideRequests.passengerId,
      passengerName: users.name,
      status: rideRequests.status,
      createdAt: rideRequests.createdAt,
    })
    .from(rideRequests)
    .innerJoin(users, eq(rideRequests.passengerId, users.id))
    .where(and(inArray(rideRequests.rideId, rideIds), inArray(rideRequests.status, ['PENDING', 'ACCEPTED'])))
    .orderBy(asc(rideRequests.createdAt));

  for (const request of requests) {
    const summary = summaries.get(request.rideId);
    if (!summary) {
      continue;
    }

    if (request.status === 'PENDING') {
      summary.pendingRequests.push({
        id: request.id,
        passengerId: request.passengerId,
        passengerName: request.passengerName,
        createdAt: request.createdAt,
      });
    } else {
      summary.confirmedPassengers.push({
        id: request.id,
        passengerId: request.passengerId,
        passengerName: request.passengerName,
      });
    }
  }

  return summaries;
}

/**
 * Lists the rides a user is driving and the rides they've requested to join.
 *
 * Driven rides carry their pending requests and confirmed passengers so the dashboard doesn't
 * need a follow-up call per ride. Joined rides carry the passenger's own request status
 * (pending, accepted, or declined) so a request never silently disappears from their view.
 */
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

  const requestSummaries = await loadRequestSummaries(
    driving.map((ride) => ride.id),
    exec,
  );

  const drivingWithRequests = driving.map((ride) => ({
    ...ride,
    ...requestSummaries.get(ride.id)!,
  }));

  const myRequests = await exec
    .select({
      rideId: rideRequests.rideId,
      requestId: rideRequests.id,
      requestStatus: rideRequests.status,
      requestedAt: rideRequests.createdAt,
    })
    .from(rideRequests)
    .where(eq(rideRequests.passengerId, userId));

  const requestByRideId = new Map(myRequests.map((request) => [request.rideId, request]));

  const joined =
    myRequests.length === 0
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
          .where(
            inArray(
              rides.id,
              myRequests.map((request) => request.rideId),
            ),
          )
          .orderBy(asc(rides.departureAt));

  const joinedWithStatus = joined.map((ride) => {
    const myRequest = requestByRideId.get(ride.id)!;
    return {
      ...ride,
      requestId: myRequest.requestId,
      requestStatus: myRequest.requestStatus,
      requestedAt: myRequest.requestedAt,
    };
  });

  return {
    driving: drivingWithRequests.filter((ride) => !isPastOrCancelled(ride)),
    joined: joinedWithStatus.filter((ride) => !isPastOrCancelled(ride)),
    pastAndCancelled: drivingWithRequests.filter(isPastOrCancelled),
    joinedPastAndCancelled: joinedWithStatus.filter(isPastOrCancelled),
  };
}

/** The ids of every passenger whose request on the ride is in any of the given states. */
async function loadPassengerIds(
  rideId: string,
  statuses: RequestStatus[],
  exec: Executor,
): Promise<string[]> {
  const rows = await exec
    .select({ passengerId: rideRequests.passengerId })
    .from(rideRequests)
    .where(and(eq(rideRequests.rideId, rideId), inArray(rideRequests.status, statuses)));

  return rows.map((row) => row.passengerId);
}

/**
 * Tells everyone still waiting on a seat, or already holding one, that the Ride is off.
 *
 * Two endpoints can cancel a ride — `cancelRide`, and `updateRideStatus` with CANCELLED — so
 * the fan-out lives here rather than in either one, which would leave the other path silent.
 */
async function notifyCancellation(ride: notifications.RideContext, exec: Executor): Promise<void> {
  const passengerIds = await loadPassengerIds(ride.id, ['PENDING', 'ACCEPTED'], exec);

  await notifications.notifyRideCancelled(ride, passengerIds, exec);
}

/**
 * Cancels a ride owned by the authenticated driver.
 *
 * Everyone still waiting on a seat, or holding one, is told. Passengers whose requests were
 * already declined or withdrawn are not: the ride ending is not news to them.
 */
export async function cancelRide(rideId: string, driverId: string, exec: Executor = db) {
  const [ride] = await exec
    .select({
      id: rides.id,
      driverId: rides.driverId,
      status: rides.status,
      origin: rides.origin,
      destination: rides.destination,
    })
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

  await notifyCancellation(ride, exec);

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

  // A status change cannot move the route, so the row already loaded above is still current.
  const rideContext = {
    id: ride.id,
    driverId: ride.driverId,
    origin: ride.origin,
    destination: ride.destination,
  };

  if (targetStatus === 'CANCELLED') {
    // Same fan-out the dedicated cancel endpoint sends, so neither path can go silent.
    await notifyCancellation(rideContext, exec);
  } else {
    // Closing or reopening the ride only concerns the passengers already holding a seat —
    // those still waiting have no commitment to it yet.
    await notifications.notifyRideUpdated(
      rideContext,
      await loadPassengerIds(rideId, ['ACCEPTED'], exec),
      exec,
    );
  }

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
