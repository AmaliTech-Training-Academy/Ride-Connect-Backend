/**
 * In-app notifications: writing them as ride activity happens, and reading them back.
 *
 * Each `notify*` function is called from inside the service function that changes the state it
 * describes, and takes that caller's `exec` so the notification commits in the same transaction
 * as the change — a rolled-back seat change must not leave a notification behind.
 *
 * They take already-loaded ride data rather than re-querying it: `acceptRequest` and
 * `withdrawRequest` are already holding their ride row under `FOR UPDATE` when they call in.
 */
import { and, count, desc, eq, isNull } from 'drizzle-orm';

import { db, type Executor } from '../db';
import { notifications, notificationType, users } from '../db/schema';
import { CustomError } from '../lib/http/errors';
import type { ListNotificationsQuery } from '../validators/notifications.validator';

const NOTIFICATION_NOT_FOUND = 'Notification not found.';

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

/** Tells a Ride's Driver that a Passenger has asked again for a seat they were refused. */
export async function notifyRequestRerequested(
  ride: RideContext,
  requestId: string,
  passengerId: string,
  exec: Executor = db,
): Promise<void> {
  await insertNotifications(
    [rideNotification('RIDE_REQUEST_REREQUESTED', ride, ride.driverId, requestId, passengerId)],
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

/** The caller's feed, newest first, with the unread badge count alongside it. */
export async function listNotifications(userId: string, filters: ListNotificationsQuery) {
  const conditions = [eq(notifications.userId, userId)];

  if (filters.unreadOnly) {
    conditions.push(isNull(notifications.readAt));
  }

  const items = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      rideId: notifications.rideId,
      requestId: notifications.requestId,
      rideOrigin: notifications.rideOrigin,
      rideDestination: notifications.rideDestination,
      actorId: notifications.actorId,
      actorName: users.name,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    // Left join, not inner: the actor's account may since have been deleted, and the
    // notification has to survive that. Its name simply comes back null.
    .leftJoin(users, eq(notifications.actorId, users.id))
    .where(and(...conditions))
    // `id` breaks ties. A fan-out writes every row in one statement, and CURRENT_TIMESTAMP is
    // the transaction's start time, so those rows share a `created_at` to the microsecond.
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(filters.limit)
    .offset(filters.offset);

  // Deliberately unfiltered: the badge reflects everything unread, not just this page.
  return { items, unreadCount: await countUnread(userId) };
}

/** How many of the caller's notifications are still unread. */
export async function countUnread(userId: string, exec: Executor = db): Promise<number> {
  const [row] = await exec
    .select({ unreadCount: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

  return row?.unreadCount ?? 0;
}

/**
 * Marks one of the caller's notifications read.
 *
 * Idempotent: the update is guarded on `read_at IS NULL`, so re-reading an already-read
 * notification returns it untouched rather than erroring or pushing the timestamp forward.
 * Someone else's notification is a 404, not a 403 — the caller has no business learning that
 * the id exists at all.
 */
export async function markRead(notificationId: string, userId: string) {
  const [marked] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id, readAt: notifications.readAt });

  if (marked) {
    return marked;
  }

  // Nothing was written: it is either already read, or it is not the caller's to read.
  const [existing] = await db
    .select({ id: notifications.id, readAt: notifications.readAt })
    .from(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));

  if (!existing) {
    throw CustomError.notFound(NOTIFICATION_NOT_FOUND);
  }

  return existing;
}

/** Marks every unread notification the caller owns as read, reporting how many that was. */
export async function markAllRead(userId: string): Promise<{ markedCount: number }> {
  const marked = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });

  return { markedCount: marked.length };
}
