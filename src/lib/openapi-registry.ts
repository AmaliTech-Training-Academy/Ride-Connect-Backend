import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Every `.openapi()` call anywhere in the app goes through the prototype this
// installs, so nothing that carries OpenAPI metadata may be imported above it.
extendZodWithOpenApi(z);

/** Collects one operation per route declared with `documentedRoute`. */
export const registry = new OpenAPIRegistry();

export const SESSION_COOKIE_SCHEME = 'sessionCookie';

registry.registerComponent('securitySchemes', SESSION_COOKIE_SCHEME, {
  type: 'apiKey',
  in: 'cookie',
  name: 'better-auth.session_token',
  description: 'Session cookie issued by the sign-up and sign-in routes under /api/auth.',
});

type OpenApiDocument = ReturnType<OpenApiGeneratorV3['generateDocument']>;

/** Renders every registered operation. Every route module must have loaded first. */
export const buildOpenApiDocument = (): OpenApiDocument =>
  new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'RideConnect API',
      version: '1.0.0',
      description: 'Employee carpooling API. Sign in first; every ride route needs a session.',
    },
    servers: [{ url: '/api' }],
  });
