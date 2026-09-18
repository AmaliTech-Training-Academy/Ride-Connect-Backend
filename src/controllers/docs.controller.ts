import type { Request, Response } from 'express';

import { buildOpenApiDocument } from '../lib/openapi-registry';

/**
 * GET /api/docs/openapi.json — the generated spec.
 *
 * Sent unenveloped, unlike every other response: an OpenAPI client reading this
 * URL expects the document at the top level and cannot unwrap `data`.
 */
export const getOpenApiSpec = (_req: Request, res: Response): void => {
  res.json(buildOpenApiDocument());
};
