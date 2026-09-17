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
  const response = await request(app).post('/api/register').send({ name, email, password: VALID_PASSWORD });

  const cookie = response.headers['set-cookie'];
  if (!cookie) {
    throw new Error('Register did not return a session cookie.');
  }

  return {
    cookie: Array.isArray(cookie) ? cookie.join('; ') : cookie,
    userId: response.body.data.user.id,
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
      availableSeats: 1,
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
  it('lets the driver manually close an open ride', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);

    const response = await setStatus(ride.id, 'FULL', driver);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('FULL');
  });

  it('lets the driver cancel an open ride', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);

    const response = await setStatus(ride.id, 'CANCELLED', driver);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('CANCELLED');
  });

  it('lets the driver reopen a full ride when a seat is available', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver, { availableSeats: 2 });
    await setStatus(ride.id, 'FULL', driver);

    const response = await setStatus(ride.id, 'OPEN', driver);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('OPEN');
  });

  it('rejects reopening a cancelled ride', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    await setStatus(ride.id, 'CANCELLED', driver);

    const response = await setStatus(ride.id, 'OPEN', driver);

    expect(response.status).toBe(409);
  });

  it('rejects a colleague who does not own the ride', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const someoneElse = await registerUser('Alan Turing');

    const response = await setStatus(ride.id, 'CANCELLED', someoneElse);

    expect(response.status).toBe(403);
  });

  it('rejects an unauthenticated request', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);

    const response = await request(app).patch(`/api/rides/${ride.id}/status`).send({ status: 'CANCELLED' });

    expect(response.status).toBe(401);
  });

  it('rejects an invalid status value', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);

    const response = await setStatus(ride.id, 'DONE', driver);

    expect(response.status).toBe(400);
  });
});
