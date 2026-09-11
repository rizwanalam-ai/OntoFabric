import { Router } from 'express';
import { z } from 'zod';

import { getPendingMatches, resolvePendingMatch } from '../services/entityResolutionService.js';

const router = Router();
const approvalSchema = z.object({
  pendingId: z.string().trim().min(1),
  action: z.enum(['MERGE', 'REJECT', 'LINK'])
}).strict();

router.get('/pending', async (_request, response) => {
  try {
    response.json({ matches: await getPendingMatches() });
  } catch (error) {
    response.status(503).json({ error: 'Unable to load pending matches.', message: error instanceof Error ? error.message : 'Request failed.' });
  }
});

router.post('/approve', async (request, response) => {
  const parsed = approvalSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid resolution action.', details: parsed.error.flatten() });
    return;
  }

  try {
    await resolvePendingMatch(parsed.data.pendingId, parsed.data.action);
    response.json({ pendingId: parsed.data.pendingId, action: parsed.data.action, status: 'RESOLVED' });
  } catch (error) {
    response.status(409).json({ error: 'Unable to resolve pending match.', message: error instanceof Error ? error.message : 'Request failed.' });
  }
});

export default router;