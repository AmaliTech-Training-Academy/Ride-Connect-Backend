import { Router } from 'express';

import { createAvatarUpload, updateAvatar } from '../controllers/users.controller';
import {
  errorEnvelope,
  successEnvelope,
  validationErrorEnvelope,
} from '../lib/http/envelope.schema';
import { requireAuth } from '../middlewares/auth.middleware';
import { documentedRoute } from '../middlewares/documentedRoute.middleware';
import {
  avatarResponseSchema,
  avatarUploadRequestSchema,
  avatarUploadResponseSchema,
  updateAvatarSchema,
} from '../validators/users.validator';

export const usersRouter = Router();

const unauthorized = { description: 'No valid session', schema: errorEnvelope };

usersRouter.post(
  '/me/avatar/upload',
  requireAuth,
  documentedRoute({
    method: 'post',
    path: '/users/me/avatar/upload',
    tags: ['Users'],
    summary: 'Get a presigned form to upload a new avatar straight to storage',
    secured: true,
    body: avatarUploadRequestSchema,
    responses: {
      201: { description: 'Presigned upload form', schema: successEnvelope(avatarUploadResponseSchema) },
      400: { description: 'Unsupported image type', schema: validationErrorEnvelope },
      401: unauthorized,
    },
  }),
  createAvatarUpload,
);

usersRouter.put(
  '/me/avatar',
  requireAuth,
  documentedRoute({
    method: 'put',
    path: '/users/me/avatar',
    tags: ['Users'],
    summary: 'Save an uploaded image as your avatar',
    secured: true,
    body: updateAvatarSchema,
    responses: {
      200: { description: 'Avatar updated', schema: successEnvelope(avatarResponseSchema) },
      400: { description: 'Malformed key, or nothing was uploaded under it', schema: validationErrorEnvelope },
      401: unauthorized,
      403: { description: 'The upload belongs to another user', schema: errorEnvelope },
    },
  }),
  updateAvatar,
);
