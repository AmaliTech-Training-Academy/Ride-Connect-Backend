import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { db } from '../src/db';
import { rides } from '../src/db/schema';
import { closeDb, resetAuthTables, uniqueEmail } from './helpers';

const app = createApp();

const VALID_PASSWORD = 'careful-horse-8';

/** Signs a new user up through better-auth and returns their session cookie. */
async function registerUser(name: string, emailPrefix: string): Promise<string> {
  const response = await request(app)
    .post('/api/auth/sign-up/email')
    .send({ name, email: uniqueEmail(emailPrefix), password: VALID_PASSWORD });

  const cookie = response.headers['set-cookie'];
  if (!cookie) {
    throw new Error('Sign-up did not return a session cookie.');
  }
  return Array.isArray(cookie) ? cookie.join('; ') : cookie;
}

const registerDriver = (): Promise<string> => registerUser('Grace Hopper', 'driver');

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

/** Creates a ride via the real POST /api/rides endpoint, as a fresh driver. Returns the created ride. */
async function postRide(overrides: Record<string, unknown> = {}): Promise<{ id: string; driverId: string }> {
  const cookie = await registerDriver();
  const response = await request(app)
    .post('/api/rides')
    .set('Cookie', cookie)
    .send({ ...validRide(), ...overrides });

  expect(response.status).toBe(201);
  return response.body.data;
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

    const response = await request(app).post('/api/rides').set('Cookie', cookie).send(validRide());

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      origin: 'Accra',
      destination: 'Kumasi',
      totalSeats: 3,
      availableSeats: 3,
      status: 'OPEN',
      driverName: 'Grace Hopper',
    });
    expect(response.body.data).not.toHaveProperty('updatedAt');
  });

  it('saves the route description when one is given, and returns it', async () => {
    const cookie = await registerDriver();

    const response = await request(app)
      .post('/api/rides')
      .set('Cookie', cookie)
      .send({ ...validRide(), routeDescription: 'Meet at the Shell station, silver Corolla' });

    expect(response.status).toBe(201);
    expect(response.body.data.routeDescription).toBe('Meet at the Shell station, silver Corolla');
  });

  it('leaves the route description out when none is given', async () => {
    const cookie = await registerDriver();

    const response = await request(app).post('/api/rides').set('Cookie', cookie).send(validRide());

    expect(response.status).toBe(201);
    expect(response.body.data.routeDescription).toBeNull();
  });

  it('rejects an unauthenticated request', async () => {
    const response = await request(app).post('/api/rides').send(validRide());

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  });

  it('rejects a submission missing all required fields', async () => {
    const cookie = await registerDriver();

    const response = await request(app).post('/api/rides').set('Cookie', cookie).send({});

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
      .post('/api/rides')
      .set('Cookie', cookie)
      .send({ ...validRide(), availableSeats: 9 });

    expect(response.status).toBe(400);
    expect(response.body.data.fields.availableSeats[0]).toMatch(/between 1 and 8/);
  });

  it('rejects a departure date in the past', async () => {
    const cookie = await registerDriver();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const response = await request(app)
      .post('/api/rides')
      .set('Cookie', cookie)
      .send({ ...validRide(), departureDate: yesterday });

    expect(response.status).toBe(400);
    expect(response.body.data.fields.departureDate[0]).toMatch(/past/);
  });

  it('rejects when origin and destination are the same', async () => {
    const cookie = await registerDriver();

    const response = await request(app)
      .post('/api/rides')
      .set('Cookie', cookie)
      .send({ ...validRide(), destination: 'accra' });

    expect(response.status).toBe(400);
    expect(response.body.data.fields.destination).toBeDefined();
  });
});

describe('GET /rides/mine', () => {
  it('lists rides the user is driving and rides they joined', async () => {
    const driverCookie = await registerDriver();
    const ownRide = await request(app).post('/api/rides').set('Cookie', driverCookie).send(validRide());

    const passengerAuthCookie = await registerUser('Ada Lovelace', 'passenger');
    const otherDriverAuthCookie = await registerUser('Alan Turing', 'driver-two');

    const otherRide = await request(app)
      .post('/api/rides')
      .set('Cookie', otherDriverAuthCookie)
      .send({ ...validRide(), origin: 'Tema', destination: 'Ho' });

    const requestResponse = await request(app)
      .post(`/api/rides/${otherRide.body.data.id}/requests`)
      .set('Cookie', passengerAuthCookie);

    await request(app)
      .patch(`/api/rides/${otherRide.body.data.id}/requests/${requestResponse.body.data.id}/accept`)
      .set('Cookie', otherDriverAuthCookie);

    const response = await request(app).get('/api/rides/mine').set('Cookie', passengerAuthCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.driving).toEqual([]);
    expect(response.body.data.joined).toHaveLength(1);
    expect(response.body.data.joined[0]).toMatchObject({
      id: otherRide.body.data.id,
      origin: 'Tema',
      destination: 'Ho',
      status: 'OPEN',
    });

    const myDriving = await request(app).get('/api/rides/mine').set('Cookie', driverCookie);
    expect(myDriving.status).toBe(200);
    expect(myDriving.body.data.driving).toHaveLength(1);
    expect(myDriving.body.data.driving[0]).toMatchObject({ id: ownRide.body.data.id, status: 'OPEN' });
  });
});

describe('GET /rides/mine — request visibility', () => {
  it("includes a driver's pending requests and confirmed passengers on each ride", async () => {
    const driverCookie = await registerDriver();
    const ride = await request(app).post('/api/rides').set('Cookie', driverCookie).send(validRide());

    const acceptedAuthCookie = await registerUser('Yaw Boateng', 'accepted');
    const pendingAuthCookie = await registerUser('Esi Ofori', 'pending');

    const acceptedRequest = await request(app)
      .post(`/api/rides/${ride.body.data.id}/requests`)
      .set('Cookie', acceptedAuthCookie);
    await request(app).post(`/api/rides/${ride.body.data.id}/requests`).set('Cookie', pendingAuthCookie);

    await request(app)
      .patch(`/api/rides/${ride.body.data.id}/requests/${acceptedRequest.body.data.id}/accept`)
      .set('Cookie', driverCookie);

    const response = await request(app).get('/api/rides/mine').set('Cookie', driverCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.driving[0].pendingRequests).toHaveLength(1);
    expect(response.body.data.driving[0].pendingRequests[0]).toMatchObject({ passengerName: 'Esi Ofori' });
    expect(response.body.data.driving[0].confirmedPassengers).toHaveLength(1);
    expect(response.body.data.driving[0].confirmedPassengers[0]).toMatchObject({ passengerName: 'Yaw Boateng' });
  });

  it("shows a passenger their own request status, even while pending or after being declined", async () => {
    const driverCookie = await registerDriver();
    const ride = await request(app).post('/api/rides').set('Cookie', driverCookie).send(validRide());

    const passengerAuthCookie = await registerUser('Kojo Mensah', 'passenger');

    const joinRequest = await request(app)
      .post(`/api/rides/${ride.body.data.id}/requests`)
      .set('Cookie', passengerAuthCookie);

    const pendingView = await request(app).get('/api/rides/mine').set('Cookie', passengerAuthCookie);
    expect(pendingView.body.data.joined).toHaveLength(1);
    expect(pendingView.body.data.joined[0]).toMatchObject({ id: ride.body.data.id, requestStatus: 'PENDING' });

    await request(app)
      .patch(`/api/rides/${ride.body.data.id}/requests/${joinRequest.body.data.id}/decline`)
      .set('Cookie', driverCookie);

    const declinedView = await request(app).get('/api/rides/mine').set('Cookie', passengerAuthCookie);
    expect(declinedView.body.data.joined).toHaveLength(1);
    expect(declinedView.body.data.joined[0]).toMatchObject({ id: ride.body.data.id, requestStatus: 'DECLINED' });
  });
});

describe('PATCH /rides/:rideId/cancel', () => {
  it('allows a driver to cancel a ride they own', async () => {
    const cookie = await registerDriver();
    const created = await request(app).post('/api/rides').set('Cookie', cookie).send(validRide());

    const response = await request(app).patch(`/api/rides/${created.body.data.id}/cancel`).set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('CANCELLED');

    const [ride] = await db.select().from(rides).where(eq(rides.id, created.body.data.id));
    expect(ride.status).toBe('CANCELLED');
  });
});

describe('GET /rides', () => {
  it('rejects an unauthenticated request', async () => {
    const response = await request(app).get('/api/rides');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  });

  it('lists open rides for an authenticated colleague', async () => {
    await postRide({ origin: 'Accra', destination: 'Kumasi' });
    const cancelled = await postRide({ origin: 'Tema', destination: 'Ho' });
    await db.update(rides).set({ status: 'CANCELLED' }).where(eq(rides.id, cancelled.id));

    const cookie = await registerDriver();
    const response = await request(app).get('/api/rides').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ origin: 'Accra', status: 'OPEN', driverName: 'Grace Hopper' });
  });

  it('includes the route description when the driver gave one', async () => {
    await postRide({ routeDescription: 'Meet at the Shell station, silver Corolla' });

    const cookie = await registerDriver();
    const response = await request(app).get('/api/rides').set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body.data[0].routeDescription).toBe('Meet at the Shell station, silver Corolla');
  });

  it('filters by departure date, returning only rides on that date', async () => {
    const day1 = daysFromNow(1);
    const day2 = daysFromNow(2);

    await postRide({ origin: 'Accra', destination: 'Kumasi', departureDate: day1.date, departureTime: day1.time });
    await postRide({ origin: 'Tema', destination: 'Ho', departureDate: day2.date, departureTime: day2.time });

    const cookie = await registerDriver();
    const response = await request(app).get('/api/rides').set('Cookie', cookie).query({ date: day1.date });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({ origin: 'Accra' });
  });

  it('searches by route keyword, matching origin or destination case-insensitively', async () => {
    await postRide({ origin: 'Accra', destination: 'Kumasi' });
    await postRide({ origin: 'Takoradi', destination: 'Accra' });
    await postRide({ origin: 'Tema', destination: 'Ho' });

    const cookie = await registerDriver();
    const response = await request(app).get('/api/rides').set('Cookie', cookie).query({ search: 'ACCRA' });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });

  it('returns a friendly message when nothing matches the date filter', async () => {
    await postRide();

    const farOut = daysFromNow(30);
    const cookie = await registerDriver();
    const response = await request(app).get('/api/rides').set('Cookie', cookie).query({ date: farOut.date });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.message).toBe('No rides found for this date.');
  });

  it('returns a friendly message when nothing matches the search filter', async () => {
    await postRide({ origin: 'Accra', destination: 'Kumasi' });

    const cookie = await registerDriver();
    const response = await request(app).get('/api/rides').set('Cookie', cookie).query({ search: 'Tamale' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.message).toBe('No rides found for this route.');
  });

  it('rejects an invalid date format', async () => {
    const cookie = await registerDriver();
    const response = await request(app).get('/api/rides').set('Cookie', cookie).query({ date: 'not-a-date' });

    expect(response.status).toBe(400);
    expect(response.body.data.fields.date[0]).toMatch(/invalid date/i);
  });
});
