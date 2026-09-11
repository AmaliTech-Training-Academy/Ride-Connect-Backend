import type { RequestHandler } from 'express';

import { db } from '../db';
import { rides } from '../db/schema';

const MIN_SEATS = 1;
const MAX_SEATS = 8;

interface RideFieldErrors {
  origin?: string;
  destination?: string;
  departureDate?: string;
  departureTime?: string;
  availableSeats?: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export const createRide: RequestHandler = async (req, res, next) => {
  try {
    const { origin, destination, departureDate, departureTime, availableSeats } = req.body ?? {};

    const errors: RideFieldErrors = {};

    if (!isNonEmptyString(origin)) {
      errors.origin = 'Origin is required.';
    }

    if (!isNonEmptyString(destination)) {
      errors.destination = 'Destination is required.';
    }

    if (
      isNonEmptyString(origin) &&
      isNonEmptyString(destination) &&
      origin.trim().toLowerCase() === destination.trim().toLowerCase()
    ) {
      errors.destination = 'Destination must be different from origin.';
    }

    if (!isNonEmptyString(departureDate)) {
      errors.departureDate = 'Departure date is required.';
    }

    if (!isNonEmptyString(departureTime)) {
      errors.departureTime = 'Departure time is required.';
    }

    let departureAt: Date | undefined;
    const hasDateAndTime =
      isNonEmptyString(departureDate) && isNonEmptyString(departureTime);

    if (!errors.departureDate && !errors.departureTime && hasDateAndTime) {
      const candidate = new Date(`${departureDate}T${departureTime}`);

      if (Number.isNaN(candidate.getTime())) {
        errors.departureDate = 'Departure date or time is invalid.';
      } else if (candidate.getTime() < Date.now()) {
        errors.departureDate = 'Departure date cannot be in the past.';
      } else {
        departureAt = candidate;
      }
    }

    if (availableSeats === undefined || availableSeats === null || availableSeats === '') {
      errors.availableSeats = 'Available seats is required.';
    } else {
      const seats = Number(availableSeats);
      if (!Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS) {
        errors.availableSeats = `Available seats must be between ${MIN_SEATS} and ${MAX_SEATS}.`;
      }
    }

    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', fields: errors } });
      return;
    }

    const seats = Number(availableSeats);

    const [ride] = await db
      .insert(rides)
      .values({
        driverId: res.locals.userId as string,
        origin: origin.trim(),
        destination: destination.trim(),
        departureAt: departureAt as Date,
        totalSeats: seats,
        availableSeats: seats,
      })
      .returning();

    res.status(201).json({ ride });
  } catch (error) {
    next(error);
  }
};
