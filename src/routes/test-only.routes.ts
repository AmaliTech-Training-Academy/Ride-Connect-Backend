import { Router } from 'express';

/**
 * Routes that exist only to exercise the global error-handling middleware
 * end-to-end in tests, since no real feature route triggers an error yet.
 * Mounted in `app.ts` only when `NODE_ENV === 'test'` — never a real endpoint.
 */
export const testOnlyRouter = Router();

testOnlyRouter.get('/__test/throw', () => {
  throw new Error('Synchronous test error');
});

testOnlyRouter.get('/__test/next-error', (_req, _res, next) => {
  next(new Error('Async test error'));
});

testOnlyRouter.get('/__test/error-after-response', (_req, res, next) => {
  res.status(200).send('partial response');
  next(new Error('Error after the response was already sent'));
});
