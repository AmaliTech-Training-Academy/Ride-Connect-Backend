import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth.schema';
import { requestStatus } from './enums';
import { rides } from './rides.schema';

/**
 * A passenger's request to join a ride. `passengerId` points at Better
 * Auth's generated `user` table (text id) rather than a standalone `users`
 * table.
 */
export const rideRequests = pgTable(
  'ride_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rideId: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    passengerId: text('passenger_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: requestStatus('status').notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('idx_ride_requests_ride_id').on(table.rideId),
    index('idx_ride_requests_passenger_id').on(table.passengerId),
    unique('unique_ride_request').on(table.rideId, table.passengerId),
  ],
);
