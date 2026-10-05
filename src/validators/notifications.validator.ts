import { z } from 'zod';

import { notificationType } from '../db/schema';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export const notificationIdParamsSchema = z.object({
  notificationId: z.uuid('Invalid notification id.'),
});

export type NotificationIdParams = z.infer<typeof notificationIdParamsSchema>;

/**
 * The notification feed's filters.
 *
 * `unreadOnly` is parsed from a string enum rather than `z.coerce.boolean()`, which would read
 * the query string `"false"` as truthy and silently filter the feed to unread only.
 */
export const listNotificationsSchema = z.object({
  limit: z.coerce
    .number('Limit must be a number.')
    .int('Limit must be a whole number.')
    .min(1, 'Limit must be at least 1.')
    .max(MAX_PAGE_SIZE, `Limit must be ${MAX_PAGE_SIZE} or fewer.`)
    .default(DEFAULT_PAGE_SIZE),
  offset: z.coerce
    .number('Offset must be a number.')
    .int('Offset must be a whole number.')
    .min(0, 'Offset cannot be negative.')
    .default(0),
  unreadOnly: z
    .enum(['true', 'false'], { error: 'Unread only must be true or false.' })
    .default('false')
    .transform((value) => value === 'true'),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsSchema>;

/**
 * A notification as its recipient sees it.
 *
 * Carries `type` and the ride references rather than a rendered sentence: the wording is the
 * client's to own. `rideId` and `requestId` are what a tap follows to the relevant ride.
 */
export const notificationSchema = z.object({
  id: z.uuid(),
  type: z.enum(notificationType.enumValues),
  rideId: z.uuid().nullable(),
  requestId: z.uuid().nullable(),
  rideOrigin: z.string().nullable(),
  rideDestination: z.string().nullable(),
  actorId: z.uuid().nullable(),
  actorName: z.string().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime().nullable(),
});

/** The feed plus the badge count, so rendering both never costs a second request. */
export const notificationListResponseSchema = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.number().int(),
});

/** The badge on its own, for polling without pulling the feed. */
export const unreadCountResponseSchema = z.object({
  unreadCount: z.number().int(),
});

/** What marking one notification read returns. */
export const notificationReadResponseSchema = z.object({
  id: z.uuid(),
  readAt: z.iso.datetime().nullable(),
});

/** What marking every notification read returns: zero when none were unread. */
export const notificationsReadResponseSchema = z.object({
  markedCount: z.number().int(),
});
