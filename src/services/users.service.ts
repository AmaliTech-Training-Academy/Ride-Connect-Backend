import { eq } from 'drizzle-orm';

import { db } from '../db';
import { users } from '../db/schema';
import { CustomError } from '../lib/http/errors';
import { logger } from '../lib/logger';
import * as storage from '../lib/storage';

const AVATAR_KEY_NOT_YOURS = 'This upload does not belong to you.';
const AVATAR_UPLOAD_MISSING = 'No uploaded image was found for this key. Upload the file before saving it.';
const USER_NOT_FOUND = 'User not found.';

export async function createAvatarUpload(userId: string, contentType: storage.AvatarContentType) {
  const upload = await storage.createAvatarUpload(userId, contentType);

  return {
    ...upload,
    maxBytes: storage.AVATAR_MAX_BYTES,
    expiresIn: storage.AVATAR_UPLOAD_EXPIRES_SECONDS,
  };
}

export async function setAvatar(userId: string, key: string) {
  if (!key.startsWith(storage.avatarKeyPrefix(userId))) {
    throw CustomError.forbidden(AVATAR_KEY_NOT_YOURS);
  }

  if (!(await storage.objectExists(key))) {
    throw CustomError.badRequest(AVATAR_UPLOAD_MISSING);
  }

  const image = storage.publicUrl(key);

  const previousImage = await db.transaction(async (tx) => {
    const [user] = await tx.select({ image: users.image }).from(users).where(eq(users.id, userId)).for('update');

    if (!user) {
      throw CustomError.notFound(USER_NOT_FOUND);
    }

    await tx.update(users).set({ image, updatedAt: new Date() }).where(eq(users.id, userId));

    return user.image;
  });

  const previousKey = storage.keyFromPublicUrl(previousImage);

  if (previousKey && previousKey !== key) {
    await storage.deleteObject(previousKey).catch((error: unknown) => {
      logger.warn(`[users] Could not delete replaced avatar "${previousKey}"`, error);
    });
  }

  return { image };
}
