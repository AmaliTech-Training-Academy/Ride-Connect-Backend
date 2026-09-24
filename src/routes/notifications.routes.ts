import { Router } from 'express';

import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../controllers/notifications.controller';
import {
  errorEnvelope,
  successEnvelope,
  validationErrorEnvelope,
} from '../lib/http/envelope.schema';
import { requireAuth } from '../middlewares/auth.middleware';
import { documentedRoute } from '../middlewares/documentedRoute.middleware';
import {
  listNotificationsSchema,
  notificationIdParamsSchema,
  notificationListResponseSchema,
  notificationReadResponseSchema,
  notificationsReadResponseSchema,
  unreadCountResponseSchema,
} from '../validators/notifications.validator';

export const notificationsRouter = Router();

const unauthorized = { description: 'No valid session', schema: errorEnvelope };
const invalidParams = { description: 'Malformed id in the path', schema: validationErrorEnvelope };

// Registered before the `:notificationId` routes so neither static segment is read as an id.
notificationsRouter.get(
  '/unread-count',
  requireAuth,
  documentedRoute({
    method: 'get',
    path: '/notifications/unread-count',
    tags: ['Notifications'],
    summary: 'Count your unread notifications',
    secured: true,
    responses: {
      200: {
        description: 'Unread notification count',
        schema: successEnvelope(unreadCountResponseSchema),
      },
      401: unauthorized,
    },
  }),
  getUnreadCount,
);

notificationsRouter.patch(
  '/read-all',
  requireAuth,
  documentedRoute({
    method: 'patch',
    path: '/notifications/read-all',
    tags: ['Notifications'],
    summary: 'Mark all of your notifications as read',
    secured: true,
    responses: {
      200: {
        description: 'Notifications marked as read',
        schema: successEnvelope(notificationsReadResponseSchema),
      },
      401: unauthorized,
    },
  }),
  markAllNotificationsRead,
);

notificationsRouter.get(
  '/',
  requireAuth,
  documentedRoute({
    method: 'get',
    path: '/notifications',
    tags: ['Notifications'],
    summary: 'List your notifications, newest first',
    secured: true,
    query: listNotificationsSchema,
    responses: {
      200: {
        description: 'Your notifications and your unread count',
        schema: successEnvelope(notificationListResponseSchema),
      },
      400: { description: 'Malformed filter', schema: validationErrorEnvelope },
      401: unauthorized,
    },
  }),
  listNotifications,
);

notificationsRouter.patch(
  '/:notificationId/read',
  requireAuth,
  documentedRoute({
    method: 'patch',
    path: '/notifications/:notificationId/read',
    tags: ['Notifications'],
    summary: 'Mark one of your notifications as read',
    secured: true,
    params: notificationIdParamsSchema,
    responses: {
      200: {
        description: 'Notification marked as read',
        schema: successEnvelope(notificationReadResponseSchema),
      },
      400: invalidParams,
      401: unauthorized,
      404: { description: 'No such notification, or it is not yours', schema: errorEnvelope },
    },
  }),
  markNotificationRead,
);
