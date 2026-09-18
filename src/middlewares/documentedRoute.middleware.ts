import type { RequestHandler } from 'express';
import type { ZodObject, ZodType } from 'zod';

import { registry, SESSION_COOKIE_SCHEME } from '../lib/openapi-registry';
import { validate } from './validate.middleware';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface ResponseDoc {
  description: string;
  schema?: ZodType;
}

export interface RouteDoc {
  method: Method;
  /** The Express path, mount prefix included: `/rides/:rideId/requests`. */
  path: string;
  summary: string;
  tags: string[];
  secured?: boolean;
  body?: ZodType;
  // Narrower than `validate()` accepts: OpenAPI turns these into one named
  // parameter per key, which it can only do for an object schema.
  params?: ZodObject;
  query?: ZodObject;
  responses: Record<number, ResponseDoc>;
}

const toOpenApiPath = (path: string): string => path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

const toResponses = (responses: Record<number, ResponseDoc>) =>
  Object.fromEntries(
    Object.entries(responses).map(([status, { description, schema }]) => [
      status,
      {
        description,
        ...(schema && { content: { 'application/json': { schema } } }),
      },
    ]),
  );

/** Registers the route's OpenAPI operation and validates the request against the same schemas. */
export const documentedRoute = (doc: RouteDoc): RequestHandler => {
  registry.registerPath({
    method: doc.method,
    path: toOpenApiPath(doc.path),
    summary: doc.summary,
    tags: doc.tags,
    ...(doc.secured && { security: [{ [SESSION_COOKIE_SCHEME]: [] }] }),
    request: {
      ...(doc.body && { body: { content: { 'application/json': { schema: doc.body } } } }),
      ...(doc.params && { params: doc.params }),
      ...(doc.query && { query: doc.query }),
    },
    responses: toResponses(doc.responses),
  });

  return validate({ body: doc.body, query: doc.query, params: doc.params });
};
