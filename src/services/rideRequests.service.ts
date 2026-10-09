import { and, asc, eq, inArray } from 'drizzle-orm';

import { db, type Executor } from '../db';
import { rideRequests, rides, users } from '../db/schema';
import { CustomError } from '../lib/http/errors';
import * as notifications from './notifications.service';

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
const NOT_RIDE_OWNER_REMOVE = 'Only the driver who owns this ride can remove its passengers.';
const REQUEST_NOT_ACCEPTED = 'Only an accepted passenger can be removed from the ride.';
const NOT_REQUEST_OWNER ='Only the passenger who made this request can withdraw it.';
const REQUEST_ALREADY_INACTIVE = 'This request has already been declined or withdrawn.';
const NOT_REQUEST_OWNER_REREQUEST = 'Only the passenger who made this request can request again.';
const REQUEST_NOT_DECLINED = 'You can only request again after your request has been declined.';
const REREQUEST_LIMIT_REACHED = 'You have already requested this ride again. The decline is final.';

/** True once a Ride's departure time has passed. */
function hasDeparted(departureAt: Date): boolean {
  return departureAt.getTime() <= Date.now();
}

/** Submits a passenger's request to join an open Ride. */
export async function createRequest(rideId: string, passengerId: string, exec: Executor = db) {
  const [ride] = await exec
    .select({
      id: rides.id,
      driverId: rides.driverId,
      status: rides.status,
      departureAt: rides.departureAt,
      origin: rides.origin,
      destination: rides.destination,
    })
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

  // `INSERT … RETURNING` yields exactly one row or throws, so the id is always there.
  await notifications.notifyRequestReceived(ride, joinRequest!.id, passengerId, exec);

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

  const requests = await exec
    .select({
      id: rideRequests.id,
      passengerId: rideRequests.passengerId,
      passengerName: users.name,
      passengerImage: users.image,
      status: rideRequests.status,
      rerequestCount: rideRequests.rerequestCount,
      rejectionReason: rideRequests.rejectionReason,
      rerequestReason: rideRequests.rerequestReason,
      createdAt: rideRequests.createdAt,
    })
    .from(rideRequests)
    .innerJoin(users, eq(rideRequests.passengerId, users.id))
    .where(and(eq(rideRequests.rideId, rideId), eq(rideRequests.status, 'PENDING')))
    .orderBy(asc(rideRequests.createdAt));

  return requests.map(({ rerequestCount, ...request }) => ({
    ...request,
    isRerequest: rerequestCount > 0,
  }));
}

/**
 * Accepts a pending join request: takes a seat and fills the Ride once none remain.
 *
 * Locks the ride row for the duration of the transaction so two concurrent
 * accepts can't both read the same seat count and take it below zero, and guards
 * the write itself on `PENDING` so an accept can never clobber a decision made in
 * between. Zero rows back means someone else got there first.
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
      .where(and(eq(rideRequests.id, requestId), eq(rideRequests.status, 'PENDING')))
      .returning({
        id: rideRequests.id,
        rideId: rideRequests.rideId,
        passengerId: rideRequests.passengerId,
        status: rideRequests.status,
      });

    if (!accepted) {
      throw CustomError.conflict(REQUEST_ALREADY_DECIDED);
    }

    await notifications.notifyRequestAccepted(ride, requestId, joinRequest.passengerId, tx);

    return accepted;
  });
}

/**
 * Declines a pending join request with the driver's reason. Seat availability is unaffected.
 * Declining a re-request stores the reason separately so the first one is kept, and is final.
 *
 * Locks the ride row before reading the request, the same way `acceptRequest` does, so a
 * decline and an accept on one request serialize instead of racing. The write is guarded on
 * `PENDING`: zero rows back means the request was decided in between, which is the same 409
 * the pre-check below would have thrown.
 */
export async function declineRequest(rideId: string, requestId: string, driverId: string, reason: string) {
  return db.transaction(async (tx) => {
    const [ride] = await tx
      .select({
        id: rides.id,
        driverId: rides.driverId,
        status: rides.status,
        origin: rides.origin,
        destination: rides.destination,
      })
      .from(rides)
      .where(eq(rides.id, rideId))
      .for('update');

    if (!ride) {
      throw CustomError.notFound(RIDE_NOT_FOUND);
    }

    if (ride.driverId !== driverId) {
      throw CustomError.forbidden(NOT_RIDE_OWNER_DECLINE);
    }

    if (ride.status === 'CANCELLED') {
      throw CustomError.conflict(RIDE_CANCELLED);
    }

    const [joinRequest] = await tx
      .select({
        id: rideRequests.id,
        passengerId: rideRequests.passengerId,
        status: rideRequests.status,
        rerequestCount: rideRequests.rerequestCount,
      })
      .from(rideRequests)
      .where(and(eq(rideRequests.id, requestId), eq(rideRequests.rideId, rideId)));

    if (!joinRequest) {
      throw CustomError.notFound(REQUEST_NOT_FOUND);
    }

    if (joinRequest.status !== 'PENDING') {
      throw CustomError.conflict(REQUEST_ALREADY_DECIDED);
    }

    const reasonField =
      joinRequest.rerequestCount > 0 ? { finalRejectionReason: reason } : { rejectionReason: reason };

    const [declined] = await tx
      .update(rideRequests)
      .set({ status: 'DECLINED', ...reasonField })
      .where(and(eq(rideRequests.id, requestId), eq(rideRequests.status, 'PENDING')))
      .returning({
        id: rideRequests.id,
        rideId: rideRequests.rideId,
        passengerId: rideRequests.passengerId,
        status: rideRequests.status,
      });

    if (!declined) {
      throw CustomError.conflict(REQUEST_ALREADY_DECIDED);
    }

    await notifications.notifyRequestDeclined(ride, requestId, joinRequest.passengerId, tx);

    return declined;
  });
}

/**
 * Lets the driver take back a seat they already gave: the accepted passenger is removed from
 * the Ride with a reason, and the seat is freed. The request ends up DECLINED, so the passenger
 * sees it the same way as a normal decline.
 *
 * Locks the ride row like `withdrawRequest`, since it gives a seat back the same way.
 */
export async function removePassenger(rideId: string, requestId: string, driverId: string, reason: string) {
  return db.transaction(async (tx) => {
    const [ride] = await tx.select().from(rides).where(eq(rides.id, rideId)).for('update');

    if (!ride) {
      throw CustomError.notFound(RIDE_NOT_FOUND);
    }

    if (ride.driverId !== driverId) {
      throw CustomError.forbidden(NOT_RIDE_OWNER_REMOVE);
    }

    if (ride.status === 'CANCELLED') {
      throw CustomError.conflict(RIDE_CANCELLED);
    }

    if (ride.status === 'COMPLETED' || hasDeparted(ride.departureAt)) {
      throw CustomError.conflict(RIDE_COMPLETED);
    }

    const [joinRequest] = await tx
      .select()
      .from(rideRequests)
      .where(and(eq(rideRequests.id, requestId), eq(rideRequests.rideId, rideId)));

    if (!joinRequest) {
      throw CustomError.notFound(REQUEST_NOT_FOUND);
    }

    if (joinRequest.status !== 'ACCEPTED') {
      throw CustomError.conflict(REQUEST_NOT_ACCEPTED);
    }

    const availableSeats = Math.min(ride.availableSeats + 1, ride.totalSeats);
    // Same rule as a withdrawal: only reopen a ride that was full because it ran out of seats.
    const ranOutOfSeats = ride.status === 'FULL' && ride.availableSeats === 0;

    await tx
      .update(rides)
      .set({ availableSeats, status: ranOutOfSeats ? 'OPEN' : ride.status })
      .where(eq(rides.id, rideId));

    const reasonField =
      joinRequest.rerequestCount > 0 ? { finalRejectionReason: reason } : { rejectionReason: reason };

    const [removed] = await tx
      .update(rideRequests)
      .set({ status: 'DECLINED', ...reasonField })
      .where(and(eq(rideRequests.id, requestId), eq(rideRequests.status, 'ACCEPTED')))
      .returning({
        id: rideRequests.id,
        rideId: rideRequests.rideId,
        passengerId: rideRequests.passengerId,
        status: rideRequests.status,
      });

    if (!removed) {
      throw CustomError.conflict(REQUEST_NOT_ACCEPTED);
    }

    await notifications.notifyRequestDeclined(ride, requestId, joinRequest.passengerId, tx);

    return removed;
  });
}

/**
 * Lets a passenger ask the driver to reconsider a declined request, once per ride.
 * Reuses the same request row and puts it back to PENDING; no seat is taken until the driver accepts.
 *
 * Locks the ride row first, matching `acceptRequest`, so the "is the ride still open" check
 * cannot go stale under a concurrent cancel. The write is guarded on `DECLINED`, keeping the
 * one-re-request-per-ride rule intact even if two calls arrive together; zero rows back is the
 * same 409 the pre-check below would have thrown.
 */
export async function rerequestRequest(rideId: string, requestId: string, passengerId: string, reason: string) {
  return db.transaction(async (tx) => {
    const [ride] = await tx
      .select({
        id: rides.id,
        driverId: rides.driverId,
        status: rides.status,
        departureAt: rides.departureAt,
        // Carried for the notification's route snapshot, not used in the checks below.
        origin: rides.origin,
        destination: rides.destination,
      })
      .from(rides)
      .where(eq(rides.id, rideId))
      .for('update');

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
      throw CustomError.forbidden(NOT_REQUEST_OWNER_REREQUEST);
    }

    if (ride.driverId === passengerId) {
      throw CustomError.forbidden(CANNOT_JOIN_OWN_RIDE);
    }

    if (ride.status === 'CANCELLED') {
      throw CustomError.conflict(RIDE_CANCELLED);
    }

    if (joinRequest.status !== 'DECLINED') {
      throw CustomError.conflict(REQUEST_NOT_DECLINED);
    }

    if (joinRequest.rerequestCount >= 1) {
      throw CustomError.conflict(REREQUEST_LIMIT_REACHED);
    }

    if (ride.status !== 'OPEN' || hasDeparted(ride.departureAt)) {
      throw CustomError.conflict(RIDE_NOT_OPEN);
    }

    const [rerequested] = await tx
      .update(rideRequests)
      .set({
        status: 'PENDING',
        rerequestReason: reason,
        rerequestCount: joinRequest.rerequestCount + 1,
      })
      .where(and(eq(rideRequests.id, requestId), eq(rideRequests.status, 'DECLINED')))
      .returning({
        id: rideRequests.id,
        rideId: rideRequests.rideId,
        passengerId: rideRequests.passengerId,
        status: rideRequests.status,
      });

    if (!rerequested) {
      throw CustomError.conflict(REQUEST_NOT_DECLINED);
    }

    // The request is pending again and the driver has to decide on it afresh, so it is news to
    // them in exactly the way the first ask was. Without this the driver is never told at all:
    // there is no email or push, so the re-request would sit unseen until they happened to open
    // the ride's request list.
    await notifications.notifyRequestRerequested(ride, requestId, passengerId, tx);

    return rerequested;
  });
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

    if (ride.status === 'CANCELLED') {
      throw CustomError.conflict(RIDE_CANCELLED);
    }

    if (joinRequest.status === 'DECLINED' || joinRequest.status === 'WITHDRAWN') {
      throw CustomError.conflict(REQUEST_ALREADY_INACTIVE);
    }

    if (joinRequest.status === 'ACCEPTED') {
      const availableSeats = Math.min(ride.availableSeats + 1, ride.totalSeats);
      // Only reopen a ride that was full because it ran out of seats. If the driver marked it
      // Full by hand while seats were left, that choice stands.
      const ranOutOfSeats = ride.status === 'FULL' && ride.availableSeats === 0;

      await tx
        .update(rides)
        .set({ availableSeats, status: ranOutOfSeats ? 'OPEN' : ride.status })
        .where(eq(rides.id, rideId));
    }

    const [withdrawn] = await tx
      .update(rideRequests)
      .set({ status: 'WITHDRAWN' })
      // Guarded on the two statuses the pre-check above allows, so a withdrawal that loses a
      // race to an accept or a decline writes nothing instead of overwriting the decision.
      .where(
        and(
          eq(rideRequests.id, requestId),
          inArray(rideRequests.status, ['PENDING', 'ACCEPTED']),
        ),
      )
      .returning({
        id: rideRequests.id,
        rideId: rideRequests.rideId,
        passengerId: rideRequests.passengerId,
        status: rideRequests.status,
      });

    if (!withdrawn) {
      throw CustomError.conflict(REQUEST_ALREADY_INACTIVE);
    }

    // Giving up a confirmed seat is news to the driver and frees one, so it is worth telling
    // them. A pending request quietly leaving the queue is neither, and does not notify.
    if (joinRequest.status === 'ACCEPTED') {
      await notifications.notifyPassengerWithdrew(ride, requestId, joinRequest.passengerId, tx);
    }

    return withdrawn;
  });
}
