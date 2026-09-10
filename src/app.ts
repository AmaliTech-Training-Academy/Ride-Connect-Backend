import cors from 'cors';
import express from 'express';
import helmet from 'helmet';

/**
 * Fully configured Express application. Deliberately has no `.listen()`
 * call so it can be started by `src/server.ts` or exercised directly by
 * tests (e.g. via supertest) without binding a network port.
 */
export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
