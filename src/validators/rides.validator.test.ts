import { z } from 'zod';

import { createRideSchema } from './rides.validator';

const IN_THE_FUTURE = '2999-01-01';

function fieldErrors(input: unknown): Record<string, string[] | undefined> {
  const result = createRideSchema.safeParse(input);

  if (result.success) {
    throw new Error('Expected the schema to reject this input.');
  }

  return z.flattenError(result.error).fieldErrors;
}

function validRide(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    origin: 'Accra',
    destination: 'Kumasi',
    departureDate: IN_THE_FUTURE,
    departureTime: '09:30',
    availableSeats: 3,
    ...overrides,
  };
}

describe('createRideSchema', () => {
  it('reads the departure as UTC rather than as local wall-clock time', () => {
    const ride = createRideSchema.parse(validRide());

    expect(ride.departureAt.toISOString()).toBe('2999-01-01T09:30:00.000Z');
  });

  it('trims the endpoints and coerces the seat count a form would send as text', () => {
    const ride = createRideSchema.parse(validRide({ origin: '  Accra  ', availableSeats: '3' }));

    expect(ride).toMatchObject({ origin: 'Accra', destination: 'Kumasi', availableSeats: 3 });
  });

  it('drops keys the schema does not name', () => {
    const ride = createRideSchema.parse(validRide({ status: 'COMPLETED' }));

    expect(ride).not.toHaveProperty('status');
  });

  it('names every missing field', () => {
    expect(fieldErrors({})).toEqual({
      origin: ['Origin is required.'],
      destination: ['Destination is required.'],
      departureDate: ['Departure date is required.'],
      departureTime: ['Departure time is required.'],
      availableSeats: ['Available seats is required.'],
    });
  });

  it('treats a blank endpoint as a missing one', () => {
    expect(fieldErrors(validRide({ origin: '   ' })).origin).toEqual(['Origin is required.']);
  });

  it('separates a malformed departure from an absent one', () => {
    expect(fieldErrors(validRide({ departureDate: '01/01/2999' })).departureDate).toEqual([
      'Departure date or time is invalid.',
    ]);
    expect(fieldErrors(validRide({ departureTime: '25:00' })).departureTime).toEqual([
      'Departure date or time is invalid.',
    ]);
  });

  it('rejects a calendar date that does not exist', () => {
    expect(fieldErrors(validRide({ departureDate: '2999-02-30' })).departureDate).toBeDefined();
  });

  it('blames the destination when it matches the origin, whatever the casing', () => {
    expect(fieldErrors(validRide({ destination: 'accra' })).destination).toEqual([
      'Destination must be different from origin.',
    ]);
  });

  it('rejects a departure that has already passed', () => {
    expect(fieldErrors(validRide({ departureDate: '2020-01-01' })).departureDate).toEqual([
      'Departure date cannot be in the past.',
    ]);
  });

  it('holds the seat count to the range the vehicle can carry', () => {
    const outOfRange = ['Available seats must be between 1 and 8.'];

    expect(fieldErrors(validRide({ availableSeats: 0 })).availableSeats).toEqual(outOfRange);
    expect(fieldErrors(validRide({ availableSeats: 9 })).availableSeats).toEqual(outOfRange);
    expect(fieldErrors(validRide({ availableSeats: 2.5 })).availableSeats).toEqual(outOfRange);
  });
});
