import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { db } from '../src/db';
import { rides } from '../src/db/schema';
import { closeDb, resetAuthTables, uniqueEmail } from './helpers';

const app = createApp();

const VALID_PASSWORD = 'careful-horse-8';

/** Registers a new driver and returns their session cookie (better-auth auto-signs-in on register). */
async function registerDriver(): Promise<string> {
  const response = await request(app)
    .post('/register')
    .send({ name: 'Grace Hopper', email: uniqueEmail('driver'), password: VALID_PASSWORD });

  const cookie = response.headers['set-cookie'];
  if (!cookie) {
    throw new Error('Register did not return a session cookie.');
  }
  return Array.isArray(cookie) ? cookie.join('; ') : cookie;
}

function daysFromNow(n: number): { date: string; time: string } {
  const date = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  return { date: date.toISOString().slice(0, 10), time: '09:30' };
}

function tomorrow(): { date: string; time: string } {
  return daysFromNow(1);
}

function validRide(): Record<string, unknown> {
  const { date, time } = tomorrow();
  return {
    origin: 'Accra',
    destination: 'Kumasi',
    departureDate: date,
    departureTime: time,
    availableSeats: 3,
  };
}

/** Creates a ride via the real POST /rides endpoint, as a fresh driver. Returns the created ride. */
async function postRide(overrides: Record<string, unknown> = {}): Promise<{ id: string; driverId: string }> {
  const cookie = await registerDriver();
  const response = await request(app)
    .post('/rides')
    .set('Cookie', cookie)
    .send({ ...validRide(), ...overrides });

  expect(response.status).toBe(201);
  return response.body.ride;
}

beforeEach(async () => {
  await resetAuthTables();
});

afterAll(async () => {
  await closeDb();
});

describe('POST /rides', () => {
  it('creates a ride with status OPEN when all fields are valid', async () => {
    const cookie = await registerDriver();

    const response = await request(app).post('/rides').set('Cookie', cookie).send(validRide());

    expect(response.status).toBe(201);
    expect(response.body.ride).toMatchObject({
      origin: 'Accra',
      destination: 'Kumasi',
      totalSeats: 3,
      availableSeats: 3,
      status: 'OPEN',
    });
  });

  it('rejects an unauthenticated request', async () => {
    const response = await request(app).post('/rides').send(validRide());

    expect(response.status).toBe(401);
  });

  it('rejects a submission missing all required fields', async () => {
    const cookie = await registerDriver();

    const response = await request(app).post('/rides').set('Cookie', cookie).send({});

    expect(response.status).toBe(400);
    expect(response.body.error.fields).toMatchObject({
      origin: expect.any(String),
      destination: expect.any(String),
      departureDate: expect.any(String),
      departureTime: expect.any(String),
      availableSeats: expect.any(String),
    });
  });

  it('rejects available seats outside the 1-8 range', async () => {
    const cookie = await registerDriver();

    const response = await request(app)
      .post('/rides')
      .set('Cookie', cookie)
      .send({ ...validRide(), availableSeats: 9 });

    expect(response.status).toBe(400);
    expect(response.body.error.fields.availableSeats).toMatch(/between 1 and 8/);
  });

  it('rejects a departure date in the past', async () => {
    const cookie = await registerDriver();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const response = await request(app)
      .post('/rides')
      .set('Cookie', cookie)
      .send({ ...validRide(), departureDate: yesterday });

    expect(response.status).toBe(400);
    expect(response.body.error.fields.departureDate).toMatch(/past/);
  });

  it('rejects when origin and destination are the same', async () => {
    const cookie = await registerDriver();

    const response = await request(app)
      .post('/rides')
      .set('Cookie', cookie)
      .send({ ...validRide(), destination: 'accra' });

    expect(response.status).toBe(400);
    expect(response.body.error.fields.destination).toBeDefined();
  });
});

describe('GET /rides', () => {
  it('lists open rides by default, without requiring auth', async () => {
    await postRide({ origin: 'Accra', destination: 'Kumasi' });
    const cancelled = await postRide({ origin: 'Tema', destination: 'Ho' });
    await db.update(rides).set({ status: 'CANCELLED' }).where(eq(rides.id, cancelled.id));

    const response = await request(app).get('/rides');

    expect(response.status).toBe(200);
    expect(response.body.rides).toHaveLength(1);
    expect(response.body.rides[0]).toMatchObject({ origin: 'Accra', status: 'OPEN' });
  });

  it('filters by departure date, returning only rides on that date', async () => {
    const day1 = daysFromNow(1);
    const day2 = daysFromNow(2);

    await postRide({ origin: 'Accra', destination: 'Kumasi', ...day1 });
    await postRide({ origin: 'Tema', destination: 'Ho', ...day2 });

    const response = await request(app).get('/rides').query({ date: day1.date });

    expect(response.status).toBe(200);
    expect(response.body.rides).toHaveLength(1);
    expect(response.body.rides[0]).toMatchObject({ origin: 'Accra' });
  });

  it('searches by route keyword, matching origin or destination case-insensitively', async () => {
    await postRide({ origin: 'Accra', destination: 'Kumasi' });
    await postRide({ origin: 'Takoradi', destination: 'Accra' });
    await postRide({ origin: 'Tema', destination: 'Ho' });

    const response = await request(app).get('/rides').query({ search: 'ACCRA' });

    expect(response.status).toBe(200);
    expect(response.body.rides).toHaveLength(2);
  });

  it('returns an empty list when nothing matches the date filter', async () => {
    await postRide();

    const farOut = daysFromNow(30);
    const response = await request(app).get('/rides').query({ date: farOut.date });

    expect(response.status).toBe(200);
    expect(response.body.rides).toEqual([]);
  });

  it('rejects an invalid date format', async () => {
    const response = await request(app).get('/rides').query({ date: 'not-a-date' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/invalid date/i);
  });
});
