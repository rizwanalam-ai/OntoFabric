import { Router } from 'express';

import { listSyncAudits } from '../services/syncAuditService.js';

const router = Router();

router.get('/syncs', async (request, response) => {
  try {
    const requestedLimit = Number(request.query.limit ?? 100);
    const requestedDays = Number(request.query.days ?? 5);
    response.json({
      days: Number.isFinite(requestedDays) ? Math.min(Math.max(Math.floor(requestedDays), 1), 30) : 5,
      records: await listSyncAudits(Number.isFinite(requestedLimit) ? requestedLimit : 100, Number.isFinite(requestedDays) ? requestedDays : 5)
    });
  } catch (error) {
    response.status(503).json({ error: 'Unable to load sync audit records.', message: error instanceof Error ? error.message : 'Request failed.' });
  }
});

export default router;