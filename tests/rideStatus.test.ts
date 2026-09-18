import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { closeDb, resetAuthTables, uniqueEmail } from './helpers';

const app = createApp();

const VALID_PASSWORD = 'careful-horse-8';

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

function tomorrow(): { date: string; time: string } {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return { date: date.toISOString().slice(0, 10), time: '09:30' };
}

async function postRide(driver: AuthedUser, overrides: Record<string, unknown> = {}): Promise<{ id: string }> {
  const { date, time } = tomorrow();
  const response = await request(app)
    .post('/api/rides')
    .set('Cookie', driver.cookie)
    .send({
      origin: 'Accra',
      destination: 'Kumasi',
      departureDate: date,
      departureTime: time,
      availableSeats: 2,
      ...overrides,
    });

  expect(response.status).toBe(201);
  return response.body.data;
}

function setStatus(rideId: string, status: string, driver: AuthedUser) {
  return request(app).patch(`/api/rides/${rideId}/status`).set('Cookie', driver.cookie).send({ status });
}

beforeEach(async () => {
  await resetAuthTables();
});

afterAll(async () => {
  await closeDb();
});

describe('PATCH /rides/:rideId/status', () => {
  it('lets the driver cancel an open ride', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);

    const response = await setStatus(ride.id, 'CANCELLED', driver);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('CANCELLED');
  });

  it('rejects reopening a cancelled ride', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    await setStatus(ride.id, 'CANCELLED', driver);

    const response = await setStatus(ride.id, 'OPEN', driver);

    expect(response.status).toBe(409);
  });

  it('rejects accepting a pending request on a cancelled ride', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await request(app)
      .post(`/api/rides/${ride.id}/requests`)
      .set('Cookie', passenger.cookie);
    await setStatus(ride.id, 'CANCELLED', driver);

    const response = await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/accept`)
      .set('Cookie', driver.cookie);

    expect(response.status).toBe(409);
  });
});
