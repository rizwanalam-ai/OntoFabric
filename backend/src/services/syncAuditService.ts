import { randomUUID } from 'node:crypto';
import neo4j from 'neo4j-driver';

import { getNeo4jDriver } from './ontologyService.js';

export type SyncAuditStatus = 'SUCCEEDED' | 'FAILED';

export type SyncAuditRecord = {
  id: string;
  sourceType: string;
  sourceReference: string;
  tableName?: string;
  fileName?: string;
  entityLabel?: string;
  domain: string;
  rowCount: number;
  nodeCount: number;
  edgeCount: number;
  status: SyncAuditStatus;
  startedAt: string;
  completedAt: string;
  errorMessage?: string;
};

const asNumber = (value: unknown): number => typeof value === 'object' && value !== null && 'toNumber' in value && typeof value.toNumber === 'function'
  ? value.toNumber()
  : Number(value ?? 0);

export const recordSyncAudit = async (record: Omit<SyncAuditRecord, 'id'>): Promise<void> => {
  const session = getNeo4jDriver().session();
  try {
    await session.executeWrite((transaction) => transaction.run(
      `CREATE (audit:SyncAudit {
        id: $id, sourceType: $sourceType, sourceReference: $sourceReference,
        tableName: $tableName, fileName: $fileName, entityLabel: $entityLabel,
        domain: $domain, rowCount: $rowCount, nodeCount: $nodeCount, edgeCount: $edgeCount,
        status: $status, startedAt: $startedAt, completedAt: $completedAt, errorMessage: $errorMessage
      })`,
      { ...record, id: randomUUID(), tableName: record.tableName ?? null, fileName: record.fileName ?? null, entityLabel: record.entityLabel ?? null, errorMessage: record.errorMessage ?? null }
    ));
  } catch (error) {
    console.error(`Unable to write sync audit record: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await session.close();
  }
};

export const listSyncAudits = async (limit = 100, days = 5): Promise<SyncAuditRecord[]> => {
  const session = getNeo4jDriver().session();
  try {
    const since = new Date(Date.now() - Math.min(Math.max(Math.floor(days), 1), 30) * 24 * 60 * 60 * 1000).toISOString();
    const result = await session.executeRead((transaction) => transaction.run(
      `MATCH (audit:SyncAudit)
       WHERE audit.completedAt >= $since
       RETURN audit ORDER BY audit.completedAt DESC LIMIT $limit`,
      { since, limit: neo4j.int(Math.min(Math.max(Math.floor(limit), 1), 500)) }
    ));
    return result.records.map((record) => {
      const properties = record.get('audit').properties as Record<string, unknown>;
      return {
        id: String(properties.id),
        sourceType: String(properties.sourceType),
        sourceReference: String(properties.sourceReference),
        tableName: properties.tableName ? String(properties.tableName) : undefined,
        fileName: properties.fileName ? String(properties.fileName) : undefined,
        entityLabel: properties.entityLabel ? String(properties.entityLabel) : undefined,
        domain: String(properties.domain),
        rowCount: asNumber(properties.rowCount),
        nodeCount: asNumber(properties.nodeCount),
        edgeCount: asNumber(properties.edgeCount),
        status: String(properties.status) as SyncAuditStatus,
        startedAt: String(properties.startedAt),
        completedAt: String(properties.completedAt),
        errorMessage: properties.errorMessage ? String(properties.errorMessage) : undefined
      };
    });
  } finally {
    await session.close();
  }
};