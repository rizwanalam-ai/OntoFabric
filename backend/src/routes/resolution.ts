import { Router } from 'express';
import { z } from 'zod';

import type { GraphNode } from '@ontofabric/shared/types.js';
import { getPendingMatches, resolvePendingMatch } from '../services/entityResolutionService.js';

const router = Router();
const approvalSchema = z.object({
  pendingId: z.string().trim().min(1),
  action: z.enum(['MERGE', 'REJECT', 'LINK'])
}).strict();
const domainSchema = z.enum(['SUPPLY_CHAIN', 'FINANCE', 'HEALTHCARE', 'HR_ORG', 'CUSTOM']);

router.get('/pending', async (request, response) => {
  try {
    const parsedDomain = request.query.domain === undefined ? undefined : domainSchema.safeParse(request.query.domain);
    if (parsedDomain && !parsedDomain.success) {
      response.status(400).json({ error: 'Invalid domain query parameter.', details: parsedDomain.error.flatten() });
      return;
    }
    response.json({ matches: await getPendingMatches(parsedDomain?.data as GraphNode['domain'] | undefined) });
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