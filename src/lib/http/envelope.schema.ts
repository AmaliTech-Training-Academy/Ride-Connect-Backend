import { z, type ZodType } from 'zod';

import { registry } from '../openapi-registry';

interface EnvelopeOptions {
  totalCount?: boolean;
}

/** Wraps a route's `data` shape in the envelope `res.customSuccess` sends. */
export const successEnvelope = <T extends ZodType>(
  data: T,
  options: EnvelopeOptions = {},
): ZodType =>
  z.object({
    success: z.literal(true),
    message: z.string(),
    data,
    ...(options.totalCount && { total_count: z.number().int() }),
  });

/** The envelope with no `data`, for routes whose success carries only a message. */
export const emptyEnvelope = z.object({
  success: z.literal(true),
  message: z.string(),
});

/** The envelope `sendCustomError` renders for every 4xx and 5xx. */
export const errorEnvelope = registry.register(
  'Error',
  z.object({
    success: z.literal(false),
    message: z.string(),
  }),
);

/** A 400 from `validate()`: one entry per rejected field, keyed by field name. */
export const validationErrorEnvelope = registry.register(
  'ValidationError',
  z.object({
    success: z.literal(false),
    message: z.string(),
    data: z.object({
      fields: z.record(z.string(), z.array(z.string())),
    }),
  }),
);
