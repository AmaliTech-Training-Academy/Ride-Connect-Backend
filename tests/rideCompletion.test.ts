import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { db } from '../src/db';
import { rides } from '../src/db/schema';
import { completePastRides } from '../src/services/rides.service';
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

describe('Automatic ride completion', () => {
  it('marks a past-departure ride as COMPLETED and drops it from the public listing', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const pastDeparture = new Date(Date.now() - 60 * 60 * 1000);
    await db.update(rides).set({ departureAt: pastDeparture }).where(eq(rides.id, ride.id));

    await completePastRides();

    const [updatedRide] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(updatedRide.status).toBe('COMPLETED');

    const passenger = await registerUser('Ada Lovelace');
    const listing = await request(app).get('/api/rides').set('Cookie', passenger.cookie);
    expect(listing.body.data).toEqual([]);
  });

  it('rejects a join request on a ride whose departure has already passed', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    await db
      .update(rides)
      .set({ departureAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(rides.id, ride.id));
    const passenger = await registerUser('Ada Lovelace');

    const response = await request(app)
      .post(`/api/rides/${ride.id}/requests`)
      .set('Cookie', passenger.cookie);

    expect(response.status).toBe(409);
  });

  it('rejects accepting a request on a cancelled ride', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver, { availableSeats: 2 });
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
