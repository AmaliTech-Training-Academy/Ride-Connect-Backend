import { and, asc, eq } from 'drizzle-orm';

import { db, type Executor } from '../db';
import { rideRequests, rides, users } from '../db/schema';
import { CustomError } from '../lib/http/errors';

/** Submits a passenger's request to join an open Ride. */
export async function createRequest(rideId: string, passengerId: string, exec: Executor = db) {
  const [ride] = await exec
    .select({ id: rides.id, driverId: rides.driverId, status: rides.status })
    .from(rides)
    .where(eq(rides.id, rideId));

  if (!ride) {
    throw CustomError.notFound('Ride not found.');
  }

  if (ride.driverId === passengerId) {
    throw CustomError.forbidden('You cannot request to join your own ride.');
  }

  if (ride.status !== 'OPEN') {
    throw CustomError.conflict('This ride is not open for requests.');
  }

  const [existing] = await exec
    .select({ id: rideRequests.id })
    .from(rideRequests)
    .where(and(eq(rideRequests.rideId, rideId), eq(rideRequests.passengerId, passengerId)));

  if (existing) {
    throw CustomError.conflict('You have already requested to join this ride.');
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
    throw CustomError.notFound('Ride not found.');
  }

  if (ride.driverId !== driverId) {
    throw CustomError.forbidden('Only the driver who owns this ride can view its requests.');
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
      throw CustomError.notFound('Ride not found.');
    }

    if (ride.driverId !== driverId) {
      throw CustomError.forbidden('Only the driver who owns this ride can accept its requests.');
    }

    const [joinRequest] = await tx
      .select()
      .from(rideRequests)
      .where(and(eq(rideRequests.id, requestId), eq(rideRequests.rideId, rideId)));

    if (!joinRequest) {
      throw CustomError.notFound('Request not found.');
    }

    if (joinRequest.status !== 'PENDING') {
      throw CustomError.conflict('This request has already been decided.');
    }

    if (ride.availableSeats <= 0) {
      throw CustomError.conflict('No seats remain on this ride.');
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
    throw CustomError.notFound('Ride not found.');
  }

  if (ride.driverId !== driverId) {
    throw CustomError.forbidden('Only the driver who owns this ride can decline its requests.');
  }

  const [joinRequest] = await exec
    .select({ id: rideRequests.id, status: rideRequests.status })
    .from(rideRequests)
    .where(and(eq(rideRequests.id, requestId), eq(rideRequests.rideId, rideId)));

  if (!joinRequest) {
    throw CustomError.notFound('Request not found.');
  }

  if (joinRequest.status !== 'PENDING') {
    throw CustomError.conflict('This request has already been decided.');
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
