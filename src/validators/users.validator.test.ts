import { describe, expect, it } from 'vitest';

import { avatarUploadRequestSchema, updateAvatarSchema } from './users.validator';

const USER_ID = '7d1f0f8e-5d55-4c4e-9a43-1f1f6f0c2b11';
const FILE_ID = 'c3a8f0de-2b1e-4f5a-9d6c-0e7b8a9f1c2d';

describe('avatarUploadRequestSchema', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (contentType) => {
    expect(avatarUploadRequestSchema.safeParse({ contentType }).success).toBe(true);
  });

  it.each(['image/gif', 'image/svg+xml', 'application/pdf', ''])('rejects %s', (contentType) => {
    const result = avatarUploadRequestSchema.safeParse({ contentType });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Image must be a JPEG, PNG, or WebP file.');
  });
});

describe('updateAvatarSchema', () => {
  it('accepts a key issued for an avatar upload', () => {
    expect(updateAvatarSchema.safeParse({ key: `avatars/${USER_ID}/${FILE_ID}.webp` }).success).toBe(true);
  });

  it.each([
    `avatars/${USER_ID}/../${FILE_ID}.png`,
    `avatars/${USER_ID}/${FILE_ID}.gif`,
    `other/${USER_ID}/${FILE_ID}.png`,
    `avatars/${USER_ID}/${FILE_ID}.png?x=1`,
    'https://res.cloudinary.com/demo/image/upload/a.png',
  ])('rejects %s', (key) => {
    expect(updateAvatarSchema.safeParse({ key }).success).toBe(false);
  });

  it('rejects a missing key', () => {
    expect(updateAvatarSchema.safeParse({}).success).toBe(false);
  });
});
