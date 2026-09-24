import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { closeDb, resetAuthTables, uniqueEmail } from './helpers';

const app = createApp();

const VALID_PASSWORD = 'careful-horse-8';
const NON_EXISTENT_NOTIFICATION_ID = '22222222-2222-4222-8222-222222222222';
const RIDE_ORIGIN = 'Accra';
const RIDE_DESTINATION = 'Kumasi';

interface AuthedUser {
  cookie: string;
  userId: string;
  name: string;
}

interface Notification {
  id: string;
  type: string;
  rideId: string | null;
  requestId: string | null;
  rideOrigin: string | null;
  rideDestination: string | null;
  actorId: string | null;
  actorName: string | null;
  readAt: string | null;
  createdAt: string | null;
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

/** Posts a ride as the given driver via the real endpoint. Defaults to three seats so a test can hold a pending, an accepted and a declined passenger at once. */
async function postRide(
  driver: AuthedUser,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const { date, time } = tomorrow();
  const response = await request(app)
    .post('/api/rides')
    .set('Cookie', driver.cookie)
    .send({
      origin: RIDE_ORIGIN,
      destination: RIDE_DESTINATION,
      departureDate: date,
      departureTime: time,
      availableSeats: 3,
      ...overrides,
    });

  expect(response.status).toBe(201);
  return response.body.data;
}

/** Submits a join request and returns the new request's id. */
async function joinRide(rideId: string, passenger: AuthedUser): Promise<string> {
  const response = await request(app)
    .post(`/api/rides/${rideId}/requests`)
    .set('Cookie', passenger.cookie);

  expect(response.status).toBe(201);
  return response.body.data.id;
}

async function decide(
  rideId: string,
  requestId: string,
  decision: 'accept' | 'decline',
  driver: AuthedUser,
): Promise<void> {
  const patch = request(app)
    .patch(`/api/rides/${rideId}/requests/${requestId}/${decision}`)
    .set('Cookie', driver.cookie);

  // Declining carries a reason the driver must supply; accepting takes no body.
  const response = await (decision === 'decline'
    ? patch.send({ reason: 'No room left on this trip, sorry.' })
    : patch);

  expect(response.status).toBe(200);
}

function withdraw(rideId: string, requestId: string, passenger: AuthedUser) {
  return request(app)
    .patch(`/api/rides/${rideId}/requests/${requestId}/withdraw`)
    .set('Cookie', passenger.cookie);
}

function cancelRide(rideId: string, driver: AuthedUser) {
  return request(app).patch(`/api/rides/${rideId}/cancel`).set('Cookie', driver.cookie);
}

function setStatus(rideId: string, status: string, driver: AuthedUser) {
  return request(app)
    .patch(`/api/rides/${rideId}/status`)
    .set('Cookie', driver.cookie)
    .send({ status });
}

function fetchFeed(user: AuthedUser, query = '') {
  return request(app).get(`/api/notifications${query}`).set('Cookie', user.cookie);
}

/** The caller's notifications, newest first. Asserts the request itself succeeded. */
async function feedOf(user: AuthedUser, query = ''): Promise<Notification[]> {
  const response = await fetchFeed(user, query);
  expect(response.status).toBe(200);

  return response.body.data.items;
}

/** Just the notification types in the caller's feed, newest first. */
async function typesFor(user: AuthedUser, query = ''): Promise<string[]> {
  return (await feedOf(user, query)).map((notification) => notification.type);
}

async function unreadCountOf(user: AuthedUser): Promise<number> {
  const response = await request(app)
    .get('/api/notifications/unread-count')
    .set('Cookie', user.cookie);

  expect(response.status).toBe(200);
  return response.body.data.unreadCount;
}

beforeEach(async () => {
  await resetAuthTables();
});

afterAll(async () => {
  await closeDb();
});

describe('notifications created by ride activity', () => {
  it('tells the driver a passenger asked to join, and tells the passenger nothing', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');

    const requestId = await joinRide(ride.id, passenger);

    const [notification] = await feedOf(driver);
    expect(notification).toMatchObject({
      type: 'RIDE_REQUEST_RECEIVED',
      rideId: ride.id,
      requestId,
      rideOrigin: RIDE_ORIGIN,
      rideDestination: RIDE_DESTINATION,
      actorId: passenger.userId,
      actorName: 'Ada Lovelace',
      readAt: null,
    });
    expect(notification!.createdAt).toBeTruthy();

    expect(await typesFor(passenger)).toEqual([]);
  });

  it('tells the passenger their request was accepted, and not the driver', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const requestId = await joinRide(ride.id, passenger);

    await decide(ride.id, requestId, 'accept', driver);

    expect(await typesFor(passenger)).toEqual(['REQUEST_ACCEPTED']);

    const [notification] = await feedOf(passenger);
    expect(notification).toMatchObject({
      rideId: ride.id,
      requestId,
      actorId: driver.userId,
      actorName: 'Grace Hopper',
      rideOrigin: RIDE_ORIGIN,
      rideDestination: RIDE_DESTINATION,
    });

    // The driver's feed still holds only the join request they were told about earlier.
    expect(await typesFor(driver)).toEqual(['RIDE_REQUEST_RECEIVED']);
  });

  it('tells the passenger their request was declined', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const requestId = await joinRide(ride.id, passenger);

    await decide(ride.id, requestId, 'decline', driver);

    expect(await typesFor(passenger)).toEqual(['REQUEST_DECLINED']);
  });

  it('tells the driver when a confirmed passenger gives up their seat', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const requestId = await joinRide(ride.id, passenger);
    await decide(ride.id, requestId, 'accept', driver);

    const response = await withdraw(ride.id, requestId, passenger);

    expect(response.status).toBe(200);
    expect(await typesFor(driver)).toEqual(['PASSENGER_WITHDREW', 'RIDE_REQUEST_RECEIVED']);
  });

  it('leaves the driver alone when a merely pending request is withdrawn', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const requestId = await joinRide(ride.id, passenger);

    const response = await withdraw(ride.id, requestId, passenger);

    expect(response.status).toBe(200);
    expect(await typesFor(driver)).toEqual(['RIDE_REQUEST_RECEIVED']);
  });

  it('tells everyone still involved when the driver cancels the ride', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const pending = await registerUser('Ada Lovelace');
    const accepted = await registerUser('Alan Turing');
    const declined = await registerUser('Edsger Dijkstra');
    await joinRide(ride.id, pending);
    const acceptedRequest = await joinRide(ride.id, accepted);
    const declinedRequest = await joinRide(ride.id, declined);
    await decide(ride.id, acceptedRequest, 'accept', driver);
    await decide(ride.id, declinedRequest, 'decline', driver);

    const response = await cancelRide(ride.id, driver);

    expect(response.status).toBe(200);
    expect(await typesFor(pending)).toContain('RIDE_CANCELLED');
    expect(await typesFor(accepted)).toContain('RIDE_CANCELLED');
    // The ride ending is not news to someone already turned down.
    expect(await typesFor(declined)).not.toContain('RIDE_CANCELLED');
    // Nor does the driver need telling about their own action.
    expect(await typesFor(driver)).not.toContain('RIDE_CANCELLED');
  });

  it('sends the same cancellation from the status endpoint', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    await joinRide(ride.id, passenger);

    // CANCELLED is reachable through PATCH /rides/:rideId/status as well; both paths notify.
    const response = await setStatus(ride.id, 'CANCELLED', driver);

    expect(response.status).toBe(200);
    expect(await typesFor(passenger)).toContain('RIDE_CANCELLED');
  });

  it('tells confirmed passengers when the driver closes or reopens the ride', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver, { availableSeats: 2 });
    const waiting = await registerUser('Ada Lovelace');
    const confirmed = await registerUser('Alan Turing');
    await joinRide(ride.id, waiting);
    const confirmedRequest = await joinRide(ride.id, confirmed);
    await decide(ride.id, confirmedRequest, 'accept', driver);

    await setStatus(ride.id, 'FULL', driver);
    await setStatus(ride.id, 'OPEN', driver);

    expect(await typesFor(confirmed)).toEqual([
      'RIDE_UPDATED',
      'RIDE_UPDATED',
      'REQUEST_ACCEPTED',
    ]);
    // A passenger with nothing but a pending request has no commitment to be told about.
    expect(await typesFor(waiting)).toEqual([]);
  });
});

describe('GET /api/notifications', () => {
  it('returns the feed newest first, each row carrying its creation time', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    await joinRide(ride.id, await registerUser('Ada Lovelace'));
    await joinRide(ride.id, await registerUser('Alan Turing'));

    const feed = await feedOf(driver);

    expect(feed.map((notification) => notification.actorName)).toEqual([
      'Alan Turing',
      'Ada Lovelace',
    ]);
    expect(feed.every((notification) => notification.createdAt)).toBe(true);
  });

  it('carries the unread count alongside the page', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    await joinRide(ride.id, await registerUser('Ada Lovelace'));
    await joinRide(ride.id, await registerUser('Alan Turing'));
    await joinRide(ride.id, await registerUser('Edsger Dijkstra'));

    const response = await fetchFeed(driver, '?limit=2');

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(2);
    // Unfiltered by the page: the badge reflects everything unread, not just what is on screen.
    expect(response.body.data.unreadCount).toBe(3);
  });

  it('filters to unread only', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    await joinRide(ride.id, await registerUser('Ada Lovelace'));
    await joinRide(ride.id, await registerUser('Alan Turing'));
    const [newest] = await feedOf(driver);
    await request(app)
      .patch(`/api/notifications/${newest!.id}/read`)
      .set('Cookie', driver.cookie);

    const unread = await feedOf(driver, '?unreadOnly=true');

    expect(unread.map((notification) => notification.actorName)).toEqual(['Ada Lovelace']);
  });

  it('pages with limit and offset', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    await joinRide(ride.id, await registerUser('Ada Lovelace'));
    await joinRide(ride.id, await registerUser('Alan Turing'));
    await joinRide(ride.id, await registerUser('Edsger Dijkstra'));

    const firstPage = await feedOf(driver, '?limit=2');
    const secondPage = await feedOf(driver, '?limit=2&offset=2');

    expect(firstPage).toHaveLength(2);
    expect(secondPage).toHaveLength(1);
    expect(secondPage.map((notification) => notification.actorName)).toEqual(['Ada Lovelace']);
  });

  it('rejects an unreadOnly value that is not true or false', async () => {
    const driver = await registerUser('Grace Hopper');

    const response = await fetchFeed(driver, '?unreadOnly=maybe');

    expect(response.status).toBe(400);
  });

  it('rejects a limit beyond the page cap', async () => {
    const driver = await registerUser('Grace Hopper');

    const response = await fetchFeed(driver, '?limit=500');

    expect(response.status).toBe(400);
  });

  it('rejects an unauthenticated caller', async () => {
    const response = await request(app).get('/api/notifications');

    expect(response.status).toBe(401);
  });
});

describe('GET /api/notifications/unread-count', () => {
  it("counts only the caller's own unread notifications", async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const requestId = await joinRide(ride.id, passenger);
    await decide(ride.id, requestId, 'accept', driver);

    // The driver was told about the request, the passenger about the acceptance. Neither
    // sees the other's.
    expect(await unreadCountOf(driver)).toBe(1);
    expect(await unreadCountOf(passenger)).toBe(1);
  });

  it('rejects an unauthenticated caller', async () => {
    const response = await request(app).get('/api/notifications/unread-count');

    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/notifications/:notificationId/read', () => {
  it('marks one notification read and drops the unread count', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    await joinRide(ride.id, await registerUser('Ada Lovelace'));
    const [notification] = await feedOf(driver);

    const response = await request(app)
      .patch(`/api/notifications/${notification!.id}/read`)
      .set('Cookie', driver.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(notification!.id);
    expect(response.body.data.readAt).toBeTruthy();
    expect(await unreadCountOf(driver)).toBe(0);
  });

  it('is idempotent: reading it twice keeps the original timestamp', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    await joinRide(ride.id, await registerUser('Ada Lovelace'));
    const [notification] = await feedOf(driver);

    const first = await request(app)
      .patch(`/api/notifications/${notification!.id}/read`)
      .set('Cookie', driver.cookie);
    const second = await request(app)
      .patch(`/api/notifications/${notification!.id}/read`)
      .set('Cookie', driver.cookie);

    expect(second.status).toBe(200);
    expect(second.body.data.readAt).toBe(first.body.data.readAt);
  });

  it("does not reveal another user's notification", async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    await joinRide(ride.id, await registerUser('Ada Lovelace'));
    const [notification] = await feedOf(driver);
    const stranger = await registerUser('Alan Turing');

    const response = await request(app)
      .patch(`/api/notifications/${notification!.id}/read`)
      .set('Cookie', stranger.cookie);

    expect(response.status).toBe(404);
  });

  it('rejects a notification id that is not a uuid, and one that does not exist', async () => {
    const driver = await registerUser('Grace Hopper');

    const malformed = await request(app)
      .patch('/api/notifications/not-a-uuid/read')
      .set('Cookie', driver.cookie);
    const missing = await request(app)
      .patch(`/api/notifications/${NON_EXISTENT_NOTIFICATION_ID}/read`)
      .set('Cookie', driver.cookie);

    expect(malformed.status).toBe(400);
    expect(missing.status).toBe(404);
  });

  it('rejects an unauthenticated caller', async () => {
    const response = await request(app).patch(
      `/api/notifications/${NON_EXISTENT_NOTIFICATION_ID}/read`,
    );

    expect(response.status).toBe(401);
  });
});

describe('PATCH /api/notifications/read-all', () => {
  it('marks every unread notification read and reports how many', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    await joinRide(ride.id, await registerUser('Ada Lovelace'));
    await joinRide(ride.id, await registerUser('Alan Turing'));

    const response = await request(app)
      .patch('/api/notifications/read-all')
      .set('Cookie', driver.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.markedCount).toBe(2);
    expect(await unreadCountOf(driver)).toBe(0);
  });

  it('reports zero when nothing was unread, rather than failing', async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    await joinRide(ride.id, await registerUser('Ada Lovelace'));
    await request(app).patch('/api/notifications/read-all').set('Cookie', driver.cookie);

    const response = await request(app)
      .patch('/api/notifications/read-all')
      .set('Cookie', driver.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.markedCount).toBe(0);
  });

  it("leaves another user's notifications unread", async () => {
    const driver = await registerUser('Grace Hopper');
    const ride = await postRide(driver);
    const passenger = await registerUser('Ada Lovelace');
    const requestId = await joinRide(ride.id, passenger);
    await decide(ride.id, requestId, 'accept', driver);

    await request(app).patch('/api/notifications/read-all').set('Cookie', driver.cookie);

    expect(await unreadCountOf(driver)).toBe(0);
    expect(await unreadCountOf(passenger)).toBe(1);
  });

  it('rejects an unauthenticated caller', async () => {
    const response = await request(app).patch('/api/notifications/read-all');

    expect(response.status).toBe(401);
  });
});
