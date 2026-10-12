import express, { type Express } from 'express';
import request from 'supertest';

import { errorHandler } from '../../middlewares/errorHandler.middleware';
import { responseMiddleware } from '../../middlewares/response.middleware';
import { logger } from '../logger';
import { authedController, controller } from './controller';
import { CustomError } from './errors';
import type { AuthContext } from './types';

const issuedAt = new Date('2026-01-01T00:00:00.000Z');

const authContext: AuthContext = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Grace Hopper',
    email: 'grace@rideconnect.test',
    emailVerified: true,
    createdAt: issuedAt,
    updatedAt: issuedAt,
  },
  session: {
    id: '22222222-2222-4222-8222-222222222222',
    token: 'session-token',
    userId: '11111111-1111-4111-8111-111111111111',
    expiresAt: new Date('2026-01-08T00:00:00.000Z'),
    createdAt: issuedAt,
    updatedAt: issuedAt,
  },
};

function buildApp(mount: (app: Express) => void): Express {
  const app = express();

  app.use(responseMiddleware);
  mount(app);
  app.use(errorHandler);

  return app;
}

describe('controller', () => {
  const originalLoggerError = logger.error;

  beforeEach(() => {
    logger.error = () => undefined;
  });

  afterEach(() => {
    logger.error = originalLoggerError;
  });

  it('routes a rejected promise to the error handler instead of leaking it', async () => {
    const app = buildApp((instance) => {
      instance.get(
        '/probe',
        controller(async () => {
          await Promise.reject(new Error('handler blew up'));
        }),
      );
    });

    const response = await request(app).get('/probe');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      message: 'An internal server error occurred',
    });
  });

  it('renders a thrown CustomError at its own status', async () => {
    const app = buildApp((instance) => {
      instance.get(
        '/probe',
        controller(() => {
          throw CustomError.notFound('No such ride');
        }),
      );
    });

    const response = await request(app).get('/probe');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, message: 'No such ride' });
  });

  it('gives the handler an empty validated bag when nothing has parsed yet', async () => {
    const app = buildApp((instance) => {
      instance.get(
        '/probe',
        controller((req, res) => {
          res.customSuccess({ data: req.validated });
        }),
      );
    });

    const response = await request(app).get('/probe');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({});
  });

  it('leaves the first response intact when the handler throws after responding', async () => {
    const app = buildApp((instance) => {
      instance.get(
        '/probe',
        controller((_req, res) => {
          res.customSuccess({ message: 'Already sent' });
          throw new Error('too late');
        }),
      );
    });

    const response = await request(app).get('/probe');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: 'Already sent' });
  });
});

describe('authedController', () => {
  it('rejects the request when the route is missing requireAuth', async () => {
    const handler = () => {
      throw new Error('The handler must not run without an auth context.');
    };

    const app = buildApp((instance) => {
      instance.get('/probe', authedController(handler));
    });

    const response = await request(app).get('/probe');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      message: 'Authentication required. Please log in.',
    });
  });

  it('hands the handler an auth context it can read without a guard', async () => {
    const app = buildApp((instance) => {
      instance.get(
        '/probe',
        (req, _res, next) => {
          req.auth = authContext;
          next();
        },
        authedController((req, res) => {
          res.customSuccess({ data: { userId: req.auth.user.id } });
        }),
      );
    });

    const response = await request(app).get('/probe');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ userId: authContext.user.id });
  });
});
