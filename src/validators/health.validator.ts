import { z } from 'zod';

export const healthResponseSchema = z.object({
  uptime: z.number(),
  timestamp: z.iso.datetime(),
});
