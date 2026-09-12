export const RIDE_ERROR_MESSAGES = {
  ORIGIN_REQUIRED: 'Origin is required.',
  DESTINATION_REQUIRED: 'Destination is required.',
  DESTINATION_SAME_AS_ORIGIN: 'Destination must be different from origin.',
  DEPARTURE_DATE_REQUIRED: 'Departure date is required.',
  DEPARTURE_TIME_REQUIRED: 'Departure time is required.',
  DEPARTURE_DATETIME_INVALID: 'Departure date or time is invalid.',
  DEPARTURE_IN_PAST: 'Departure date cannot be in the past.',
  AVAILABLE_SEATS_REQUIRED: 'Available seats is required.',
  availableSeatsOutOfRange: (min: number, max: number) =>
    `Available seats must be between ${min} and ${max}.`,
};
