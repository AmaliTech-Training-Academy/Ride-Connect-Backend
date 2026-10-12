import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import {
  ALLOWED_EMAIL_DOMAINS,
  auth,
  EMAIL_DOMAIN_NOT_ALLOWED_CODE,
  EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE,
} from '../src/auth/auth.config';
import { db } from '../src/db';
import { users } from '../src/db/schema';
import { closeDb, resetAuthTables, uniqueEmail } from './helpers';

const app = createApp();

const VALID_PASSWORD = 'careful-horse-8';

/** Read from the auth config rather than restated, so the boundary cases follow it. */
const MIN_PASSWORD_LENGTH = auth.options.emailAndPassword?.minPasswordLength ?? 8;

const ALLOWED_DOMAIN = ALLOWED_EMAIL_DOMAINS[0]!;

/** `.invalid` is reserved by RFC 2606 and can never be a configured domain. */
const DISALLOWED_DOMAIN = 'notamalitech.invalid';

function signUp(email: string, password: string = VALID_PASSWORD) {
  return request(app)
    .post('/api/auth/sign-up/email')
    .send({ name: 'Grace Hopper', email, password });
}

function signIn(email: string, password: string) {
  return request(app).post('/api/auth/sign-in/email').send({ email, password });
}

function usersWithEmail(email: string) {
  return db.select().from(users).where(eq(users.email, email));
}

beforeEach(async () => {
  await resetAuthTables();
});

afterAll(async () => {
  await closeDb();
});

describe('AC1: duplicate email at sign-up', () => {
  it("AC1: a duplicate email returns an 'already exists' error and creates no second user", async () => {
    const email = uniqueEmail('duplicate');
    expect((await signUp(email)).status).toBe(200);

    const response = await signUp(email);

    // better-auth answers 422 UNPROCESSABLE_ENTITY rather than the 409 the criterion assumed.
    expect(response.status).toBe(422);
    expect(response.body.message).toMatch(/already exists/i);
    expect(await usersWithEmail(email)).toHaveLength(1);
  });

  it("AC1: a differently-cased duplicate returns the same 'already exists' error", async () => {
    const email = uniqueEmail('cased-duplicate');
    expect((await signUp(email)).status).toBe(200);

    const response = await signUp(email.toUpperCase());

    expect(response.status).toBe(422);
    expect(response.body.message).toMatch(/already exists/i);
    expect(await usersWithEmail(email)).toHaveLength(1);
  });
});

describe('AC2: sign-in failures do not reveal whether an account exists', () => {
  it('AC2: a wrong password returns 401 with exactly "Invalid email or password"', async () => {
    const email = uniqueEmail('wrong-password');
    expect((await signUp(email)).status).toBe(200);

    const response = await signIn(email, 'not-the-password');

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid email or password');
  });

  it('AC2: an unknown email returns 401 with exactly "Invalid email or password"', async () => {
    const response = await signIn(uniqueEmail('unknown-account'), VALID_PASSWORD);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid email or password');
  });

  it('AC2: the unknown-email response is identical to the wrong-password response', async () => {
    const email = uniqueEmail('indistinguishable');
    expect((await signUp(email)).status).toBe(200);

    const wrongPassword = await signIn(email, 'not-the-password');
    const unknownEmail = await signIn(uniqueEmail('indistinguishable-unknown'), VALID_PASSWORD);

    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body).toStrictEqual(wrongPassword.body);
    expect(unknownEmail.headers['content-type']).toBe(wrongPassword.headers['content-type']);
  });
});

describe('AC3: password length at sign-up', () => {
  it('AC3: the configured minimum is the 8 characters the criterion names', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it.each([
    ['an empty password', ''],
    ['a one-character password', 'a'],
    ['a password one character under the minimum', 'a'.repeat(MIN_PASSWORD_LENGTH - 1)],
  ])('AC3: rejects %s and creates no user', async (_label, password) => {
    const email = uniqueEmail('short-password');

    const response = await signUp(email, password);

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/password/i);
    expect(await usersWithEmail(email)).toHaveLength(0);
  });

  it.each([
    ['a password exactly at the minimum', 'a'.repeat(MIN_PASSWORD_LENGTH)],
    ['a password over the minimum', 'a'.repeat(MIN_PASSWORD_LENGTH + 4)],
  ])('AC3: accepts %s', async (_label, password) => {
    const email = uniqueEmail('long-enough-password');

    const response = await signUp(email, password);

    expect(response.status).toBe(200);
    expect(await usersWithEmail(email)).toHaveLength(1);
  });
});

describe('AC4: email domain restriction', () => {
  it('AC4: the disallowed domain is genuinely outside the configured allowlist', () => {
    expect(ALLOWED_EMAIL_DOMAINS).toContain(ALLOWED_DOMAIN);
    expect(ALLOWED_EMAIL_DOMAINS).not.toContain(DISALLOWED_DOMAIN);
  });

  it('AC4: a disallowed domain is rejected with the documented error and creates no user', async () => {
    const email = `intruder@${DISALLOWED_DOMAIN}`;

    const response = await signUp(email);

    expect(response.status).toBe(403);
    expect(response.body).toStrictEqual({
      code: EMAIL_DOMAIN_NOT_ALLOWED_CODE,
      message: EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE,
    });
    expect(await usersWithEmail(email)).toHaveLength(0);
  });

  it('AC4: a disallowed domain in mixed case is rejected too', async () => {
    const email = `intruder@${DISALLOWED_DOMAIN.toUpperCase()}`;

    const response = await signUp(email);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(EMAIL_DOMAIN_NOT_ALLOWED_CODE);
    expect(await usersWithEmail(email)).toHaveLength(0);
  });

  it('AC4: an allowed domain still signs up', async () => {
    const email = uniqueEmail('allowed-domain');

    const response = await signUp(email);

    expect(response.status).toBe(200);
    expect(await usersWithEmail(email)).toHaveLength(1);
  });

  it('AC4: an allowed domain in mixed case signs up and is stored lowercased', async () => {
    const email = uniqueEmail('mixed-case-domain').replace(
      `@${ALLOWED_DOMAIN}`,
      `@${ALLOWED_DOMAIN.toUpperCase()}`
    );

    const response = await signUp(email);

    expect(response.status).toBe(200);
    expect(await usersWithEmail(email.toLowerCase())).toHaveLength(1);
  });
});
