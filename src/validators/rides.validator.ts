import { z } from 'zod';

import { office, requestStatus, rideStatus } from '../db/schema';

const MIN_SEATS = 1;
const MAX_SEATS = 8;

const SEATS_OUT_OF_RANGE = `Available seats must be between ${MIN_SEATS} and ${MAX_SEATS}.`;
const INVALID_OFFICE = 'Office must be one of KUMASI, ACCRA, or TAKORADI.';
const MAX_WAYPOINTS = 8;

const latitude = (label: string) =>
  z
    .number(`${label} must be a number.`)
    .min(-90, `${label} must be between -90 and 90.`)
    .max(90, `${label} must be between -90 and 90.`);

const longitude = (label: string) =>
  z
    .number(`${label} must be a number.`)
    .min(-180, `${label} must be between -180 and 180.`)
    .max(180, `${label} must be between -180 and 180.`);

const waypointSchema = z.object({
  name: z.string('Waypoint name is required.').trim().min(1, 'Waypoint name is required.').max(255),
  lat: latitude('Waypoint latitude'),
  lng: longitude('Waypoint longitude'),
  // A pin the driver dropped by hand has no Google place, so placeId can be null or left out.
  placeId: z
    .string('Waypoint placeId must be a string or null.')
    .trim()
    .min(1, 'Waypoint placeId cannot be empty.')
    .nullable()
    .default(null),
});

const requiredOr = (required: string, malformed: string) => (issue: { input: unknown }) =>
  issue.input === undefined || issue.input === '' ? required : malformed;

export const toDepartureInstant =(date: string, time: string): Date => new Date(`${date}T${time}Z`);

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
    office: z.enum(office.enumValues, { error: requiredOr('Office is required.', INVALID_OFFICE) }),
    originLat: latitude('Origin latitude').optional(),
    originLng: longitude('Origin longitude').optional(),
    destinationLat: latitude('Destination latitude').optional(),
    destinationLng: longitude('Destination longitude').optional(),
    waypoints: z
      .array(waypointSchema, 'Waypoints must be a list.')
      .max(MAX_WAYPOINTS, `A ride can have at most ${MAX_WAYPOINTS} waypoints.`)
      .optional(),
    routePolyline: z
      .string('Route polyline must be a string.')
      .trim()
      .min(1, 'Route polyline cannot be empty.')
      .optional(),
  })
  .superRefine((ride, ctx) => {
    // The route is saved whole or not at all, so the map never gets half a route to draw.
    const routeFields = [
      ride.originLat,
      ride.originLng,
      ride.destinationLat,
      ride.destinationLng,
      ride.routePolyline,
    ];
    const sent = routeFields.filter((value) => value !== undefined).length;
    if (sent !== 0 && sent !== routeFields.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['originLat'],
        message: 'Send originLat, originLng, destinationLat, destinationLng and routePolyline together.',
      });
    }

    // Stops only mean something on a route, so waypoints can't be sent without one.
    if (sent === 0 && ride.waypoints && ride.waypoints.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['waypoints'],
        message: 'Waypoints can only be sent with the route (coordinates and routePolyline).',
      });
    }

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
    office: ride.office,
    originLat: ride.originLat ?? null,
    originLng: ride.originLng ?? null,
    destinationLat: ride.destinationLat ?? null,
    destinationLng: ride.destinationLng ?? null,
    waypoints: ride.waypoints ?? [],
    routePolyline: ride.routePolyline ?? null,
  }));

export type CreateRideInput = z.infer<typeof createRideSchema>;

const TOTAL_SEATS_OUT_OF_RANGE = `Total seats must be between ${MIN_SEATS} and ${MAX_SEATS}.`;

/**
 * Body for editing a ride. Every field is optional, only what is sent gets changed. Checks that
 * need the ride's current values (origin vs destination, departure in the past, seats already
 * taken) are done in the service, since only one side of the pair may have been sent.
 */
export const updateRideSchema = z
  .object({
    origin: z.string().trim().min(1, 'Origin cannot be empty.').optional(),
    destination: z.string().trim().min(1, 'Destination cannot be empty.').optional(),
    routeDescription: z
      .string()
      .trim()
      .max(500, 'Route description must be 500 characters or fewer.')
      .optional(),
    departureDate: z.iso.date({ error: 'Departure date is invalid. Use YYYY-MM-DD.' }).optional(),
    departureTime: z.iso.time({ error: 'Departure time is invalid. Use HH:MM.' }).optional(),
    totalSeats: z.coerce
      .number()
      .int(TOTAL_SEATS_OUT_OF_RANGE)
      .min(MIN_SEATS, TOTAL_SEATS_OUT_OF_RANGE)
      .max(MAX_SEATS, TOTAL_SEATS_OUT_OF_RANGE)
      .optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Send at least one field to update.',
  });

export type UpdateRideInput = z.infer<typeof updateRideSchema>;

export const listRidesSchema = z.object({
  date: z.iso.date({ error: 'Invalid date. Use YYYY-MM-DD.' }).optional(),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  office: z.enum(office.enumValues, { error: INVALID_OFFICE }).optional(),
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
  office: z.enum(office.enumValues),
  originLat: z.number().nullable(),
  originLng: z.number().nullable(),
  destinationLat: z.number().nullable(),
  destinationLng: z.number().nullable(),
  waypoints: z.array(waypointSchema),
  routePolyline: z.string().nullable(),
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
