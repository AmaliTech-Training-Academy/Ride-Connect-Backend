import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { rideStatus } from './enums';
import { user } from './auth.schema';

/**
 * A ride offered by a driver. `driverId` points at Better Auth's generated
 * `user` table (text id) rather than a standalone `users` table.
 */
export const rides = pgTable(
  'rides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    driverId: text('driver_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    origin: varchar('origin', { length: 255 }).notNull(),
    destination: varchar('destination', { length: 255 }).notNull(),
    departureAt: timestamp('departure_at', { withTimezone: true }).notNull(),
    totalSeats: integer('total_seats').notNull(),
    availableSeats: integer('available_seats').notNull(),
    status: rideStatus('status').notNull().default('OPEN'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_rides_driver_id').on(table.driverId),
    index('idx_rides_departure_at').on(table.departureAt),
    index('idx_rides_status').on(table.status),
    check('check_total_seats', sql`${table.totalSeats} BETWEEN 1 AND 8`),
    check(
      'check_available_seats',
      sql`${table.availableSeats} >= 0 AND ${table.availableSeats} <= ${table.totalSeats}`,
    ),
    check(
      'check_origin_destination',
      sql`LOWER(TRIM(${table.origin})) <> LOWER(TRIM(${table.destination}))`,
    ),
  ],
);
