import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
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

function tomorrow(): { date: string; time: string } {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return { date: date.toISOString().slice(0, 10), time: '09:30' };
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
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      origin: 'Accra',
      destination: 'Kumasi',
      totalSeats: 3,
      availableSeats: 3,
      status: 'OPEN',
    });
    expect(response.body.data).not.toHaveProperty('updatedAt');
  });

  it('rejects an unauthenticated request', async () => {
    const response = await request(app).post('/rides').send(validRide());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  });

  it('rejects a submission missing all required fields', async () => {
    const cookie = await registerDriver();

    const response = await request(app).post('/rides').set('Cookie', cookie).send({});

    expect(response.status).toBe(400);
    expect(response.body.data.fields).toMatchObject({
      origin: [expect.any(String)],
      destination: [expect.any(String)],
      departureDate: [expect.any(String)],
      departureTime: [expect.any(String)],
      availableSeats: [expect.any(String)],
    });
  });

  it('rejects available seats outside the 1-8 range', async () => {
    const cookie = await registerDriver();

    const response = await request(app)
      .post('/rides')
      .set('Cookie', cookie)
      .send({ ...validRide(), availableSeats: 9 });

    expect(response.status).toBe(400);
    expect(response.body.data.fields.availableSeats[0]).toMatch(/between 1 and 8/);
  });

  it('rejects a departure date in the past', async () => {
    const cookie = await registerDriver();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const response = await request(app)
      .post('/rides')
      .set('Cookie', cookie)
      .send({ ...validRide(), departureDate: yesterday });

    expect(response.status).toBe(400);
    expect(response.body.data.fields.departureDate[0]).toMatch(/past/);
  });

  it('rejects when origin and destination are the same', async () => {
    const cookie = await registerDriver();

    const response = await request(app)
      .post('/rides')
      .set('Cookie', cookie)
      .send({ ...validRide(), destination: 'accra' });

    expect(response.status).toBe(400);
    expect(response.body.data.fields.destination).toBeDefined();
  });
});
