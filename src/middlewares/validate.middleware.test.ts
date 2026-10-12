import express, { type Express } from 'express';
import request from 'supertest';
import { z } from 'zod';

import { errorHandler } from './errorHandler.middleware';
import { responseMiddleware } from './response.middleware';
import { validate, type ValidationSchemas } from './validate.middleware';

const bodySchema = z.object({
  name: z.string('Name is required.').trim().min(1, 'Name is required.'),
  seats: z.coerce.number('Seats is required.').int().min(1, 'Seats must be at least 1.'),
});

const querySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
});

const paramsSchema = z.object({
  id: z.uuid('The ride id must be a UUID.'),
});

function buildApp(schemas: ValidationSchemas): Express {
  const app = express();

  app.use(responseMiddleware);
  app.use(express.json());
  app.post('/probe/:id', validate(schemas), (req, res) => {
    res.customSuccess({ data: { validated: req.validated, rawBody: req.body } });
  });
  app.use(errorHandler);

  return app;
}

describe('validate', () => {
  it('exposes the parsed body, query and params on req.validated', async () => {
    const app = buildApp({ body: bodySchema, query: querySchema, params: paramsSchema });
    const id = '33333333-3333-4333-8333-333333333333';

    const response = await request(app).post(`/probe/${id}`).send({ name: 'Accra run', seats: 3 });

    expect(response.status).toBe(200);
    expect(response.body.data.validated).toEqual({
      body: { name: 'Accra run', seats: 3 },
      query: { page: 1 },
      params: { id },
    });
  });

  it('coerces values the wire could only carry as strings', async () => {
    const app = buildApp({ body: bodySchema, query: querySchema });

    const response = await request(app)
      .post('/probe/any?page=4')
      .send({ name: 'Accra run', seats: '3' });

    expect(response.status).toBe(200);
    expect(response.body.data.validated.body.seats).toBe(3);
    expect(response.body.data.validated.query.page).toBe(4);
  });

  it('leaves the raw request body untouched', async () => {
    const app = buildApp({ body: bodySchema });

    const response = await request(app)
      .post('/probe/any')
      .send({ name: '  Accra run  ', seats: '3', unexpected: 'kept on the raw body' });

    expect(response.status).toBe(200);
    expect(response.body.data.validated.body).toEqual({ name: 'Accra run', seats: 3 });
    expect(response.body.data.rawBody).toEqual({
      name: '  Accra run  ',
      seats: '3',
      unexpected: 'kept on the raw body',
    });
  });

  it('reports every failing field of one source at once', async () => {
    const app = buildApp({ body: bodySchema });

    const response = await request(app).post('/probe/any').send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      message: 'The request is invalid',
      data: {
        fields: {
          name: ['Name is required.'],
          seats: ['Seats is required.'],
        },
      },
    });
  });

  it('stops at the body, so a later source cannot mask which input was wrong', async () => {
    const app = buildApp({ body: bodySchema, params: paramsSchema });

    const response = await request(app).post('/probe/not-a-uuid').send({});

    expect(response.status).toBe(400);
    expect(response.body.data.fields).toEqual({
      name: ['Name is required.'],
      seats: ['Seats is required.'],
    });
  });

  it('validates a source the caller did declare, even when the body is fine', async () => {
    const app = buildApp({ body: bodySchema, params: paramsSchema });

    const response = await request(app)
      .post('/probe/not-a-uuid')
      .send({ name: 'Accra run', seats: 3 });

    expect(response.status).toBe(400);
    expect(response.body.data.fields).toEqual({ id: ['The ride id must be a UUID.'] });
  });

  it('passes an unparsed source through as undefined', async () => {
    const app = buildApp({ body: bodySchema });

    const response = await request(app).post('/probe/any').send({ name: 'Accra run', seats: 3 });

    expect(response.status).toBe(200);
    expect(response.body.data.validated).toEqual({ body: { name: 'Accra run', seats: 3 } });
  });
});
