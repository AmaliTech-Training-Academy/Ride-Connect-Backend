import { z } from 'zod';

import { requestStatus } from '../db/schema';

export const rideIdParamsSchema = z.object({
  rideId: z.uuid('Invalid ride id.'),
});

export type RideIdParams = z.infer<typeof rideIdParamsSchema>;

export const requestIdParamsSchema = z.object({
  rideId: z.uuid('Invalid ride id.'),
  requestId: z.uuid('Invalid request id.'),
});

export type RequestIdParams = z.infer<typeof requestIdParamsSchema>;

/** Body for declining a request or asking the driver to reconsider: a short reason is required. */
export const reasonBodySchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required.').max(500, 'Reason must be 500 characters or fewer.'),
});

export type ReasonBody = z.infer<typeof reasonBodySchema>;

export const rideRequestResponseSchema = z.object({
  id: z.uuid(),
  rideId: z.uuid(),
  passengerId: z.uuid(),
  status: z.enum(requestStatus.enumValues),
  createdAt: z.iso.datetime().nullable(),
});

/** A request as the driver sees it: the passenger is named, the ride implied by the URL. */
export const rideRequestSummarySchema = z.object({
  id: z.uuid(),
  passengerId: z.uuid(),
  passengerName: z.string(),
  passengerImage: z.string().nullable(),
  status: z.enum(requestStatus.enumValues),
  isRerequest: z.boolean(),
  rejectionReason: z.string().nullable(),
  rerequestReason: z.string().nullable(),
  createdAt: z.iso.datetime().nullable(),
});

/** What accepting or declining returns. Narrower than the create response: no `createdAt`. */
export const rideRequestDecisionSchema = z.object({
  id: z.uuid(),
  rideId: z.uuid(),
  passengerId: z.uuid(),
  status: z.enum(requestStatus.enumValues),
});
