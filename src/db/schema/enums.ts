import { pgEnum } from 'drizzle-orm/pg-core';

export const rideStatus = pgEnum('ride_status', ['OPEN', 'FULL', 'CANCELLED', 'COMPLETED']);

export const requestStatus = pgEnum('request_status', [
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'WITHDRAWN',
]);
