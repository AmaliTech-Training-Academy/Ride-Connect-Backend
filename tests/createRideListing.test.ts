import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { closeDb, resetAuthTables, uniqueEmail } from './helpers';

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

beforeEach(async () => {
  await resetAuthTables();
});

afterAll(async () => {
  await closeDb();
});

describe('POST /rides then GET /rides', () => {
  it('POST /api/rides returns 201 and the created ride appears in GET /api/rides with correct fields', async () => {
    const driverName = 'Yaa Asantewaa';
    const driverCookie = await registerUser(driverName);

    const payload = {
      origin: 'Accra',
      destination: 'Kumasi',
      departureDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      departureTime: '09:30',
      availableSeats: 3,
      office: 'KUMASI',
    };

    const created = await request(app).post('/api/rides').set('Cookie', driverCookie).send(payload);
    expect(created.status).toBe(201);

    // Browsed by a different colleague, the way it is for anyone reading the listing.
    const colleagueCookie = await registerUser('Kwame Nkrumah');

    const listing = await request(app).get('/api/rides').set('Cookie', colleagueCookie);
    expect(listing.status).toBe(200);

    // Found by the id the POST returned, not by array position.
    const listedRide = listing.body.data.find((ride: { id: string }) => ride.id === created.body.data.id);
    expect(listedRide, 'the ride just created should appear in the listing').toBeDefined();

    expect(listedRide).toMatchObject({
      origin: payload.origin,
      destination: payload.destination,
      // A fresh ride has every offered seat still free. The API names these
      // `totalSeats`/`availableSeats`; the POST payload calls it `availableSeats`.
      totalSeats: payload.availableSeats,
      availableSeats: payload.availableSeats,
      status: 'OPEN',
    });

    // The listing resolves the driver through a join, so the name must be the
    // one on the account that posted the ride.
    expect(listedRide.driverName).toBe(driverName);
    expect(listedRide.driverName).toBe(created.body.data.driverName);

    // The payload sends a date and a time; the API stores one UTC instant which
    // both endpoints render as an ISO string. Compare instants, not renderings.
    const submittedDeparture = Date.parse(`${payload.departureDate}T${payload.departureTime}:00Z`);
    expect(Date.parse(listedRide.departureAt)).toBe(submittedDeparture);
    expect(Date.parse(listedRide.departureAt)).toBe(Date.parse(created.body.data.departureAt));
  });
});
