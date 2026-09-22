import request from 'supertest';

import { app } from '../app';

interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: RouterLayer[] };
  regexp: RegExp;
}

/** Turns `^\/rides\/?(?=\/|$)`, the regexp Express builds for a mount, back into `/rides`. */
const decodeMount = (regexp: RegExp): string =>
  regexp.source
    .replace(/^\^/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, '')
    .replace(/\\\//g, '/');

function collectRoutes(stack: RouterLayer[], prefix: string, found: string[]): void {
  for (const layer of stack) {
    if (layer.route) {
      const path = `${prefix}${layer.route.path}`.replace(/(.)\/$/, '$1');

      for (const method of Object.keys(layer.route.methods)) {
        found.push(`${method} ${path}`);
      }
      continue;
    }

    if (layer.handle?.stack) {
      collectRoutes(layer.handle.stack, prefix + decodeMount(layer.regexp), found);
    }
  }
}

/**
 * Every route Express actually serves under `/api`, in OpenAPI path form.
 *
 * Walks the router rather than a hand-kept list, so a route mounted without
 * `documentedRoute` turns up here and fails the comparison.
 *
 * `/auth/*` is better-auth's own handler, described by its own schema, and
 * `/docs` is the reference itself. Neither belongs in our document.
 */
function mountedApiRoutes(): string[] {
  const internals = app as unknown as {
    _router?: { stack: RouterLayer[] };
    router?: { stack: RouterLayer[] };
  };
  const stack = (internals._router ?? internals.router)?.stack ?? [];
  const found: string[] = [];

  collectRoutes(stack, '', found);

  return found
    .filter((entry) => entry.includes(' /api/'))
    .map((entry) => entry.replace(' /api', ' ').replace(/:([A-Za-z0-9_]+)/g, '{$1}'))
    .filter((entry) => !entry.includes(' /auth') && !entry.includes(' /docs'))
    .sort();
}

describe('GET /api/docs/openapi.json', () => {
  it('serves the spec unenveloped, so an OpenAPI client can read it', async () => {
    const response = await request(app).get('/api/docs/openapi.json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.0.0');
    expect(response.body.info.title).toBe('RideConnect API');
    expect(response.body.servers).toEqual([{ url: '/api' }]);
    expect(response.body.success).toBeUndefined();
  });

  it('documents every route Express serves, with path parameters in OpenAPI form', async () => {
    const response = await request(app).get('/api/docs/openapi.json');
    const documented = Object.entries(response.body.paths)
      .flatMap(([path, item]) => Object.keys(item as object).map((method) => `${method} ${path}`))
      .sort();

    expect(documented).toEqual(mountedApiRoutes());
  });

  it('finds the routes it is comparing against', () => {
    expect(mountedApiRoutes().length).toBeGreaterThan(5);
  });

  it('describes the ride body by the fields the caller sends, not the transformed ones', async () => {
    const response = await request(app).get('/api/docs/openapi.json');
    const body = response.body.paths['/rides'].post.requestBody.content['application/json'].schema;

    expect(Object.keys(body.properties)).toEqual(
      expect.arrayContaining(['departureDate', 'departureTime', 'availableSeats']),
    );
    expect(body.properties.seatsOffered).toBeUndefined();
    expect(body.properties.departureAt).toBeUndefined();
  });
});

describe('GET /api/docs', () => {
  it('serves the reference page', async () => {
    const response = await request(app).get('/api/docs');

    expect(response.status).toBe(200);
    expect(response.text).toContain('/api/docs/openapi.json');
    expect(response.text).toContain('/api/auth/open-api/generate-schema');
  });

  it('relaxes the script policy enough for the reference to boot', async () => {
    const response = await request(app).get('/api/docs');
    const policy = response.headers['content-security-policy'] ?? '';
    const scriptSrc = policy.split(';').find((directive) => directive.startsWith('script-src'));

    expect(scriptSrc).toContain('https://cdn.jsdelivr.net');
    expect(scriptSrc).toContain("'unsafe-inline'");
  });
});
