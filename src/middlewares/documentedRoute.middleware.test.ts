import express, { type Express } from 'express';
import request from 'supertest';
import { z } from 'zod';

import { registry } from '../lib/openapi-registry';
import { documentedRoute, type RouteDoc } from './documentedRoute.middleware';
import { errorHandler } from './errorHandler.middleware';
import { responseMiddleware } from './response.middleware';

const bodySchema = z.object({
  origin: z.string('Origin is required.').min(1, 'Origin is required.'),
});

const paramsSchema = z.object({
  rideId: z.uuid('Invalid ride id.'),
});

function buildApp(doc: RouteDoc): Express {
  const app = express();

  app.use(responseMiddleware);
  app.use(express.json());
  app.post('/probe/:rideId', documentedRoute(doc), (req, res) => {
    res.customSuccess({ data: { validated: req.validated } });
  });
  app.use(errorHandler);

  return app;
}

const baseDoc = {
  method: 'post',
  path: '/probe/:rideId',
  summary: 'Probe',
  tags: ['Probe'],
  responses: { 200: { description: 'ok' } },
} satisfies RouteDoc;

const registered = (path: string) =>
  registry.definitions.find(
    (definition) => definition.type === 'route' && definition.route.path === path,
  );

describe('documentedRoute', () => {
  it('still validates the request through the schemas it documents', async () => {
    const app = buildApp({ ...baseDoc, body: bodySchema, params: paramsSchema });
    const rideId = '33333333-3333-4333-8333-333333333333';

    const response = await request(app).post(`/probe/${rideId}`).send({ origin: 'Accra' });

    expect(response.status).toBe(200);
    expect(response.body.data.validated).toEqual({
      body: { origin: 'Accra' },
      params: { rideId },
    });
  });

  it('rejects a bad body with the envelope the error handler already produces', async () => {
    const app = buildApp({ ...baseDoc, path: '/probe-invalid/:rideId', body: bodySchema });

    const response = await request(app).post('/probe/any').send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      message: 'The request is invalid',
      data: { fields: { origin: ['Origin is required.'] } },
    });
  });

  it('registers the path in OpenAPI form, not Express form', () => {
    buildApp({ ...baseDoc, path: '/probe-openapi/:rideId', params: paramsSchema });

    expect(registered('/probe-openapi/{rideId}')).toBeDefined();
    expect(registered('/probe-openapi/:rideId')).toBeUndefined();
  });

  it('declares a security requirement only when the route is secured', () => {
    buildApp({ ...baseDoc, path: '/probe-open', secured: false });
    buildApp({ ...baseDoc, path: '/probe-secured', secured: true });

    const open = registered('/probe-open');
    const secured = registered('/probe-secured');

    expect(open?.type === 'route' && open.route.security).toBeUndefined();
    expect(secured?.type === 'route' && secured.route.security).toEqual([{ sessionCookie: [] }]);
  });
});
