import helmet from 'helmet';

const SCALAR_CDN = 'https://cdn.jsdelivr.net';

/**
 * Relaxes the global policy for the reference page alone: Scalar boots from an
 * inline module script that pulls its chunks from a CDN, which `script-src 'self'` blocks.
 */
export const docsCsp = helmet.contentSecurityPolicy({
  useDefaults: true,
  directives: {
    scriptSrc: ["'self'", "'unsafe-inline'", SCALAR_CDN],
    connectSrc: ["'self'", SCALAR_CDN],
    imgSrc: ["'self'", 'data:', SCALAR_CDN],
    workerSrc: ["'self'", 'blob:'],
  },
});
