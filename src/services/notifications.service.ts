/**
 * In-app notification writes.
 *
 * Each `notify*` function is called from inside the service function that changes the state it
 * describes, and takes that caller's `exec` so the notification commits in the same transaction
 * as the change — a rolled-back seat change must not leave a notification behind.
 *
 * They take already-loaded ride data rather than re-querying it: `acceptRequest` and
 * `withdrawRequest` are already holding their ride row under `FOR UPDATE` when they call in.
 */
import { db, type Executor } from '../db';
import { notifications, notificationType } from '../db/schema';

/** A notification's event, as named from the recipient's point of view. */
export type NotificationType = (typeof notificationType.enumValues)[number];

/** The ride a notification is about, in the shape its callers already have loaded. */
export interface RideContext {
  id: string;
  driverId: string;
  origin: string;
  destination: string;
}

type NewNotification = typeof notifications.$inferInsert;

/** Writes a batch of notifications in one statement, or does nothing when the batch is empty. */
async function insertNotifications(rows: NewNotification[], exec: Executor): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  await exec.insert(notifications).values(rows);
}

/** A notification about one request on one ride: the shape four of the six events share. */
function rideNotification(
  type: NotificationType,
  ride: RideContext,
  recipientId: string,
  requestId: string,
  actorId: string,
): NewNotification {
  return {
    userId: recipientId,
    type,
    rideId: ride.id,
    requestId,
    actorId,
    rideOrigin: ride.origin,
    rideDestination: ride.destination,
  };
}

/** Tells a Ride's Driver that a Passenger has asked to join it. */
export async function notifyRequestReceived(
  ride: RideContext,
  requestId: string,
  passengerId: string,
  exec: Executor = db,
): Promise<void> {
  await insertNotifications(
    [rideNotification('RIDE_REQUEST_RECEIVED', ride, ride.driverId, requestId, passengerId)],
    exec,
  );
}

/** Tells a Passenger that the Driver accepted their request. */
export async function notifyRequestAccepted(
  ride: RideContext,
  requestId: string,
  passengerId: string,
  exec: Executor = db,
): Promise<void> {
  await insertNotifications(
    [rideNotification('REQUEST_ACCEPTED', ride, passengerId, requestId, ride.driverId)],
    exec,
  );
}

/** Tells a Passenger that the Driver declined their request. */
export async function notifyRequestDeclined(
  ride: RideContext,
  requestId: string,
  passengerId: string,
  exec: Executor = db,
): Promise<void> {
  await insertNotifications(
    [rideNotification('REQUEST_DECLINED', ride, passengerId, requestId, ride.driverId)],
    exec,
  );
}

/** Tells a Ride's Driver that a confirmed Passenger has given up their seat. */
export async function notifyPassengerWithdrew(
  ride: RideContext,
  requestId: string,
  passengerId: string,
  exec: Executor = db,
): Promise<void> {
  await insertNotifications(
    [rideNotification('PASSENGER_WITHDREW', ride, ride.driverId, requestId, passengerId)],
    exec,
  );
}

/**
 * Tells everyone still waiting on a seat, or holding one, that the Ride is off.
 *
 * One multi-row insert rather than a write per passenger, so the whole fan-out lands or none
 * of it does.
 */
export async function notifyRideCancelled(
  ride: RideContext,
  passengerIds: string[],
  exec: Executor = db,
): Promise<void> {
  await insertNotifications(
    passengerIds.map((passengerId) => ({
      userId: passengerId,
      type: 'RIDE_CANCELLED' as const,
      rideId: ride.id,
      actorId: ride.driverId,
      rideOrigin: ride.origin,
      rideDestination: ride.destination,
    })),
    exec,
  );
}

/**
 * Tells a Ride's confirmed Passengers that the Driver changed something that affects them.
 *
 * The notification carries the ride's current route rather than a description of the change;
 * the passenger reads the ride itself for the detail.
 */
export async function notifyRideUpdated(
  ride: RideContext,
  passengerIds: string[],
  exec: Executor = db,
): Promise<void> {
  await insertNotifications(
    passengerIds.map((passengerId) => ({
      userId: passengerId,
      type: 'RIDE_UPDATED' as const,
      rideId: ride.id,
      actorId: ride.driverId,
      rideOrigin: ride.origin,
      rideDestination: ride.destination,
    })),
    exec,
  );
}
