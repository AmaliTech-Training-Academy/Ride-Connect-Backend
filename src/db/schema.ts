/**
 * Drizzle schema for RideConnect.
 *
 * Contains both the domain tables (`users`, `rides`, `ride_requests`) and the
 * tables better-auth requires (`account`, `session`, `verification`).
 *
 * Note on passwords: `users` deliberately has no `password_hash` column.
 * better-auth stores the credential hash on the `account` row whose
 * `provider_id` is `'credential'`, never on the user record itself.
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** Lifecycle of a posted ride. */
export const rideStatus = pgEnum('ride_status', ['OPEN', 'FULL', 'CANCELLED', 'COMPLETED']);

/** Lifecycle of a passenger's request to join a ride. */
export const requestStatus = pgEnum('request_status', [
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'WITHDRAWN',
]);

/**
 * Application users. Mapped onto better-auth's `user` model via `modelName`
 * in the auth config, which is why the auth-owned `email_verified` and
 * `image` fields live here alongside the domain columns.
 */
export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
});

/** A ride offered by a driver. */
export const rides = pgTable(
  'rides',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    origin: varchar('origin', { length: 255 }).notNull(),
    destination: varchar('destination', { length: 255 }).notNull(),
    departureAt: timestamp('departure_at', { withTimezone: true }).notNull(),
    totalSeats: integer('total_seats').notNull(),
    availableSeats: integer('available_seats').notNull(),
    status: rideStatus('status').notNull().default('OPEN'),
    createdAt: timestamp('created_at', { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check('check_total_seats', sql`${table.totalSeats} BETWEEN 1 AND 8`),
    check(
      'check_available_seats',
      sql`${table.availableSeats} >= 0 AND ${table.availableSeats} <= ${table.totalSeats}`,
    ),
    check(
      'check_origin_destination',
      sql`LOWER(TRIM(${table.origin})) <> LOWER(TRIM(${table.destination}))`,
    ),
    index('idx_rides_driver_id').on(table.driverId),
    index('idx_rides_departure_at').on(table.departureAt),
    index('idx_rides_status').on(table.status),
  ],
);

/** A passenger's request to take a seat on a ride. */
export const rideRequests = pgTable(
  'ride_requests',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    rideId: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    passengerId: uuid('passenger_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: requestStatus('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    unique('unique_ride_request').on(table.rideId, table.passengerId),
    index('idx_ride_requests_ride_id').on(table.rideId),
    index('idx_ride_requests_passenger_id').on(table.passengerId),
  ],
);

/**
 * better-auth credential/provider records. For email+password sign-up
 * better-auth writes one row with `provider_id = 'credential'` and stores the
 * scrypt hash (`salt:hash`, hex) in `password`.
 *
 * The OAuth token columns are unused by this story (no social providers are
 * configured) but better-auth validates the Drizzle schema against its full
 * account model at startup and refuses to run if they are absent.
 */
export const account = pgTable(
  'account',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    password: text('password'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    createdAt: timestamp('created_at', { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('idx_account_user_id').on(table.userId)],
);

/** An authenticated session issued by better-auth. */
export const session = pgTable(
  'session',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_session_user_id').on(table.userId),
    index('idx_session_token').on(table.token),
  ],
);

/**
 * Short-lived tokens better-auth issues for verification-style flows.
 *
 * `updated_at` is not used by this story but is part of better-auth's
 * verification model, which it validates at startup.
 */
export const verification = pgTable('verification', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`),
});
