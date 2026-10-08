import { DeleteObjectCommand, HeadObjectCommand, NotFound, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AVATAR_MAX_BYTES,
  createAvatarUpload,
  deleteObject,
  keyFromPublicUrl,
  objectExists,
  publicUrl,
} from './storage';

const USER_ID = '7d1f0f8e-5d55-4c4e-9a43-1f1f6f0c2b11';

function decodePolicy(fields: Record<string, string>) {
  return JSON.parse(Buffer.from(fields.Policy ?? '', 'base64').toString('utf8')) as {
    conditions: unknown[];
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('publicUrl', () => {
  it('joins the media base url and the key', () => {
    expect(publicUrl('avatars/u/a.png')).toBe('https://media.example.com/avatars/u/a.png');
  });
});

describe('keyFromPublicUrl', () => {
  it('returns the key of a url under the media base url', () => {
    expect(keyFromPublicUrl('https://media.example.com/avatars/u/a.png')).toBe('avatars/u/a.png');
  });

  it('returns null for a url hosted elsewhere', () => {
    expect(keyFromPublicUrl('https://res.cloudinary.com/demo/image/upload/a.png')).toBeNull();
  });

  it('returns null for a missing url', () => {
    expect(keyFromPublicUrl(null)).toBeNull();
    expect(keyFromPublicUrl(undefined)).toBeNull();
  });

  it('returns null for the bare base url', () => {
    expect(keyFromPublicUrl('https://media.example.com/')).toBeNull();
  });
});

describe('createAvatarUpload', () => {
  it('signs a post for a fresh key under the user prefix with the matching extension', async () => {
    const upload = await createAvatarUpload(USER_ID, 'image/webp');

    expect(upload.key).toMatch(new RegExp(`^avatars/${USER_ID}/[0-9a-f-]{36}\\.webp$`));
    expect(upload.url).toContain('ride-connect-avatars-test');
    expect(upload.fields.key).toBe(upload.key);
    expect(upload.fields['Content-Type']).toBe('image/webp');
  });

  it('limits the size and pins the content type in the policy', async () => {
    const upload = await createAvatarUpload(USER_ID, 'image/png');
    const { conditions } = decodePolicy(upload.fields);

    expect(conditions).toContainEqual(['content-length-range', 1, AVATAR_MAX_BYTES]);
    expect(conditions).toContainEqual(['eq', '$Content-Type', 'image/png']);
    expect(conditions).toContainEqual({ key: upload.key });
  });

  it('issues a different key on every call', async () => {
    const first = await createAvatarUpload(USER_ID, 'image/jpeg');
    const second = await createAvatarUpload(USER_ID, 'image/jpeg');

    expect(first.key).not.toBe(second.key);
  });
});

describe('objectExists', () => {
  it('is true when the head request succeeds', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);

    await expect(objectExists('avatars/u/a.png')).resolves.toBe(true);
    expect(send.mock.lastCall?.[0]).toBeInstanceOf(HeadObjectCommand);
  });

  it('is false when the object is missing', async () => {
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(
      new NotFound({ message: 'NotFound', $metadata: { httpStatusCode: 404 } }) as never,
    );

    await expect(objectExists('avatars/u/a.png')).resolves.toBe(false);
  });

  it('rethrows any other failure', async () => {
    const denied = new S3ServiceException({
      name: 'AccessDenied',
      $fault: 'client',
      $metadata: { httpStatusCode: 403 },
    });
    vi.spyOn(S3Client.prototype, 'send').mockRejectedValue(denied as never);

    await expect(objectExists('avatars/u/a.png')).rejects.toBe(denied);
  });
});

describe('deleteObject', () => {
  it('sends a delete for the key', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);

    await deleteObject('avatars/u/a.png');

    const command = send.mock.lastCall?.[0] as DeleteObjectCommand;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({ Bucket: 'ride-connect-avatars-test', Key: 'avatars/u/a.png' });
  });
});
