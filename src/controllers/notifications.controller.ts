import { authedController } from '../lib/http/controller';
import * as notificationsService from '../services/notifications.service';
import type {
  ListNotificationsQuery,
  NotificationIdParams,
} from '../validators/notifications.validator';

const NOTIFICATIONS_FETCHED = 'Notifications fetched successfully';
const NO_NOTIFICATIONS = 'You have no notifications.';
const UNREAD_COUNT_FETCHED = 'Unread notification count fetched successfully';
const NOTIFICATION_MARKED_READ = 'Notification marked as read';
const ALL_NOTIFICATIONS_MARKED_READ = 'All notifications marked as read';

/**
 * GET /api/notifications — the caller's own notification feed, newest first, carrying the
 * unread count so the badge and the list render from one response.
 */
export const listNotifications = authedController<{ query: ListNotificationsQuery }>(
  async (req, res) => {
    const { items, unreadCount } = await notificationsService.listNotifications(
      req.auth.user.id,
      req.validated.query,
    );

    res.customSuccess({
      message: items.length === 0 ? NO_NOTIFICATIONS : NOTIFICATIONS_FETCHED,
      data: { items, unreadCount },
    });
  },
);

/** GET /api/notifications/unread-count — the badge on its own, for polling. */
export const getUnreadCount = authedController(async (req, res) => {
  const unreadCount = await notificationsService.countUnread(req.auth.user.id);

  res.customSuccess({
    message: UNREAD_COUNT_FETCHED,
    data: { unreadCount },
  });
});

/** PATCH /api/notifications/:notificationId/read — marks one of the caller's notifications read. */
export const markNotificationRead = authedController<{ params: NotificationIdParams }>(
  async (req, res) => {
    const notification = await notificationsService.markRead(
      req.validated.params.notificationId,
      req.auth.user.id,
    );

    res.customSuccess({
      message: NOTIFICATION_MARKED_READ,
      data: notification,
    });
  },
);

/** PATCH /api/notifications/read-all — marks every unread notification the caller owns as read. */
export const markAllNotificationsRead = authedController(async (req, res) => {
  const { markedCount } = await notificationsService.markAllRead(req.auth.user.id);

  res.customSuccess({
    message: ALL_NOTIFICATIONS_MARKED_READ,
    data: { markedCount },
  });
});
