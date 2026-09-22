import { authedController } from '../lib/http/controller';
import * as ridesService from '../services/rides.service';
import type { RideIdParams } from '../validators/rideRequests.validator';
import type { CreateRideInput, ListRidesQuery, UpdateRideStatusInput } from '../validators/rides.validator';

const RIDE_STATUS_UPDATED = 'Ride status updated successfully';

/** POST /api/rides — publishes a Ride the authenticated User is driving. */
export const createRide = authedController<{ body: CreateRideInput }>(async (req, res) => {
  const ride = await ridesService.createRide(req.auth.user.id, req.validated.body);

  res.customSuccess({
    status: 201,
    message: 'Ride created successfully',
    data: { ...ride, driverName: req.auth.user.name },
  });
});

function noRidesMessage(filters: ListRidesQuery): string {
  if (filters.date) {
    return 'No rides found for this date.';
  }

  if (filters.search) {
    return 'No rides found for this route.';
  }

  return 'No rides found.';
}

/** GET /api/rides — browses open Rides, optionally filtered by day or route keyword. Requires authentication. */
export const listRides = authedController<{ query: ListRidesQuery }>(async (req, res) => {
  const rides = await ridesService.listRides(req.validated.query);

  res.customSuccess({
    message: rides.length === 0 ? noRidesMessage(req.validated.query) : 'Rides fetched successfully',
    data: rides,
  });
});

/**
 * GET /api/rides/mine — the caller's own rides, split into ones they drive (with pending
 * requests and confirmed passengers) and ones they've requested to join (with their own
 * request status).
 */
export const listMyRides = authedController(async (req, res) => {
  const rides = await ridesService.listMyRides(req.auth.user.id);

  res.customSuccess({
    message: 'Your rides were fetched successfully',
    data: rides,
  });
});

/** PATCH /api/rides/:rideId/cancel — driver cancels one of their own rides. */
export const cancelRide = authedController<{ params: RideIdParams }>(async (req, res) => {
  const ride = await ridesService.cancelRide(req.validated.params.rideId, req.auth.user.id);

  res.customSuccess({
    message: 'Ride cancelled successfully',
    data: ride,
  });
});

/** PATCH /api/rides/:rideId/status — the Driver manually closes, cancels, or reopens their Ride. */
export const updateRideStatus = authedController<{ params: RideIdParams; body: UpdateRideStatusInput }>(
  async (req, res) => {
    const ride = await ridesService.updateRideStatus(
      req.validated.params.rideId,
      req.auth.user.id,
      req.validated.body.status,
    );

    res.customSuccess({
      message: RIDE_STATUS_UPDATED,
      data: ride,
    });
  },
);
