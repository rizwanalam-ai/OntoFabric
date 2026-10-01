import { Router } from 'express';
import { z } from 'zod';

import { persistGraphToNeo4j } from '../services/ontologyService.js';
import { syncBusinessSource } from '../services/businessSourceService.js';
import { recordSyncAudit } from '../services/syncAuditService.js';

const router = Router();
const providerSchema = z.enum(['hubspot', 'monday', 'salesforce', 'odoo']);
const providerType = {
  hubspot: 'HUBSPOT',
  monday: 'MONDAY',
  salesforce: 'SALESFORCE',
  odoo: 'ODOO'
} as const;

router.post('/:provider/sync', async (request, response) => {
  const parsed = providerSchema.safeParse(request.params.provider.toLowerCase());
  if (!parsed.success) {
    response.status(404).json({ error: 'Unsupported business data source.' });
    return;
  }
  const startedAt = new Date().toISOString();
  try {
    const result = await syncBusinessSource(providerType[parsed.data]);
    await persistGraphToNeo4j(result.nodes, []);
    await recordSyncAudit({
      sourceType: providerType[parsed.data] === 'ODOO' ? 'ERP' : 'CRM',
      sourceReference: result.entityType,
      entityLabel: result.entityType,
      domain: 'CUSTOM',
      rowCount: result.count,
      nodeCount: result.nodes.length,
      edgeCount: 0,
      status: 'SUCCEEDED',
      startedAt,
      completedAt: new Date().toISOString()
    });
    response.status(201).json({ provider: providerType[parsed.data], count: result.count, entityType: result.entityType });
  } catch (error) {
    await recordSyncAudit({
      sourceType: providerType[parsed.data] === 'ODOO' ? 'ERP' : 'CRM',
      sourceReference: providerType[parsed.data],
      domain: 'CUSTOM',
      rowCount: 0,
      nodeCount: 0,
      edgeCount: 0,
      status: 'FAILED',
      startedAt,
      completedAt: new Date().toISOString(),
      errorMessage: error instanceof Error ? error.message : 'Request failed.'
    });
    response.status(502).json({ error: `${providerType[parsed.data]} sync failed.`, message: error instanceof Error ? error.message : 'Request failed.' });
  }
});

export default router;