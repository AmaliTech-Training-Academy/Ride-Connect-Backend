import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { db } from '../src/db';
import { account, session, users } from '../src/db/schema';
import { closeDb, resetAuthTables, uniqueEmail } from './helpers';

const app = createApp();

const VALID_PASSWORD = 'careful-horse-8';

/** Signs up straight at the auth handler, the way a client skipping the frontend would. */
function signUp(email: string, name = 'Grace Hopper') {
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

describe('POST /api/auth/sign-up/email — domain allowlist', () => {
  it('registers an @amalitech.com address', async () => {
    const email = uniqueEmail('allowed');

    const response = await signUp(email);

    expect(response.status).toBe(200);
    expect(response.headers['set-cookie']).toBeDefined();
    expect(await findUser(email)).toBeDefined();
  });

  it('accepts an @amalitech.com address in mixed casing', async () => {
    const email = uniqueEmail('cased').replace('@amalitech.com', '@AmaliTech.COM');

    const response = await signUp(email);

    expect(response.status).toBe(200);
    expect(await findUser(email.toLowerCase())).toBeDefined();
  });

  it('registers an @amalitechtraining.org address', async () => {
    const email = uniqueEmail('allowed').replace('@amalitech.com', '@amalitechtraining.org');

    const response = await signUp(email);

    expect(response.status).toBe(200);
    expect(await findUser(email)).toBeDefined();
  });

  it.each([
    ['another provider', 'intruder@gmail.com'],
    ['the amalitech.org sibling', 'intruder@amalitech.org'],
    ['a subdomain', 'intruder@sub.amalitech.com'],
    ['a training subdomain', 'intruder@sub.amalitechtraining.org'],
    ['a suffixed look-alike', 'intruder@amalitech.com.evil.com'],
    ['a prefixed look-alike', 'intruder@notamalitech.com'],
    ['a look-alike of the training domain', 'intruder@amalitechtraining.org.evil.com'],
  ])('rejects %s with a 4xx and writes nothing', async (_label, email) => {
    const response = await signUp(email);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(response.body).toMatchObject({ code: 'EMAIL_DOMAIN_NOT_ALLOWED' });
    expect(response.body.message).toContain('@amalitech.com');
    expect(response.body.message).not.toContain('intruder@');
    expect(response.body.stack).toBeUndefined();

    expect(await findUser(email)).toBeUndefined();
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(await db.select().from(session)).toHaveLength(0);
  });

  it('leaves no account row behind for a rejected sign-up', async () => {
    await signUp('intruder@gmail.com');

    expect(await db.select().from(account)).toHaveLength(0);
  });

  it('still signs an existing @amalitech.com user in', async () => {
    const email = uniqueEmail('returning');
    expect((await signUp(email)).status).toBe(200);

    const response = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email, password: VALID_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(email);
  });

  it('still signs in a pre-existing user whose domain is no longer allowed', async () => {
    const email = uniqueEmail('legacy');
    expect((await signUp(email)).status).toBe(200);

    // Stands in for a row written before the rule existed.
    const legacyEmail = 'legacy-user@example.com';
    await db.update(users).set({ email: legacyEmail }).where(eq(users.email, email));

    const response = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email: legacyEmail, password: VALID_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(legacyEmail);
  });
});
