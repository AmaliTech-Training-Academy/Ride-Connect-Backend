import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import {
  NAME_REQUIRED_CODE,
  NAME_REQUIRED_MESSAGE,
  isUsableName,
} from '../src/auth/auth.config';
import { db } from '../src/db';
import { account, session, users } from '../src/db/schema';
import { closeDb, resetAuthTables, uniqueEmail } from './helpers';

const app = createApp();

const VALID_PASSWORD = 'careful-horse-8';

/** Signs up straight at the auth handler, the way a client skipping the frontend would. */
function signUp(name: unknown, email: string = uniqueEmail('name')) {
  return request(app)
    .post('/api/auth/sign-up/email')
    .send({ name, email, password: VALID_PASSWORD });
}

async function findUser(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}

beforeEach(async () => {
  await resetAuthTables();
});

afterAll(async () => {
  await closeDb();
});

describe('isUsableName', () => {
  it.each([
    ['an empty string', ''],
    ['a single space', ' '],
    ['several spaces', '   '],
    ['a tab and a newline', '\t\n'],
    ['newlines wrapped in spaces', '\n \t '],
    ['a non-string', 123],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_label, name) => {
    expect(isUsableName(name)).toBe(false);
  });

  it.each([
    ['a bare name', 'Ada'],
    ['a name padded with spaces', '  Ada Lovelace  '],
    ['a single non-space character', '.'],
  ])('accepts %s', (_label, name) => {
    expect(isUsableName(name)).toBe(true);
  });
});

describe('POST /api/auth/sign-up/email — name is required', () => {
  it.each([
    ['an empty name', ''],
    ['a whitespace-only name', '   '],
    ['a tab-and-newline name', '\t\n'],
    ['a name of newlines wrapped in spaces', '\n \t '],
  ])('BE-08: rejects %s with a 4xx and writes nothing', async (_label, name) => {
    const email = uniqueEmail('blank-name');

    const response = await signUp(name, email);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(response.body).toMatchObject({
      code: NAME_REQUIRED_CODE,
      message: NAME_REQUIRED_MESSAGE,
    });
    expect(response.body.stack).toBeUndefined();

    expect(await findUser(email)).toBeUndefined();
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await db.select().from(session)).toHaveLength(0);
    expect(await db.select().from(account)).toHaveLength(0);
  });

  it('BE-08: a valid name still signs up', async () => {
    const email = uniqueEmail('valid-name');

    const response = await signUp('Ada Lovelace', email);

    expect(response.status).toBe(200);
    expect((await findUser(email))?.name).toBe('Ada Lovelace');
  });

  it('BE-08: a padded name with real content is accepted and stored exactly as sent', async () => {
    const email = uniqueEmail('padded-name');

    const response = await signUp('  Ada Lovelace  ', email);

    expect(response.status).toBe(200);
    expect((await findUser(email))?.name).toBe('  Ada Lovelace  ');
  });

  it('BE-08: a non-string name is rejected as well', async () => {
    const email = uniqueEmail('non-string-name');

    const response = await signUp(42, email);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(response.body.message).toMatch(/name/i);
    expect(await findUser(email)).toBeUndefined();
  });

  it('BE-08: a request failing both the name and the domain check is still rejected', async () => {
    const email = 'intruder@notamalitech.invalid';

    const response = await signUp('   ', email);

    // Which of the two checks reports the failure is deliberately left unasserted.
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(await findUser(email)).toBeUndefined();
    expect(await db.select().from(account)).toHaveLength(0);
  });
});
