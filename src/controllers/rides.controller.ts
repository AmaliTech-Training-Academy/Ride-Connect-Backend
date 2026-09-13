import { db } from '../db';
import { rides } from '../db/schema';
import { authedController } from '../lib/http/controller';
import { RIDE_ERROR_MESSAGES } from './rides.messages';

const MIN_SEATS = 1;
const MAX_SEATS = 8;

interface RideFieldErrors {
  origin?: string[];
  destination?: string[];
  departureDate?: string[];
  departureTime?: string[];
  availableSeats?: string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** POST /rides — publishes a Ride the authenticated User is driving. */
export const createRide = authedController(async (req, res) => {
  const { origin, destination, departureDate, departureTime, availableSeats } = req.body ?? {};

  const errors: RideFieldErrors = {};

  if (!isNonEmptyString(origin)) {
    errors.origin = [RIDE_ERROR_MESSAGES.ORIGIN_REQUIRED];
  }

  if (!isNonEmptyString(destination)) {
    errors.destination = [RIDE_ERROR_MESSAGES.DESTINATION_REQUIRED];
  }

  if (
    isNonEmptyString(origin) &&
    isNonEmptyString(destination) &&
    origin.trim().toLowerCase() === destination.trim().toLowerCase()
  ) {
    errors.destination = [RIDE_ERROR_MESSAGES.DESTINATION_SAME_AS_ORIGIN];
  }

  if (!isNonEmptyString(departureDate)) {
    errors.departureDate = [RIDE_ERROR_MESSAGES.DEPARTURE_DATE_REQUIRED];
  }

  if (!isNonEmptyString(departureTime)) {
    errors.departureTime = [RIDE_ERROR_MESSAGES.DEPARTURE_TIME_REQUIRED];
  }

  let departureAt: Date | undefined;
  const hasDateAndTime = isNonEmptyString(departureDate) && isNonEmptyString(departureTime);

  if (!errors.departureDate && !errors.departureTime && hasDateAndTime) {
    const candidate = new Date(`${departureDate}T${departureTime}`);

    if (Number.isNaN(candidate.getTime())) {
      errors.departureDate = [RIDE_ERROR_MESSAGES.DEPARTURE_DATETIME_INVALID];
    } else if (candidate.getTime() < Date.now()) {
      errors.departureDate = [RIDE_ERROR_MESSAGES.DEPARTURE_IN_PAST];
    } else {
      departureAt = candidate;
    }
  }

  if (availableSeats === undefined || availableSeats === null || availableSeats === '') {
    errors.availableSeats = [RIDE_ERROR_MESSAGES.AVAILABLE_SEATS_REQUIRED];
  } else {
    const seats = Number(availableSeats);
    if (!Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS) {
      errors.availableSeats = [RIDE_ERROR_MESSAGES.availableSeatsOutOfRange(MIN_SEATS, MAX_SEATS)];
    }
  }

  if (Object.keys(errors).length > 0) {
    res.customInvalid({ data: { fields: errors } });
    return;
  }

  const seats = Number(availableSeats);

  const [ride] = await db
    .insert(rides)
    .values({
      driverId: req.auth.user.id,
      origin: origin.trim(),
      destination: destination.trim(),
      departureAt: departureAt as Date,
      totalSeats: seats,
      availableSeats: seats,
    })
    .returning();

  res.customSuccess({
    status: 201,
    message: 'Ride created successfully',
    data: ride,
  });
});
