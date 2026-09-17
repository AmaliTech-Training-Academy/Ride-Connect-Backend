import { authedController } from '../lib/http/controller';
import * as rideRequestsService from '../services/rideRequests.service';
import type { RequestIdParams, RideIdParams } from '../validators/rideRequests.validator';

const REQUEST_SUBMITTED = 'Request submitted successfully';
const NO_PENDING_REQUESTS = 'No pending requests for this ride.';
const REQUESTS_FETCHED = 'Requests fetched successfully';
const REQUEST_ACCEPTED = 'Request accepted successfully';
const REQUEST_DECLINED = 'Request declined successfully';

/** POST /api/rides/:rideId/requests — a passenger asks to join an open Ride. */
export const createRequest = authedController<{ params: RideIdParams }>(async (req, res) => {
  const request = await rideRequestsService.createRequest(
    req.validated.params.rideId,
    req.auth.user.id,
  );

  res.customSuccess({
    status: 201,
    message: REQUEST_SUBMITTED,
    data: request,
  });
});

/** GET /api/rides/:rideId/requests — the ride's Driver views its pending requests. */
export const listRideRequests = authedController<{ params: RideIdParams }>(async (req, res) => {
  const requests = await rideRequestsService.listRideRequests(
    req.validated.params.rideId,
    req.auth.user.id,
  );

  res.customSuccess({
    message: requests.length === 0 ? NO_PENDING_REQUESTS : REQUESTS_FETCHED,
    data: requests,
  });
});

/** PATCH /api/rides/:rideId/requests/:requestId/accept — the Driver accepts a request and takes a seat. */
export const acceptRequest = authedController<{ params: RequestIdParams }>(async (req, res) => {
  const request = await rideRequestsService.acceptRequest(
    req.validated.params.rideId,
    req.validated.params.requestId,
    req.auth.user.id,
  );

  res.customSuccess({
    message: REQUEST_ACCEPTED,
    data: request,
  });
});

/** PATCH /api/rides/:rideId/requests/:requestId/decline — the Driver declines a request. */
export const declineRequest = authedController<{ params: RequestIdParams }>(async (req, res) => {
  const request = await rideRequestsService.declineRequest(
    req.validated.params.rideId,
    req.validated.params.requestId,
    req.auth.user.id,
  );

  res.customSuccess({
    message: REQUEST_DECLINED,
    data: request,
  });
});
