import { Router } from 'express';
import { z } from 'zod';

import { domainSchemas } from '@ontofabric/shared/domainSchemas.js';
import type { ForeignKeyMapping, RelationalSyncRequest } from '@ontofabric/shared/types.js';
import { fetchPostgresForeignKeys, fetchPostgresTableData } from '../services/postgresService.js';
import { fetchSnowflakeTableData } from '../services/snowflakeService.js';
import { fetchDatabricksTableData } from '../services/databricksService.js';
import { syncRelationalTableToNeo4j } from '../services/relationalGraphMapper.js';
import { recordSyncAudit } from '../services/syncAuditService.js';

const router = Router();
const domainValues = Object.keys(domainSchemas) as [RelationalSyncRequest['domain'], ...RelationalSyncRequest['domain'][]];
const relationalSyncSchema = z.object({
  tableName: z.string().trim().min(1),
  primaryKeyColumn: z.string().trim().min(1),
  entityLabel: z.string().trim().min(1),
  domain: z.enum(domainValues),
  limit: z.number().int().min(1).max(10000).optional()
}).strict();

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : 'Request failed.';

const relationshipTypeForTable = (tableName: string): string => {
  const table = tableName.split('.').pop() ?? tableName;
  return `HAS_${table.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}`;
};

router.post('/sync/postgres', async (request, response) => {
  const parsedRequest = relationalSyncSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    response.status(400).json({ error: 'Invalid PostgreSQL sync request.', details: parsedRequest.error.flatten() });
    return;
  }

  const payload: RelationalSyncRequest = { sourceType: 'POSTGRES', ...parsedRequest.data };
  const startedAt = new Date().toISOString();
  try {
    const records = await fetchPostgresTableData(payload.tableName, payload.limit);
    const foreignKeys = (await fetchPostgresForeignKeys(payload.tableName)).map((foreignKey): ForeignKeyMapping => ({
      ...foreignKey,
      relationshipType: relationshipTypeForTable(foreignKey.foreignTableName)
    }));
    const result = await syncRelationalTableToNeo4j(payload, records, foreignKeys);
    await recordSyncAudit({ sourceType: payload.sourceType, sourceReference: payload.tableName, tableName: payload.tableName, entityLabel: payload.entityLabel, domain: payload.domain, rowCount: records.length, nodeCount: result.nodeCount, edgeCount: Object.values(result.relationshipCounts).reduce((sum, count) => sum + count, 0), status: 'SUCCEEDED', startedAt, completedAt: new Date().toISOString() });
    response.status(201).json({ ...result, sourceType: payload.sourceType, tableName: payload.tableName });
  } catch (error) {
    await recordSyncAudit({ sourceType: payload.sourceType, sourceReference: payload.tableName, tableName: payload.tableName, entityLabel: payload.entityLabel, domain: payload.domain, rowCount: 0, nodeCount: 0, edgeCount: 0, status: 'FAILED', startedAt, completedAt: new Date().toISOString(), errorMessage: errorMessage(error) });
    response.status(502).json({ error: 'PostgreSQL sync failed.', message: errorMessage(error) });
  }
});

router.post('/sync/snowflake', async (request, response) => {
  const parsedRequest = relationalSyncSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    response.status(400).json({ error: 'Invalid Snowflake sync request.', details: parsedRequest.error.flatten() });
    return;
  }

  const payload: RelationalSyncRequest = { sourceType: 'SNOWFLAKE', ...parsedRequest.data };
  const startedAt = new Date().toISOString();
  try {
    const records = await fetchSnowflakeTableData(payload.tableName, payload.limit);
    const result = await syncRelationalTableToNeo4j(payload, records);
    await recordSyncAudit({ sourceType: payload.sourceType, sourceReference: payload.tableName, tableName: payload.tableName, entityLabel: payload.entityLabel, domain: payload.domain, rowCount: records.length, nodeCount: result.nodeCount, edgeCount: Object.values(result.relationshipCounts).reduce((sum, count) => sum + count, 0), status: 'SUCCEEDED', startedAt, completedAt: new Date().toISOString() });
    response.status(201).json({ ...result, sourceType: payload.sourceType, tableName: payload.tableName });
  } catch (error) {
    await recordSyncAudit({ sourceType: payload.sourceType, sourceReference: payload.tableName, tableName: payload.tableName, entityLabel: payload.entityLabel, domain: payload.domain, rowCount: 0, nodeCount: 0, edgeCount: 0, status: 'FAILED', startedAt, completedAt: new Date().toISOString(), errorMessage: errorMessage(error) });
    response.status(502).json({ error: 'Snowflake sync failed.', message: errorMessage(error) });
  }
});

router.post('/sync/databricks', async (request, response) => {
  const parsedRequest = relationalSyncSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    response.status(400).json({ error: 'Invalid Databricks sync request.', details: parsedRequest.error.flatten() });
    return;
  }
  const payload: RelationalSyncRequest = { sourceType: 'DATABRICKS', ...parsedRequest.data };
  const startedAt = new Date().toISOString();
  try {
    const records = await fetchDatabricksTableData(payload.tableName, payload.limit);
    const result = await syncRelationalTableToNeo4j(payload, records);
    await recordSyncAudit({ sourceType: payload.sourceType, sourceReference: payload.tableName, tableName: payload.tableName, entityLabel: payload.entityLabel, domain: payload.domain, rowCount: records.length, nodeCount: result.nodeCount, edgeCount: Object.values(result.relationshipCounts).reduce((sum, count) => sum + count, 0), status: 'SUCCEEDED', startedAt, completedAt: new Date().toISOString() });
    response.status(201).json({ ...result, sourceType: payload.sourceType, tableName: payload.tableName });
  } catch (error) {
    await recordSyncAudit({ sourceType: payload.sourceType, sourceReference: payload.tableName, tableName: payload.tableName, entityLabel: payload.entityLabel, domain: payload.domain, rowCount: 0, nodeCount: 0, edgeCount: 0, status: 'FAILED', startedAt, completedAt: new Date().toISOString(), errorMessage: errorMessage(error) });
    response.status(502).json({ error: 'Databricks sync failed.', message: errorMessage(error) });
  }
});

export default router;
