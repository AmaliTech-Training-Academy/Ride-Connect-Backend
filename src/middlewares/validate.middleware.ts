import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

export interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/** Parses the request against the given schemas and exposes the result on `req.validated`. */
export const validate =
  (schemas: ValidationSchemas): RequestHandler =>
  (req, _res, next) => {
    try {
      req.validated = {
        body: schemas.body?.parse(req.body),
        query: schemas.query?.parse(req.query),
        params: schemas.params?.parse(req.params),
      };

      next();
    } catch (error) {
      next(error);
    }
  };
