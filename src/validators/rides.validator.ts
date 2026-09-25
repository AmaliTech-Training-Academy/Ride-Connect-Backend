import { z } from 'zod';

import { requestStatus, rideStatus } from '../db/schema';

const MIN_SEATS = 1;
const MAX_SEATS = 8;

const SEATS_OUT_OF_RANGE = `Available seats must be between ${MIN_SEATS} and ${MAX_SEATS}.`;

const requiredOr = (required: string, malformed: string) => (issue: { input: unknown }) =>
  issue.input === undefined || issue.input === '' ? required : malformed;

const toDepartureInstant = (date: string, time: string): Date => new Date(`${date}T${time}Z`);

export const createRideSchema = z
  .object({
    origin: z.string('Origin is required.').trim().min(1, 'Origin is required.'),
    destination: z.string('Destination is required.').trim().min(1, 'Destination is required.'),
    routeDescription: z
      .string()
      .trim()
      .max(500, 'Route description must be 500 characters or fewer.')
      .optional()
      .transform((value) => (value ? value : undefined)),
    departureDate: z.iso.date({
      error: requiredOr('Departure date is required.', 'Departure date or time is invalid.'),
    }),
    departureTime: z.iso.time({
      error: requiredOr('Departure time is required.', 'Departure date or time is invalid.'),
    }),
    availableSeats: z.coerce
      .number('Available seats is required.')
      .int(SEATS_OUT_OF_RANGE)
      .min(MIN_SEATS, SEATS_OUT_OF_RANGE)
      .max(MAX_SEATS, SEATS_OUT_OF_RANGE),
  })
  .superRefine((ride, ctx) => {
    if (ride.origin.toLowerCase() === ride.destination.toLowerCase()) {
      ctx.addIssue({
        code: 'custom',
        path: ['destination'],
        message: 'Destination must be different from origin.',
      });
    }

    if (toDepartureInstant(ride.departureDate, ride.departureTime).getTime() < Date.now()) {
      ctx.addIssue({
        code: 'custom',
        path: ['departureDate'],
        message: 'Departure date cannot be in the past.',
      });
    }
  })
  .transform((ride) => ({
    origin: ride.origin,
    destination: ride.destination,
    routeDescription: ride.routeDescription,
    seatsOffered: ride.availableSeats,
    departureAt: toDepartureInstant(ride.departureDate, ride.departureTime),
  }));

export type CreateRideInput = z.infer<typeof createRideSchema>;

export const listRidesSchema = z.object({
  date: z.iso.date({ error: 'Invalid date. Use YYYY-MM-DD.' }).optional(),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type ListRidesQuery = z.infer<typeof listRidesSchema>;

export const rideResponseSchema = z.object({
  id: z.uuid(),
  driverId: z.uuid(),
  driverName: z.string(),
  driverImage: z.string().nullable(),
  origin: z.string(),
  destination: z.string(),
  routeDescription: z.string().nullable(),
  departureAt: z.iso.datetime(),
  totalSeats: z.number().int(),
  availableSeats: z.number().int(),
  status: z.enum(rideStatus.enumValues),
  createdAt: z.iso.datetime().nullable(),
});

export const updateRideStatusSchema = z.object({
  status: z.enum(['OPEN', 'FULL', 'CANCELLED'], {
    error: 'Status must be one of OPEN, FULL, or CANCELLED.',
  }),
});

export type UpdateRideStatusInput = z.infer<typeof updateRideStatusSchema>;

/** What a status change returns: the ride's new standing, not the whole ride. */
export const rideStatusResponseSchema = z.object({
  id: z.uuid(),
  driverId: z.uuid(),
  status: z.enum(rideStatus.enumValues),
  availableSeats: z.number().int(),
});

/** A pending join request as the driver sees it on their dashboard. */
export const pendingRequestSummarySchema = z.object({
  id: z.uuid(),
  passengerId: z.uuid(),
  passengerName: z.string(),
  passengerImage: z.string().nullable(),
  createdAt: z.iso.datetime().nullable(),
});

/** A passenger holding an accepted seat, as the driver sees it on their dashboard. */
export const confirmedPassengerSchema = z.object({
  id: z.uuid(),
  passengerId: z.uuid(),
  passengerName: z.string(),
  passengerImage: z.string().nullable(),
});

/** A ride the caller drives, with who's waiting on it and who's confirmed. */
export const drivingRideResponseSchema = rideResponseSchema.extend({
  pendingRequests: z.array(pendingRequestSummarySchema),
  confirmedPassengers: z.array(confirmedPassengerSchema),
});

/** A ride the caller has requested to join, carrying their own request's status. */
export const joinedRideResponseSchema = rideResponseSchema.extend({
  requestId: z.uuid(),
  requestStatus: z.enum(requestStatus.enumValues),
  requestedAt: z.iso.datetime().nullable(),
  rejectionReason: z.string().nullable(),
  rerequestCount: z.number().int(),
});

/** The dashboard split: rides the caller drives and rides they've requested to join, each upcoming and past. */
export const myRidesResponseSchema = z.object({
  driving: z.array(drivingRideResponseSchema),
  joined: z.array(joinedRideResponseSchema),
  pastAndCancelled: z.array(drivingRideResponseSchema),
  joinedPastAndCancelled: z.array(joinedRideResponseSchema),
});

/** A cancelled ride. The driver is the caller, so the row is returned without their name or image. */
export const cancelledRideResponseSchema = rideResponseSchema.omit({ driverName: true, driverImage: true });
