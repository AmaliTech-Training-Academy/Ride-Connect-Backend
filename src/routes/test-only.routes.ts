import { Router } from 'express';

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
