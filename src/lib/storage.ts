import { randomUUID } from 'node:crypto';

import { DeleteObjectCommand, HeadObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

import { env } from '../config/env';

export const AVATAR_CONTENT_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type AvatarContentType = keyof typeof AVATAR_CONTENT_TYPES;

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export const AVATAR_UPLOAD_EXPIRES_SECONDS = 300;

const s3 = new S3Client({ region: env.AWS_REGION });

export function avatarKeyPrefix(userId: string): string {
  return `avatars/${userId}/`;
}

export function publicUrl(key: string): string {
  return `${env.MEDIA_BASE_URL}/${key}`;
}

export function keyFromPublicUrl(url: string | null | undefined): string | null {
  const prefix = `${env.MEDIA_BASE_URL}/`;

  if (!url?.startsWith(prefix)) {
    return null;
  }

  return url.slice(prefix.length) || null;
}

export async function createAvatarUpload(userId: string, contentType: AvatarContentType) {
  const key = `${avatarKeyPrefix(userId)}${randomUUID()}.${AVATAR_CONTENT_TYPES[contentType]}`;

  const { url, fields } = await createPresignedPost(s3, {
    Bucket: env.S3_BUCKET,
    Key: key,
    Conditions: [
      ['content-length-range', 1, AVATAR_MAX_BYTES],
      ['eq', '$Content-Type', contentType],
    ],
    Fields: { 'Content-Type': contentType },
    Expires: AVATAR_UPLOAD_EXPIRES_SECONDS,
  });

  return { url, fields, key };
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return true;
  } catch (error) {
    if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
      return false;
    }

    throw error;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}
