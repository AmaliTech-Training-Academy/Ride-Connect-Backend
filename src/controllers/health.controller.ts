import { controller } from '../lib/http/controller';

/** GET /api/health — reports that the process is up. Touches no dependency. */
export const getHealth = controller((_req, res) => {
  res.customSuccess({
    message: 'Service is healthy for CI_CD pipeline',
    data: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});
