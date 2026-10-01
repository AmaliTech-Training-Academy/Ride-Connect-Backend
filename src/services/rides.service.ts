import { and, asc, eq, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm';

import { db, type Executor } from '../db';
import { requestStatus, rideRequests, rides, users } from '../db/schema';
import { CustomError } from '../lib/http/errors';
import { logger } from '../lib/logger';
import {
  toDepartureInstant,
  type CreateRideInput,
  type ListRidesQuery,
  type UpdateRideInput,
  type UpdateRideStatusInput,
} from '../validators/rides.validator';
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
const NOT_RIDE_OWNER_EDIT = 'Only the driver who owns this ride can edit it.';
const SAME_ORIGIN_DESTINATION = 'Destination must be different from origin.';
const DEPARTURE_IN_PAST = 'Departure date and time cannot be in the past.';
const SEATS_BELOW_ACCEPTED = (taken: number) =>
  `Total seats cannot be less than the ${taken} passenger(s) already accepted.`;
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
      office: input.office,
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
      office: rides.office,
      createdAt: rides.createdAt,
    });

  return ride;
}

/** Lists open Rides, soonest departure first, optionally filtered by day, office, or keyword. One page at a time. */
export async function listRides(filters: ListRidesQuery, exec: Executor = db) {
  const conditions = [eq(rides.status, 'OPEN'), gte(rides.departureAt, new Date())];

  if (filters.date) {
    const dayStart = new Date(`${filters.date}T00:00:00Z`);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    conditions.push(gte(rides.departureAt, dayStart), lt(rides.departureAt, dayEnd));
  }

  if (filters.office) {
    conditions.push(eq(rides.office, filters.office));
  }

  if (filters.search) {
    const keyword = `%${filters.search}%`;
    // The office is an enum, so it is cast to text to be matched like the route.
    const routeMatch = or(
      ilike(rides.origin, keyword),
      ilike(rides.destination, keyword),
      ilike(sql`${rides.office}::text`, keyword),
    );
    if (routeMatch) {
      conditions.push(routeMatch);
    }
  }

  return exec
    .select({
      id: rides.id,
      driverId: rides.driverId,
      driverName: users.name,
      driverImage: users.image,
      origin: rides.origin,
      destination: rides.destination,
      routeDescription: rides.routeDescription,
      departureAt: rides.departureAt,
      totalSeats: rides.totalSeats,
      availableSeats: rides.availableSeats,
      status: rides.status,
      office: rides.office,
      createdAt: rides.createdAt,
    })
    .from(rides)
    .innerJoin(users, eq(rides.driverId, users.id))
    .where(and(...conditions))
    // `id` breaks ties so rides leaving at the same time keep a stable order across pages.
    .orderBy(asc(rides.departureAt), asc(rides.id))
    .limit(filters.limit)
    .offset(filters.offset);
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
      pendingRequests: { id: string; passengerId: string; passengerName: string; passengerImage: string | null; createdAt: Date | null }[];
      confirmedPassengers: { id: string; passengerId: string; passengerName: string; passengerImage: string | null }[];
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
      passengerImage: users.image,
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
        passengerImage: request.passengerImage,
        createdAt: request.createdAt,
      });
    } else {
      summary.confirmedPassengers.push({
        id: request.id,
        passengerId: request.passengerId,
        passengerName: request.passengerName,
        passengerImage: request.passengerImage,
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
      driverImage: users.image,
      origin: rides.origin,
      destination: rides.destination,
      routeDescription: rides.routeDescription,
      departureAt: rides.departureAt,
      totalSeats: rides.totalSeats,
      availableSeats: rides.availableSeats,
      status: rides.status,
      office: rides.office,
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
      rejectionReason: rideRequests.rejectionReason,
      rerequestCount: rideRequests.rerequestCount,
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
            driverImage: users.image,
            origin: rides.origin,
            destination: rides.destination,
            routeDescription: rides.routeDescription,
            departureAt: rides.departureAt,
            totalSeats: rides.totalSeats,
            availableSeats: rides.availableSeats,
            status: rides.status,
            office: rides.office,
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
      rejectionReason: myRequest.rejectionReason,
      rerequestCount: myRequest.rerequestCount,
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
 *
 * Runs in one transaction with the ride row locked, so the status change and the
 * notifications either all commit or all roll back.
 */
export async function cancelRide(rideId: string, driverId: string) {
  return db.transaction(async (tx) => {
    const [ride] = await tx
      .select({
        id: rides.id,
        driverId: rides.driverId,
        status: rides.status,
        origin: rides.origin,
        destination: rides.destination,
        departureAt: rides.departureAt,
      })
      .from(rides)
      .where(eq(rides.id, rideId))
      .for('update');

    if (!ride) {
      throw CustomError.notFound('Ride not found.');
    }

    if (ride.driverId !== driverId) {
      throw CustomError.forbidden('Only the driver who owns this ride can cancel it.');
    }

    if (ride.status === 'CANCELLED') {
      throw CustomError.conflict('This ride has already been cancelled.');
    }

    // Same guard as updateRideStatus, so both cancel paths agree.
    const alreadyCompleted =
      ride.status === 'COMPLETED' ||
      ((ride.status === 'OPEN' || ride.status === 'FULL') && hasDeparted(ride.departureAt));

    if (alreadyCompleted) {
      throw CustomError.conflict(RIDE_ALREADY_COMPLETED);
    }

    const [cancelled] = await tx
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
        office: rides.office,
        createdAt: rides.createdAt,
      });

    await notifyCancellation(ride, tx);

    return cancelled;
  });
}

/**
 * Changes a Ride's status at its Driver's request: manually closing, cancelling, or reopening it.
 *
 * Locks the ride row, same as `cancelRide`, so the change can't race an accept or a withdrawal,
 * and a cancel's notifications commit or roll back together with the status change.
 */
export async function updateRideStatus(
  rideId: string,
  driverId: string,
  targetStatus: UpdateRideStatusInput['status'],
) {
  return db.transaction(async (tx) => {
    const [ride] = await tx.select().from(rides).where(eq(rides.id, rideId)).for('update');

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

    const [updated] = await tx
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
      await notifyCancellation(rideContext, tx);
    } else {
      // Closing or reopening the ride only concerns the passengers already holding a seat —
      // those still waiting have no commitment to it yet.
      await notifications.notifyRideUpdated(
        rideContext,
        await loadPassengerIds(rideId, ['ACCEPTED'], tx),
        tx,
      );
    }

    return updated;
  });
}

/**
 * Edits a Ride's details on behalf of its Driver. Only the fields sent are changed.
 *
 * Locks the ride row, same as `acceptRequest`, so a passenger can't be accepted onto a seat
 * while the total is being reduced. Seats already taken by accepted passengers are kept:
 * `availableSeats` is recalculated from the new total, and a FULL ride that gains seats opens
 * again. If the route or departure changed, accepted passengers get a RIDE_UPDATED
 * notification so they can see the trip is not what they agreed to.
 */
export async function updateRide(rideId: string, driverId: string, input: UpdateRideInput) {
  return db.transaction(async (tx) => {
    const [ride] = await tx.select().from(rides).where(eq(rides.id, rideId)).for('update');

    if (!ride) {
      throw CustomError.notFound(RIDE_NOT_FOUND);
    }

    if (ride.driverId !== driverId) {
      throw CustomError.forbidden(NOT_RIDE_OWNER_EDIT);
    }

    if (ride.status === 'CANCELLED') {
      throw CustomError.conflict(RIDE_ALREADY_CANCELLED);
    }

    // A ride that has already left counts as completed, even before the sweep marks it.
    if (ride.status === 'COMPLETED' || hasDeparted(ride.departureAt)) {
      throw CustomError.conflict(RIDE_ALREADY_COMPLETED);
    }

    const origin = input.origin ?? ride.origin;
    const destination = input.destination ?? ride.destination;

    if (origin.toLowerCase() === destination.toLowerCase()) {
      throw CustomError.badRequest(SAME_ORIGIN_DESTINATION);
    }

    // The ride stores one UTC instant, so fill in whichever half of it wasn't sent.
    const currentDeparture = ride.departureAt.toISOString();
    const departureAt = toDepartureInstant(
      input.departureDate ?? currentDeparture.slice(0, 10),
      input.departureTime ?? currentDeparture.slice(11, 19),
    );

    if (hasDeparted(departureAt)) {
      throw CustomError.badRequest(DEPARTURE_IN_PAST);
    }

    // Every seat not available is held by an accepted passenger.
    const takenSeats = ride.totalSeats - ride.availableSeats;
    const totalSeats = input.totalSeats ?? ride.totalSeats;

    if (totalSeats < takenSeats) {
      throw CustomError.conflict(SEATS_BELOW_ACCEPTED(takenSeats));
    }

    const availableSeats = totalSeats - takenSeats;

    // A ride the driver closed by hand stays closed unless the edit actually frees up seats.
    let status = ride.status;
    if (availableSeats === 0) {
      status = 'FULL';
    } else if (availableSeats > ride.availableSeats) {
      status = 'OPEN';
    }

    const [updated] = await tx
      .update(rides)
      .set({
        origin,
        destination,
        departureAt,
        totalSeats,
        availableSeats,
        // Not sent keeps the old description; an empty string clears it.
        routeDescription: input.routeDescription === undefined ? ride.routeDescription : input.routeDescription || null,
        status,
        updatedAt: new Date(),
      })
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
        office: rides.office,
        createdAt: rides.createdAt,
      });

    // Only route or time changes are worth telling passengers about, not seats.
    const tripChanged =
      origin !== ride.origin ||
      destination !== ride.destination ||
      departureAt.getTime() !== ride.departureAt.getTime();

    if (tripChanged) {
      await notifications.notifyRideUpdated(
        { id: ride.id, driverId: ride.driverId, origin, destination },
        await loadPassengerIds(rideId, ['ACCEPTED'], tx),
        tx,
      );
    }

    return updated;
  });
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
