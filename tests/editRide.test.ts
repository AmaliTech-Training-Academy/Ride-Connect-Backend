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

function tomorrow(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function postRide(driver: AuthedUser, overrides: Record<string, unknown> = {}): Promise<{ id: string }> {
  const response = await request(app)
    .post('/api/rides')
    .set('Cookie', driver.cookie)
    .send({
      origin: 'KNUST',
      destination: 'Adum',
      departureDate: tomorrow(),
      departureTime: '17:00',
      availableSeats: 2,
      ...overrides,
    });

  expect(response.status).toBe(201);
  return response.body.data;
}

async function acceptPassenger(rideId: string, driver: AuthedUser, passenger: AuthedUser): Promise<void> {
  const created = await request(app).post(`/api/rides/${rideId}/requests`).set('Cookie', passenger.cookie);
  expect(created.status).toBe(201);

  const accepted = await request(app)
    .patch(`/api/rides/${rideId}/requests/${created.body.data.id}/accept`)
    .set('Cookie', driver.cookie);
  expect(accepted.status).toBe(200);
}

function editRide(rideId: string, user: AuthedUser, body: Record<string, unknown>) {
  return request(app).patch(`/api/rides/${rideId}`).set('Cookie', user.cookie).send(body);
}

beforeEach(async () => {
  await resetAuthTables();
});

afterAll(async () => {
  await closeDb();
});

describe('PATCH /rides/:rideId', () => {
  it('updates only the fields that were sent', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);

    const response = await editRide(ride.id, driver, { departureTime: '17:30', totalSeats: 4 });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      origin: 'KNUST',
      destination: 'Adum',
      departureAt: `${tomorrow()}T17:30:00.000Z`,
      totalSeats: 4,
      availableSeats: 4,
      status: 'OPEN',
    });
  });

  it('shows the edit on the ride listings', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);

    await editRide(ride.id, driver, { destination: 'Kejetia' });

    const listing = await request(app).get('/api/rides').set('Cookie', driver.cookie);
    expect(listing.body.data[0]).toMatchObject({ id: ride.id, destination: 'Kejetia' });
  });

  it('rejects an edit from someone other than the driver', async () => {
    const driver = await registerUser('Grace Hopper');
    const stranger = await registerUser('Alan Turing');
    const ride = await postRide(driver);

    const response = await editRide(ride.id, stranger, { totalSeats: 3 });

    expect(response.status).toBe(403);
  });

  it('rejects an empty body', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);

    const response = await editRide(ride.id, driver, {});

    expect(response.status).toBe(400);
  });

  it('rejects a departure in the past', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);

    const response = await editRide(ride.id, driver, { departureDate: '2020-01-01' });

    expect(response.status).toBe(400);
  });

  it('rejects a destination that matches the current origin', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);

    const response = await editRide(ride.id, driver, { destination: 'knust' });

    expect(response.status).toBe(400);
  });

  it('rejects seats outside 1 to 8', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);

    expect((await editRide(ride.id, driver, { totalSeats: 0 })).status).toBe(400);
    expect((await editRide(ride.id, driver, { totalSeats: 9 })).status).toBe(400);
  });

  it('rejects editing a cancelled ride', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    await request(app).patch(`/api/rides/${ride.id}/cancel`).set('Cookie', driver.cookie);

    const response = await editRide(ride.id, driver, { totalSeats: 3 });

    expect(response.status).toBe(409);
  });

  it('does not let seats drop below the accepted passengers', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver, { availableSeats: 3 });
    await acceptPassenger(ride.id, driver, await registerUser('Ada Lovelace'));
    await acceptPassenger(ride.id, driver, await registerUser('Alan Turing'));

    const response = await editRide(ride.id, driver, { totalSeats: 1 });

    expect(response.status).toBe(409);
  });

  it('recalculates available seats around accepted passengers and reopens a full ride', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver, { availableSeats: 1 });
    await acceptPassenger(ride.id, driver, await registerUser('Ada Lovelace'));

    const response = await editRide(ride.id, driver, { totalSeats: 3 });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ totalSeats: 3, availableSeats: 2, status: 'OPEN' });
  });

  it('marks the ride full when seats are cut to the accepted passengers', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver, { availableSeats: 3 });
    await acceptPassenger(ride.id, driver, await registerUser('Ada Lovelace'));

    const response = await editRide(ride.id, driver, { totalSeats: 1 });

    expect(response.body.data).toMatchObject({ totalSeats: 1, availableSeats: 0, status: 'FULL' });
  });

  it('keeps pending and accepted requests attached after an edit', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    await acceptPassenger(ride.id, driver, await registerUser('Ada Lovelace'));
    const waiting = await registerUser('Alan Turing');
    await request(app).post(`/api/rides/${ride.id}/requests`).set('Cookie', waiting.cookie);

    await editRide(ride.id, driver, { origin: 'Tech Junction' });

    const dashboard = await request(app).get('/api/rides/mine').set('Cookie', driver.cookie);
    const driving = dashboard.body.data.driving[0];
    expect(driving.origin).toBe('Tech Junction');
    expect(driving.pendingRequests).toHaveLength(1);
    expect(driving.confirmedPassengers).toHaveLength(1);
  });

  it('notifies accepted passengers when the time or route changes', async () => {
    const driver = await registerUser('Grace Hopper');
    const passenger = await registerUser('Ada Lovelace');
    const ride = await postRide(driver);
    await acceptPassenger(ride.id, driver, passenger);

    await editRide(ride.id, driver, { departureTime: '18:30' });

    const feed = await request(app).get('/api/notifications').set('Cookie', passenger.cookie);
    expect(feed.body.data.items.map((item: { type: string }) => item.type)).toContain('RIDE_UPDATED');
  });

  it('does not notify passengers when only the seats change', async () => {
    const driver = await registerUser('Grace Hopper');
    const passenger = await registerUser('Ada Lovelace');
    const ride = await postRide(driver);
    await acceptPassenger(ride.id, driver, passenger);

    await editRide(ride.id, driver, { totalSeats: 5 });

    const feed = await request(app).get('/api/notifications').set('Cookie', passenger.cookie);
    expect(feed.body.data.items.map((item: { type: string }) => item.type)).not.toContain('RIDE_UPDATED');
  });
});
