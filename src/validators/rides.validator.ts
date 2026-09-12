import { z } from 'zod';

const MIN_SEATS = 1;
const MAX_SEATS = 8;

const SEATS_OUT_OF_RANGE = `Available seats must be between ${MIN_SEATS} and ${MAX_SEATS}.`;

const requiredOr = (required: string, malformed: string) => (issue: { input: unknown }) =>
  issue.input === undefined || issue.input === '' ? required : malformed;

/**
 * Both halves of the departure arrive without a zone, so they are read as UTC rather
 * than as wall-clock time on whichever host happens to run the process.
 */
const toDepartureInstant = (date: string, time: string): Date => new Date(`${date}T${time}Z`);

export const createRideSchema = z
  .object({
    origin: z.string('Origin is required.').trim().min(1, 'Origin is required.'),
    destination: z.string('Destination is required.').trim().min(1, 'Destination is required.'),
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
    seatsOffered: ride.availableSeats,
    departureAt: toDepartureInstant(ride.departureDate, ride.departureTime),
  }));

export type CreateRideInput = z.infer<typeof createRideSchema>;
