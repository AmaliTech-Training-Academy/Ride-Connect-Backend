import { randomUUID } from 'node:crypto';

import { DeleteObjectCommand, HeadObjectCommand, NotFound, S3Client } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';
import { db } from '../src/db';
import { users } from '../src/db/schema';
import { closeDb, resetAuthTables, uniqueEmail } from './helpers';

const app = createApp();

const VALID_PASSWORD = 'careful-horse-8';
const MEDIA_BASE_URL = 'https://media.example.com';

interface AuthedUser {
  cookie: string;
  userId: string;
}

async function registerUser(name: string): Promise<AuthedUser> {
  const email = uniqueEmail(name.toLowerCase().replace(/\s+/g, '-'));
  const response = await request(app)
    .post('/api/auth/sign-up/email')
    .send({ name, email, password: VALID_PASSWORD });

  const cookie = response.headers['set-cookie'];
  if (!cookie) {
    throw new Error('Sign-up did not return a session cookie.');
  }

  return {
    cookie: Array.isArray(cookie) ? cookie.join('; ') : cookie,
    userId: response.body.user.id,
  };
}

function avatarKey(userId: string, extension = 'png'): string {
  return `avatars/${userId}/${randomUUID()}.${extension}`;
}

function stubS3(options: { missing?: boolean; deleteFails?: boolean } = {}) {
  return vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
    if (command instanceof HeadObjectCommand && options.missing) {
      throw new NotFound({ message: 'NotFound', $metadata: { httpStatusCode: 404 } });
    }

    if (command instanceof DeleteObjectCommand && options.deleteFails) {
      throw new Error('S3 is unavailable');
    }

    return {};
  });
}

function deletedKeys(send: ReturnType<typeof stubS3>): string[] {
  return send.mock.calls
    .map(([command]) => command)
    .filter((command): command is DeleteObjectCommand => command instanceof DeleteObjectCommand)
    .map((command) => command.input.Key ?? '');
}

async function storedImage(userId: string): Promise<string | null> {
  const [user] = await db.select({ image: users.image }).from(users).where(eq(users.id, userId));
  return user?.image ?? null;
}

function saveAvatar(user: AuthedUser, key: string) {
  return request(app).put('/api/users/me/avatar').set('Cookie', user.cookie).send({ key });
}

beforeEach(async () => {
  await resetAuthTables();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeDb();
});

describe('POST /users/me/avatar/upload', () => {
  it('returns a presigned form for a key under the caller', async () => {
    const user = await registerUser('Ada Lovelace');

    const response = await request(app)
      .post('/api/users/me/avatar/upload')
      .set('Cookie', user.cookie)
      .send({ contentType: 'image/jpeg' });

    expect(response.status).toBe(201);
    expect(response.body.data.key).toMatch(new RegExp(`^avatars/${user.userId}/[0-9a-f-]{36}\\.jpg$`));
    expect(response.body.data.fields.key).toBe(response.body.data.key);
    expect(response.body.data.fields['Content-Type']).toBe('image/jpeg');
    expect(response.body.data.fields.Policy).toEqual(expect.any(String));
    expect(response.body.data.maxBytes).toBe(5 * 1024 * 1024);
    expect(response.body.data.expiresIn).toBe(300);
  });

  it('rejects an unsupported image type', async () => {
    const user = await registerUser('Ada Lovelace');

    const response = await request(app)
      .post('/api/users/me/avatar/upload')
      .set('Cookie', user.cookie)
      .send({ contentType: 'image/gif' });

    expect(response.status).toBe(400);
  });

  it('requires a session', async () => {
    const response = await request(app).post('/api/users/me/avatar/upload').send({ contentType: 'image/png' });

    expect(response.status).toBe(401);
  });
});

describe('PUT /users/me/avatar', () => {
  it('saves the public url of the upload and returns it in the session', async () => {
    stubS3();
    const user = await registerUser('Ada Lovelace');
    const key = avatarKey(user.userId);

    const response = await saveAvatar(user, key);

    expect(response.status).toBe(200);
    expect(response.body.data.image).toBe(`${MEDIA_BASE_URL}/${key}`);
    expect(await storedImage(user.userId)).toBe(`${MEDIA_BASE_URL}/${key}`);

    const session = await request(app).get('/api/auth/get-session').set('Cookie', user.cookie);
    expect(session.body.user.image).toBe(`${MEDIA_BASE_URL}/${key}`);
  });

  it('deletes the avatar it replaces', async () => {
    const send = stubS3();
    const user = await registerUser('Ada Lovelace');
    const first = avatarKey(user.userId);
    const second = avatarKey(user.userId, 'webp');

    await saveAvatar(user, first);
    const response = await saveAvatar(user, second);

    expect(response.status).toBe(200);
    expect(deletedKeys(send)).toEqual([first]);
  });

  it('leaves an image hosted elsewhere alone when replacing it', async () => {
    const send = stubS3();
    const user = await registerUser('Ada Lovelace');
    await db
      .update(users)
      .set({ image: 'https://res.cloudinary.com/demo/image/upload/ada.png' })
      .where(eq(users.id, user.userId));

    const response = await saveAvatar(user, avatarKey(user.userId));

    expect(response.status).toBe(200);
    expect(deletedKeys(send)).toEqual([]);
  });

  it('still saves the avatar when the old one cannot be deleted', async () => {
    stubS3();
    const user = await registerUser('Ada Lovelace');
    await saveAvatar(user, avatarKey(user.userId));
    vi.restoreAllMocks();
    stubS3({ deleteFails: true });
    const key = avatarKey(user.userId);

    const response = await saveAvatar(user, key);

    expect(response.status).toBe(200);
    expect(await storedImage(user.userId)).toBe(`${MEDIA_BASE_URL}/${key}`);
  });

  it("refuses another user's upload", async () => {
    stubS3();
    const user = await registerUser('Ada Lovelace');
    const other = await registerUser('Grace Hopper');

    const response = await saveAvatar(user, avatarKey(other.userId));

    expect(response.status).toBe(403);
    expect(await storedImage(user.userId)).toBeNull();
  });

  it('refuses a key nothing was uploaded under', async () => {
    stubS3({ missing: true });
    const user = await registerUser('Ada Lovelace');

    const response = await saveAvatar(user, avatarKey(user.userId));

    expect(response.status).toBe(400);
    expect(await storedImage(user.userId)).toBeNull();
  });

  it('rejects a malformed key', async () => {
    const user = await registerUser('Ada Lovelace');

    const response = await saveAvatar(user, `avatars/${user.userId}/../x.png`);

    expect(response.status).toBe(400);
  });

  it('requires a session', async () => {
    const response = await request(app)
      .put('/api/users/me/avatar')
      .send({ key: avatarKey(randomUUID()) });

    expect(response.status).toBe(401);
  });
});
