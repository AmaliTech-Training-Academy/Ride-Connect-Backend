import { and, asc, eq, gte, ilike, lt, or } from 'drizzle-orm';
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

export const listRides: RequestHandler = async (req, res, next) => {
  try {
    const { date, search } = req.query;

    const conditions = [eq(rides.status, 'OPEN')];

    if (typeof date === 'string' && date.trim().length > 0) {
      const dayStart = new Date(`${date}T00:00:00`);

      if (Number.isNaN(dayStart.getTime())) {
        res.status(400).json({ error: { message: 'Invalid date. Use YYYY-MM-DD.' } });
        return;
      }

      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      conditions.push(gte(rides.departureAt, dayStart), lt(rides.departureAt, dayEnd));
    }

    if (typeof search === 'string' && search.trim().length > 0) {
      const keyword = `%${search.trim()}%`;
      const routeMatch = or(ilike(rides.origin, keyword), ilike(rides.destination, keyword));
      if (routeMatch) {
        conditions.push(routeMatch);
      }
    }

    const results = await db
      .select()
      .from(rides)
      .where(and(...conditions))
      .orderBy(asc(rides.departureAt));

    res.status(200).json({ rides: results });
  } catch (error) {
    next(error);
  }
};
