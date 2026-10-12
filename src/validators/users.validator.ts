import { z } from 'zod';

import { AVATAR_CONTENT_TYPES, type AvatarContentType } from '../lib/storage';

const AVATAR_KEY = /^avatars\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

export const avatarUploadRequestSchema = z.object({
  contentType: z.enum(Object.keys(AVATAR_CONTENT_TYPES) as [AvatarContentType, ...AvatarContentType[]], {
    error: 'Image must be a JPEG, PNG, or WebP file.',
  }),
});

export type AvatarUploadRequest = z.infer<typeof avatarUploadRequestSchema>;

export const avatarUploadResponseSchema = z.object({
  url: z.url(),
  fields: z.record(z.string(), z.string()),
  key: z.string(),
  maxBytes: z.number().int(),
  expiresIn: z.number().int(),
});

export const updateAvatarSchema = z.object({
  key: z.string('Key is required.').regex(AVATAR_KEY, 'Key is not a valid avatar upload.'),
});

export type UpdateAvatarInput = z.infer<typeof updateAvatarSchema>;

export const avatarResponseSchema = z.object({
  image: z.url(),
});
