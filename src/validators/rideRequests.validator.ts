import { z } from 'zod';

export const rideIdParamsSchema = z.object({
  rideId: z.uuid('Invalid ride id.'),
});

export type RideIdParams = z.infer<typeof rideIdParamsSchema>;

export const requestIdParamsSchema = z.object({
  rideId: z.uuid('Invalid ride id.'),
  requestId: z.uuid('Invalid request id.'),
});

export type RequestIdParams = z.infer<typeof requestIdParamsSchema>;
