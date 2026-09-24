import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { db } from '../src/db';
import { rideRequests, rides } from '../src/db/schema';
import { closeDb, resetAuthTables, uniqueEmail } from './helpers';

const app = createApp();

const VALID_PASSWORD = 'careful-horse-8';
const NON_EXISTENT_RIDE_ID = '11111111-1111-4111-8111-111111111111';

interface AuthedUser {
  cookie: string;
  userId: string;
  name: string;
}

/** Signs a brand new user up through better-auth and returns their session cookie and id. */
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
    name,
  };
}

function tomorrow(): { date: string; time: string } {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return { date: date.toISOString().slice(0, 10), time: '09:30' };
}

/** Posts a ride as the given driver via the real endpoint. */
async function postRide(
  driver: AuthedUser,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string }> {
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

/** Submits a join request as the given passenger via the real endpoint. */
function requestToJoin(rideId: string, passenger: AuthedUser) {
  return request(app).post(`/api/rides/${rideId}/requests`).set('Cookie', passenger.cookie);
}

beforeEach(async () => {
  await resetAuthTables();
});

afterAll(async () => {
  await closeDb();
});

describe('POST /rides/:rideId/requests', () => {
  it('creates a pending request when the ride is open', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');

    const response = await requestToJoin(ride.id, passenger);

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      rideId: ride.id,
      passengerId: passenger.userId,
      status: 'PENDING',
    });
  });

  it('rejects an unauthenticated request', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);

    const response = await request(app).post(`/api/rides/${ride.id}/requests`);

    expect(response.status).toBe(401);
  });

  it('rejects a request for a ride that does not exist', async () => {
    const passenger = await registerUser('Ada Lovelace');

    const response = await requestToJoin(NON_EXISTENT_RIDE_ID, passenger);

    expect(response.status).toBe(404);
  });

  it('rejects a driver requesting to join their own ride', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);

    const response = await requestToJoin(ride.id, driver);

    expect(response.status).toBe(403);
  });

  it('rejects a request when the ride is not open', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    await db.update(rides).set({ status: 'CANCELLED' }).where(eq(rides.id, ride.id));
    const passenger = await registerUser('Ada Lovelace');

    const response = await requestToJoin(ride.id, passenger);

    expect(response.status).toBe(409);
  });

  it('rejects a second request from the same passenger for the same ride', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver, { availableSeats: 2 });
    const passenger = await registerUser('Ada Lovelace');
    await requestToJoin(ride.id, passenger);

    const response = await requestToJoin(ride.id, passenger);

    expect(response.status).toBe(409);
  });

  it('keeps a declined request final: a new request from the same passenger is rejected', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/decline`)
      .set('Cookie', driver.cookie)
      .send({ reason: 'Car is already full.' });

    const response = await requestToJoin(ride.id, passenger);

    expect(response.status).toBe(409);
  });
});

describe('GET /rides/:rideId/requests', () => {
  it('lets the owning driver see pending requests', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    await requestToJoin(ride.id, passenger);

    const response = await request(app).get(`/api/rides/${ride.id}/requests`).set('Cookie', driver.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      passengerId: passenger.userId,
      passengerName: 'Ada Lovelace',
      status: 'PENDING',
    });
  });

  it('excludes requests that are no longer pending', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/decline`)
      .set('Cookie', driver.cookie)
      .send({ reason: 'Car is already full.' });

    const response = await request(app).get(`/api/rides/${ride.id}/requests`).set('Cookie', driver.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it('rejects a colleague who does not own the ride', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const someoneElse = await registerUser('Alan Turing');

    const response = await request(app)
      .get(`/api/rides/${ride.id}/requests`)
      .set('Cookie', someoneElse.cookie);

    expect(response.status).toBe(403);
  });
});

describe('PATCH /rides/:rideId/requests/:requestId/accept', () => {
  it('accepts a pending request and decreases available seats by 1', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver, { availableSeats: 2 });
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);

    const response = await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/accept`)
      .set('Cookie', driver.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ACCEPTED');

    const [updatedRide] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(updatedRide.availableSeats).toBe(1);
    expect(updatedRide.status).toBe('OPEN');
  });

  it('moves the ride to FULL when accepting takes the last seat', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver, { availableSeats: 1 });
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);

    const response = await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/accept`)
      .set('Cookie', driver.cookie);

    expect(response.status).toBe(200);

    const [updatedRide] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(updatedRide.availableSeats).toBe(0);
    expect(updatedRide.status).toBe('FULL');
  });

  it('rejects accepting when no seats remain', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver, { availableSeats: 1 });
    const first = await registerUser('Ada Lovelace');
    const second = await registerUser('Alan Turing');
    const firstRequest = await requestToJoin(ride.id, first);
    const secondRequest = await requestToJoin(ride.id, second);
    await request(app)
      .patch(`/api/rides/${ride.id}/requests/${firstRequest.body.data.id}/accept`)
      .set('Cookie', driver.cookie);

    const response = await request(app)
      .patch(`/api/rides/${ride.id}/requests/${secondRequest.body.data.id}/accept`)
      .set('Cookie', driver.cookie);

    expect(response.status).toBe(409);
  });

  it('rejects accepting a request that was already declined', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/decline`)
      .set('Cookie', driver.cookie)
      .send({ reason: 'Car is already full.' });

    const response = await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/accept`)
      .set('Cookie', driver.cookie);

    expect(response.status).toBe(409);
  });

  it('rejects a colleague who does not own the ride', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    const someoneElse = await registerUser('Alan Turing');

    const response = await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/accept`)
      .set('Cookie', someoneElse.cookie);

    expect(response.status).toBe(403);
  });

  it('does not let seats fall below zero under concurrent accepts', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver, { availableSeats: 1 });
    const first = await registerUser('Ada Lovelace');
    const second = await registerUser('Alan Turing');
    const firstRequest = await requestToJoin(ride.id, first);
    const secondRequest = await requestToJoin(ride.id, second);

    const [firstResponse, secondResponse] = await Promise.all([
      request(app)
        .patch(`/api/rides/${ride.id}/requests/${firstRequest.body.data.id}/accept`)
        .set('Cookie', driver.cookie),
      request(app)
        .patch(`/api/rides/${ride.id}/requests/${secondRequest.body.data.id}/accept`)
        .set('Cookie', driver.cookie),
    ]);

    const statuses = [firstResponse.status, secondResponse.status].sort();
    expect(statuses).toEqual([200, 409]);

    const [updatedRide] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(updatedRide.availableSeats).toBe(0);
  });
});

describe('PATCH /rides/:rideId/requests/:requestId/decline', () => {
  it('declines a pending request without changing seat availability', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver, { availableSeats: 2 });
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);

    const response = await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/decline`)
      .set('Cookie', driver.cookie)
      .send({ reason: 'Car is already full.' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('DECLINED');

    const [updatedRide] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(updatedRide.availableSeats).toBe(2);
  });

  it('rejects declining a request that was already accepted', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/accept`)
      .set('Cookie', driver.cookie);

    const response = await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/decline`)
      .set('Cookie', driver.cookie)
      .send({ reason: 'Car is already full.' });

    expect(response.status).toBe(409);
  });
});

/** Declines a request as the driver, with a reason. */
function declineAs(driver: AuthedUser, rideId: string, requestId: string, reason = 'Car is already full.') {
  return request(app)
    .patch(`/api/rides/${rideId}/requests/${requestId}/decline`)
    .set('Cookie', driver.cookie)
    .send({ reason });
}

/** Asks the driver to reconsider a declined request, as the given passenger. */
function rerequestAs(passenger: AuthedUser, rideId: string, requestId: string, reason = 'I can meet you at the junction.') {
  return request(app)
    .patch(`/api/rides/${rideId}/requests/${requestId}/rerequest`)
    .set('Cookie', passenger.cookie)
    .send({ reason });
}

describe('Decline reason', () => {
  it('requires a reason to decline a request', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);

    const response = await declineAs(driver, ride.id, created.body.data.id, '   ');

    expect(response.status).toBe(400);
  });

  it('stores the rejection reason on the request', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);

    await declineAs(driver, ride.id, created.body.data.id, 'Leaving too early for you.');

    const [stored] = await db.select().from(rideRequests).where(eq(rideRequests.id, created.body.data.id));
    expect(stored.rejectionReason).toBe('Leaving too early for you.');
  });
});

describe('PATCH /rides/:rideId/requests/:requestId/rerequest', () => {
  it('puts a declined request back to pending and shows the driver it is a re-request', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver, { availableSeats: 2 });
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    await declineAs(driver, ride.id, created.body.data.id);

    const response = await rerequestAs(passenger, ride.id, created.body.data.id);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('PENDING');

    const [updatedRide] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(updatedRide.availableSeats).toBe(2);

    const list = await request(app).get(`/api/rides/${ride.id}/requests`).set('Cookie', driver.cookie);
    expect(list.body.data[0]).toMatchObject({
      isRerequest: true,
      rejectionReason: 'Car is already full.',
      rerequestReason: 'I can meet you at the junction.',
    });
  });

  it('lets the passenger see the rejection reason on their dashboard', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    await declineAs(driver, ride.id, created.body.data.id);

    const response = await request(app).get('/api/rides/mine').set('Cookie', passenger.cookie);

    expect(response.body.data.joined[0]).toMatchObject({
      requestStatus: 'DECLINED',
      rejectionReason: 'Car is already full.',
      rerequestCount: 0,
    });
  });

  it('requires a re-request reason', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    await declineAs(driver, ride.id, created.body.data.id);

    const response = await rerequestAs(passenger, ride.id, created.body.data.id, '');

    expect(response.status).toBe(400);
  });

  it('rejects a re-request when the request is not declined', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);

    const response = await rerequestAs(passenger, ride.id, created.body.data.id);

    expect(response.status).toBe(409);
  });

  it('rejects a re-request from someone other than the passenger', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const someoneElse = await registerUser('Alan Turing');
    const created = await requestToJoin(ride.id, passenger);
    await declineAs(driver, ride.id, created.body.data.id);

    const response = await rerequestAs(someoneElse, ride.id, created.body.data.id);

    expect(response.status).toBe(403);
  });

  it('makes a second decline final and keeps both rejection reasons', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    const requestId = created.body.data.id;
    await declineAs(driver, ride.id, requestId, 'First reason.');
    await rerequestAs(passenger, ride.id, requestId);

    const secondDecline = await declineAs(driver, ride.id, requestId, 'Still no.');
    expect(secondDecline.status).toBe(200);

    const response = await rerequestAs(passenger, ride.id, requestId);
    expect(response.status).toBe(409);

    const [stored] = await db.select().from(rideRequests).where(eq(rideRequests.id, requestId));
    expect(stored).toMatchObject({
      rejectionReason: 'First reason.',
      rerequestReason: 'I can meet you at the junction.',
      finalRejectionReason: 'Still no.',
      rerequestCount: 1,
    });
  });

  it('lets the driver accept a re-request and takes a seat', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver, { availableSeats: 2 });
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    await declineAs(driver, ride.id, created.body.data.id);
    await rerequestAs(passenger, ride.id, created.body.data.id);

    const response = await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/accept`)
      .set('Cookie', driver.cookie);

    expect(response.status).toBe(200);
    const [updatedRide] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(updatedRide.availableSeats).toBe(1);
  });

  it('rejects a re-request once the ride is cancelled', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    await declineAs(driver, ride.id, created.body.data.id);
    await db.update(rides).set({ status: 'CANCELLED' }).where(eq(rides.id, ride.id));

    const response = await rerequestAs(passenger, ride.id, created.body.data.id);

    expect(response.status).toBe(409);
  });

  it('rejects a re-request once the ride is full', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    await declineAs(driver, ride.id, created.body.data.id);
    await db.update(rides).set({ status: 'FULL', availableSeats: 0 }).where(eq(rides.id, ride.id));

    const response = await rerequestAs(passenger, ride.id, created.body.data.id);

    expect(response.status).toBe(409);
  });

  it('rejects a re-request after departure time has passed', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    await declineAs(driver, ride.id, created.body.data.id);
    await db
      .update(rides)
      .set({ departureAt: new Date(Date.now() - 60 * 1000) })
      .where(eq(rides.id, ride.id));

    const response = await rerequestAs(passenger, ride.id, created.body.data.id);

    expect(response.status).toBe(409);
  });
});

describe('PATCH /rides/:rideId/requests/:requestId/withdraw', () => {
  it('withdraws a pending request without changing seat availability', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver, { availableSeats: 2 });
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);

    const response = await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/withdraw`)
      .set('Cookie', passenger.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('WITHDRAWN');

    const [updatedRide] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(updatedRide.availableSeats).toBe(2);
  });

  it('withdrawing an accepted request gives back the seat', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver, { availableSeats: 2 });
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/accept`)
      .set('Cookie', driver.cookie);

    const response = await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/withdraw`)
      .set('Cookie', passenger.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('WITHDRAWN');

    const [updatedRide] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(updatedRide.availableSeats).toBe(2);
  });

  it('reopens a FULL ride when the withdrawing passenger held the last seat', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver, { availableSeats: 1 });
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/accept`)
      .set('Cookie', driver.cookie);

    const response = await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/withdraw`)
      .set('Cookie', passenger.cookie);

    expect(response.status).toBe(200);

    const [updatedRide] = await db.select().from(rides).where(eq(rides.id, ride.id));
    expect(updatedRide.availableSeats).toBe(1);
    expect(updatedRide.status).toBe('OPEN');
  });

  it('rejects withdrawing a request that belongs to someone else', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    const someoneElse = await registerUser('Alan Turing');

    const response = await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/withdraw`)
      .set('Cookie', someoneElse.cookie);

    expect(response.status).toBe(403);
  });

  it('rejects withdrawing a request that was already declined', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/decline`)
      .set('Cookie', driver.cookie)
      .send({ reason: 'Car is already full.' });

    const response = await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/withdraw`)
      .set('Cookie', passenger.cookie);

    expect(response.status).toBe(409);
  });

  it('rejects withdrawing a request that was already withdrawn', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const created = await requestToJoin(ride.id, passenger);
    await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/withdraw`)
      .set('Cookie', passenger.cookie);

    const response = await request(app)
      .patch(`/api/rides/${ride.id}/requests/${created.body.data.id}/withdraw`)
      .set('Cookie', passenger.cookie);

    expect(response.status).toBe(409);
  });
});
