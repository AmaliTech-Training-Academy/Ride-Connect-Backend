import { apiReference } from '@scalar/express-api-reference';
import { Router } from 'express';

import { getOpenApiSpec } from '../controllers/docs.controller';
import { optionalAuth } from '../middlewares/auth.middleware';
import { docsCsp } from '../middlewares/docsCsp.middleware';

export const docsRouter = Router();

docsRouter.get('/openapi.json', optionalAuth, getOpenApiSpec);

docsRouter.get(
  '/',
  optionalAuth,
  docsCsp,
  apiReference({
    pageTitle: 'RideConnect API',
    sources: [
      { url: '/api/docs/openapi.json', title: 'API' },
      { url: '/api/auth/open-api/generate-schema', title: 'Auth' },
    ],
  }),
);
