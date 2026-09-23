import { and, asc, eq } from 'drizzle-orm';

import { db, type Executor } from '../db';
import { rideRequests, rides, users } from '../db/schema';
import { CustomError } from '../lib/http/errors';

const RIDE_NOT_FOUND = 'Ride not found.';
const REQUEST_NOT_FOUND = 'Request not found.';
const REQUEST_ALREADY_DECIDED = 'This request has already been decided.';
const CANNOT_JOIN_OWN_RIDE = 'You cannot request to join your own ride.';
const RIDE_NOT_OPEN = 'This ride is not open for requests.';
const DUPLICATE_REQUEST = 'You have already requested to join this ride.';
const NO_SEATS_REMAINING = 'No seats remain on this ride.';
const RIDE_CANCELLED = 'This ride has been cancelled.';
const RIDE_COMPLETED = 'This ride has already completed.';
const RIDE_FULL = 'This ride is full.';
const NOT_RIDE_OWNER_VIEW = 'Only the driver who owns this ride can view its requests.';
const NOT_RIDE_OWNER_ACCEPT = 'Only the driver who owns this ride can accept its requests.';
const NOT_RIDE_OWNER_DECLINE = 'Only the driver who owns this ride can decline its requests.';
const NOT_REQUEST_OWNER = 'Only the passenger who made this request can withdraw it.';
const REQUEST_ALREADY_INACTIVE = 'This request has already been declined or withdrawn.';

/** True once a Ride's departure time has passed. */
function hasDeparted(departureAt: Date): boolean {
  return departureAt.getTime() <= Date.now();
}

/** Submits a passenger's request to join an open Ride. */
export async function createRequest(rideId: string, passengerId: string, exec: Executor = db) {
  const [ride] = await exec
    .select({ id: rides.id, driverId: rides.driverId, status: rides.status, departureAt: rides.departureAt })
    .from(rides)
    .where(eq(rides.id, rideId));

  if (!ride) {
    throw CustomError.notFound(RIDE_NOT_FOUND);
  }

  if (ride.driverId === passengerId) {
    throw CustomError.forbidden(CANNOT_JOIN_OWN_RIDE);
  }

  if (ride.status !== 'OPEN' || hasDeparted(ride.departureAt)) {
    throw CustomError.conflict(RIDE_NOT_OPEN);
  }

  const [existing] = await exec
    .select({ id: rideRequests.id })
    .from(rideRequests)
    .where(and(eq(rideRequests.rideId, rideId), eq(rideRequests.passengerId, passengerId)));

  if (existing) {
    throw CustomError.conflict(DUPLICATE_REQUEST);
  }

  const [joinRequest] = await exec
    .insert(rideRequests)
    .values({ rideId, passengerId })
    .returning({
      id: rideRequests.id,
      rideId: rideRequests.rideId,
      passengerId: rideRequests.passengerId,
      status: rideRequests.status,
      createdAt: rideRequests.createdAt,
    });

  return joinRequest;
}

/** Lists the pending join requests for a Ride, for the Driver who owns it. */
export async function listRideRequests(rideId: string, driverId: string, exec: Executor = db) {
  const [ride] = await exec
    .select({ id: rides.id, driverId: rides.driverId })
    .from(rides)
    .where(eq(rides.id, rideId));

  if (!ride) {
    throw CustomError.notFound(RIDE_NOT_FOUND);
  }

  if (ride.driverId !== driverId) {
    throw CustomError.forbidden(NOT_RIDE_OWNER_VIEW);
  }

  return exec
    .select({
      id: rideRequests.id,
      passengerId: rideRequests.passengerId,
      passengerName: users.name,
      status: rideRequests.status,
      createdAt: rideRequests.createdAt,
    })
    .from(rideRequests)
    .innerJoin(users, eq(rideRequests.passengerId, users.id))
    .where(and(eq(rideRequests.rideId, rideId), eq(rideRequests.status, 'PENDING')))
    .orderBy(asc(rideRequests.createdAt));
}

/**
 * Accepts a pending join request: takes a seat and fills the Ride once none remain.
 *
 * Locks the ride row for the duration of the transaction so two concurrent
 * accepts can't both read the same seat count and take it below zero.
 */
export async function acceptRequest(rideId: string, requestId: string, driverId: string) {
  return db.transaction(async (tx) => {
    const [ride] = await tx.select().from(rides).where(eq(rides.id, rideId)).for('update');

    if (!ride) {
      throw CustomError.notFound(RIDE_NOT_FOUND);
    }

    if (ride.driverId !== driverId) {
      throw CustomError.forbidden(NOT_RIDE_OWNER_ACCEPT);
    }

    if (ride.status === 'CANCELLED') {
      throw CustomError.conflict(RIDE_CANCELLED);
    }

    if (ride.status === 'COMPLETED' || ((ride.status === 'OPEN' || ride.status === 'FULL') && hasDeparted(ride.departureAt))) {
      throw CustomError.conflict(RIDE_COMPLETED);
    }

    if (ride.status === 'FULL') {
      throw CustomError.conflict(RIDE_FULL);
    }

    const [joinRequest] = await tx
      .select()
      .from(rideRequests)
      .where(and(eq(rideRequests.id, requestId), eq(rideRequests.rideId, rideId)));

    if (!joinRequest) {
      throw CustomError.notFound(REQUEST_NOT_FOUND);
    }

    if (joinRequest.status !== 'PENDING') {
      throw CustomError.conflict(REQUEST_ALREADY_DECIDED);
    }

    if (ride.availableSeats <= 0) {
      throw CustomError.conflict(NO_SEATS_REMAINING);
    }

    const availableSeats = ride.availableSeats - 1;

    await tx
      .update(rides)
      .set({ availableSeats, status: availableSeats === 0 ? 'FULL' : ride.status })
      .where(eq(rides.id, rideId));

    const [accepted] = await tx
      .update(rideRequests)
      .set({ status: 'ACCEPTED' })
      .where(eq(rideRequests.id, requestId))
      .returning({
        id: rideRequests.id,
        rideId: rideRequests.rideId,
        passengerId: rideRequests.passengerId,
        status: rideRequests.status,
      });

    return accepted;
  });
}

/** Declines a pending join request. Seat availability is unaffected. */
export async function declineRequest(
  rideId: string,
  requestId: string,
  driverId: string,
  exec: Executor = db,
) {
  const [ride] = await exec
    .select({ id: rides.id, driverId: rides.driverId })
    .from(rides)
    .where(eq(rides.id, rideId));

  if (!ride) {
    throw CustomError.notFound(RIDE_NOT_FOUND);
  }

  if (ride.driverId !== driverId) {
    throw CustomError.forbidden(NOT_RIDE_OWNER_DECLINE);
  }

  const [joinRequest] = await exec
    .select({ id: rideRequests.id, status: rideRequests.status })
    .from(rideRequests)
    .where(and(eq(rideRequests.id, requestId), eq(rideRequests.rideId, rideId)));

  if (!joinRequest) {
    throw CustomError.notFound(REQUEST_NOT_FOUND);
  }

  if (joinRequest.status !== 'PENDING') {
    throw CustomError.conflict(REQUEST_ALREADY_DECIDED);
  }

  const [declined] = await exec
    .update(rideRequests)
    .set({ status: 'DECLINED' })
    .where(eq(rideRequests.id, requestId))
    .returning({
      id: rideRequests.id,
      rideId: rideRequests.rideId,
      passengerId: rideRequests.passengerId,
      status: rideRequests.status,
    });

  return declined;
}

/**
 * Withdraws the caller's own join request: cancels it if still pending, or gives up an
 * accepted seat if they'd already been confirmed.
 *
 * Locks the ride row for the duration of the transaction, same as `acceptRequest`, so a
 * withdrawal that frees a seat can't race a concurrent accept.
 */
export async function withdrawRequest(rideId: string, requestId: string, passengerId: string) {
  return db.transaction(async (tx) => {
    const [ride] = await tx.select().from(rides).where(eq(rides.id, rideId)).for('update');

    if (!ride) {
      throw CustomError.notFound(RIDE_NOT_FOUND);
    }

    const [joinRequest] = await tx
      .select()
      .from(rideRequests)
      .where(and(eq(rideRequests.id, requestId), eq(rideRequests.rideId, rideId)));

    if (!joinRequest) {
      throw CustomError.notFound(REQUEST_NOT_FOUND);
    }

    if (joinRequest.passengerId !== passengerId) {
      throw CustomError.forbidden(NOT_REQUEST_OWNER);
    }

    if (joinRequest.status === 'DECLINED' || joinRequest.status === 'WITHDRAWN') {
      throw CustomError.conflict(REQUEST_ALREADY_INACTIVE);
    }

    if (joinRequest.status === 'ACCEPTED') {
      const availableSeats = Math.min(ride.availableSeats + 1, ride.totalSeats);

      await tx
        .update(rides)
        .set({ availableSeats, status: ride.status === 'FULL' ? 'OPEN' : ride.status })
        .where(eq(rides.id, rideId));
    }

    const [withdrawn] = await tx
      .update(rideRequests)
      .set({ status: 'WITHDRAWN' })
      .where(eq(rideRequests.id, requestId))
      .returning({
        id: rideRequests.id,
        rideId: rideRequests.rideId,
        passengerId: rideRequests.passengerId,
        status: rideRequests.status,
      });

    return withdrawn;
  });
}
