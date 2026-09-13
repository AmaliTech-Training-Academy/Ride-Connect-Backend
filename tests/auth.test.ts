import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { POST_LOGIN_REDIRECT } from '../src/controllers/auth.controller';
import { closeDb, resetAuthTables, uniqueEmail } from './helpers';

const app = createApp();

const VALID_PASSWORD = 'careful-horse-8';

async function registerUser(email: string, password = VALID_PASSWORD) {
  const response = await request(app)
    .post('/api/register')
    .send({ name: 'Grace Hopper', email, password });

  expect(response.status).toBe(201);
  return response;
}

beforeEach(async () => {
  await resetAuthTables();
});

afterAll(async () => {
  await closeDb();
});

describe('POST /register', () => {
  it('AC1: registers a new user with name, email and an 8+ character password', async () => {
    const email = uniqueEmail('ac1');

    const response = await request(app)
      .post('/api/register')
      .send({ name: 'Grace Hopper', email, password: VALID_PASSWORD });

    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({
      name: 'Grace Hopper',
      email,
    });
    expect(response.body.data.user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(JSON.stringify(response.body)).not.toContain(VALID_PASSWORD);
  });

  it('AC1: rejects a password shorter than 8 characters', async () => {
    const response = await request(app)
      .post('/api/register')
      .send({ name: 'Grace Hopper', email: uniqueEmail('ac1-short'), password: 'abc1234' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.data.fields.password[0]).toMatch(/at least 8 characters/);
  });

  it('AC2: returns 409 with a distinct error when the email is already used', async () => {
    const email = uniqueEmail('ac2');
    await registerUser(email);

    const response = await request(app)
      .post('/api/register')
      .send({ name: 'Grace Hopper', email, password: VALID_PASSWORD });

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.data.code).toBe('USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL');
    expect(response.body.message).toMatch(/already exists/i);

    expect(response.body.message).not.toBe('Invalid email or password');
  });

  it('AC2: does not create a second user row for a duplicate email', async () => {
    const email = uniqueEmail('ac2-rows');
    const first = await registerUser(email);

    await request(app)
      .post('/api/register')
      .send({ name: 'Impostor', email, password: 'another-password-9' });

    const login = await request(app).post('/api/login').send({ email, password: VALID_PASSWORD });

    expect(login.status).toBe(200);
    expect(login.body.data.user.id).toBe(first.body.data.user.id);
    expect(login.body.data.user.name).toBe('Grace Hopper');
  });
});

describe('POST /login', () => {
  it('AC3: logs in a registered user and returns what the client needs to redirect', async () => {
    const email = uniqueEmail('ac3');
    await registerUser(email);

    const response = await request(app).post('/api/login').send({ email, password: VALID_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({ email });
    expect(typeof response.body.data.token).toBe('string');
    expect(response.body.data.token.length).toBeGreaterThan(0);
    expect(response.body.data.redirectTo).toBe(POST_LOGIN_REDIRECT);

    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(String(setCookie)).toContain('session_token');
  });

  it('AC3: does not issue a server-side redirect', async () => {
    const email = uniqueEmail('ac3-noredirect');
    await registerUser(email);

    const response = await request(app).post('/api/login').send({ email, password: VALID_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.status).toBeLessThan(300);
    expect(response.headers.location).toBeUndefined();
  });

  it('AC4: returns the generic message for an incorrect password', async () => {
    const email = uniqueEmail('ac4-badpw');
    await registerUser(email);

    const response = await request(app)
      .post('/api/login')
      .send({ email, password: 'definitely-not-it' });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid email or password');
    expect(response.body.data).toBeUndefined();
  });

  it('AC4: returns the generic message for an unknown email', async () => {
    const response = await request(app)
      .post('/api/login')
      .send({ email: uniqueEmail('ac4-unknown'), password: VALID_PASSWORD });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid email or password');
    expect(response.body.data).toBeUndefined();
  });

  it('AC4: wrong password and unknown email are indistinguishable', async () => {
    const email = uniqueEmail('ac4-same');
    await registerUser(email);

    const wrongPassword = await request(app)
      .post('/api/login')
      .send({ email, password: 'definitely-not-it' });

    const unknownEmail = await request(app)
      .post('/api/login')
      .send({ email: uniqueEmail('ac4-missing'), password: VALID_PASSWORD });

    expect(wrongPassword.status).toBe(unknownEmail.status);
    expect(wrongPassword.body).toEqual(unknownEmail.body);

    for (const body of [wrongPassword.body, unknownEmail.body]) {
      const serialized = JSON.stringify(body).toLowerCase();
      expect(serialized).not.toContain('not found');
      expect(serialized).not.toContain('no such user');
      expect(serialized).not.toContain('incorrect password');
      expect(serialized).not.toContain('wrong password');
      expect(serialized).not.toContain('unknown email');
    }
  });
});
