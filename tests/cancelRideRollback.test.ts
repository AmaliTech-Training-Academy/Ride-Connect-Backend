import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app';
import { db } from '../src/db';
import { rides } from '../src/db/schema';
import { closeDb, resetAuthTables, uniqueEmail } from './helpers';

// Make the cancellation notifications fail, so we can check the ride's status change is rolled back too.
vi.mock('../src/services/notifications.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/services/notifications.service')>();
  return {
    ...original,
    notifyRideCancelled: async () => {
      throw new Error('Notification insert failed.');
    },
  };
});

const app = createApp();

const VALID_PASSWORD = 'careful-horse-8';

/** Signs a new user up through better-auth and returns their session cookie. */
async function registerUser(name: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/sign-up/email')
    .send({ name, email: uniqueEmail(name.toLowerCase().replace(/\s+/g, '-')), password: VALID_PASSWORD });

  const cookie = response.headers['set-cookie'];
  if (!cookie) {
    throw new Error('Sign-up did not return a session cookie.');
  }

  return Array.isArray(cookie) ? cookie.join('; ') : cookie;
}

async function postRide(cookie: string): Promise<string> {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const response = await request(app).post('/api/rides').set('Cookie', cookie).send({
    origin: 'Accra',
    destination: 'Kumasi',
    departureDate: date,
    departureTime: '09:30',
    availableSeats: 3,
    office: 'KUMASI',
  });

  expect(response.status).toBe(201);
  return response.body.data.id;
}

async function statusOf(rideId: string): Promise<string> {
  const [ride] = await db.select({ status: rides.status }).from(rides).where(eq(rides.id, rideId));
  return ride.status;
}

beforeEach(async () => {
  await resetAuthTables();
});

afterAll(async () => {
  await closeDb();
});

describe('cancelling a ride when the notifications fail', () => {
  it('rolls back PATCH /cancel', async () => {
    const driver = await registerUser('Grace Hopper');
    const rideId = await postRide(driver);

    const response = await request(app).patch(`/api/rides/${rideId}/cancel`).set('Cookie', driver);

    expect(response.status).toBe(500);
    expect(await statusOf(rideId)).toBe('OPEN');
  });

  it('rolls back PATCH /status with CANCELLED', async () => {
    const driver = await registerUser('Grace Hopper');
    const rideId = await postRide(driver);

    const response = await request(app)
      .patch(`/api/rides/${rideId}/status`)
      .set('Cookie', driver)
      .send({ status: 'CANCELLED' });

    expect(response.status).toBe(500);
    expect(await statusOf(rideId)).toBe('OPEN');
  });
});
