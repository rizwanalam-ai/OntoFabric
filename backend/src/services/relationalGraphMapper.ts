import type { ForeignKeyMapping, RelationalSyncRequest } from '@ontofabric/shared/types.js';
import { getNeo4jDriver } from './ontologyService.js';

const safeLabel = (value: string, name: string): string => {
  const label = value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(label)) throw new Error(`Invalid ${name}: ${value}`);
  return label;
};

const safeRelationshipType = (value: string): string => safeLabel(value, 'relationship type').toUpperCase();

const normalizeRelationalValue = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([key, nestedValue]) => [String(key), normalizeRelationalValue(nestedValue)]));
  }
  if (Array.isArray(value)) return value.map((item) => normalizeRelationalValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, normalizeRelationalValue(nestedValue)]));
  }
  return value;
};

const sanitizeRecordsForNeo4j = (records: Record<string, unknown>[]): Record<string, unknown>[] =>
  records.map((record) => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, normalizeRelationalValue(value)])));

const nodeCypher = `
  UNWIND $batch AS row
  MERGE (n:Entity {id: toString(row[$pk])})
  SET n += row,
      n.sourceSystem = $sourceType,
      n.domain = $domain,
      n.updatedAt = timestamp()
  WITH n, row
  CALL apoc.create.addLabels(n, [$domain, $entityLabel]) YIELD node
  RETURN count(node) AS count
`;

export const syncRelationalTableToNeo4j = async (
  payload: RelationalSyncRequest,
  records: Record<string, unknown>[],
  foreignKeys: ForeignKeyMapping[] = []
): Promise<{ nodeCount: number; relationshipCounts: Record<string, number> }> => {
  const entityLabel = safeLabel(payload.entityLabel, 'entity label');
  const domain = safeLabel(payload.domain, 'domain');
  const primaryKeyColumn = payload.primaryKeyColumn.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(primaryKeyColumn)) throw new Error(`Invalid primary key column: ${payload.primaryKeyColumn}`);
  if (!['POSTGRES', 'SNOWFLAKE'].includes(payload.sourceType)) throw new Error(`Unsupported relational source type: ${payload.sourceType}`);

  const session = getNeo4jDriver().session();
  const sanitizedRecords = sanitizeRecordsForNeo4j(records);
  try {
    return await session.executeWrite(async (transaction) => {
      const nodeResult = await transaction.run(nodeCypher, {
        batch: sanitizedRecords,
        pk: primaryKeyColumn,
        sourceType: payload.sourceType,
        domain,
        entityLabel
      });
      const nodeCount = nodeResult.records[0]?.get('count').toNumber() ?? 0;
      const relationshipCounts: Record<string, number> = {};

      for (const foreignKey of foreignKeys) {
        const fkColumn = foreignKey.columnName.trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(fkColumn)) throw new Error(`Invalid foreign key column: ${foreignKey.columnName}`);
        const relationshipType = safeRelationshipType(foreignKey.relationshipType);
        const relationshipCypher = `
          UNWIND $batch AS row
          WITH row WHERE row[$fkCol] IS NOT NULL
          MATCH (source:Entity {id: toString(row[$pk])})
          MATCH (target:Entity {id: toString(row[$fkCol])})
          MERGE (source)-[r:${relationshipType}]->(target)
          RETURN count(r) AS count
        `;
        const relationshipResult = await transaction.run(relationshipCypher, {
          batch: sanitizedRecords,
          pk: primaryKeyColumn,
          fkCol: fkColumn
        });
        relationshipCounts[relationshipType] = relationshipResult.records[0]?.get('count').toNumber() ?? 0;
      }

      return { nodeCount, relationshipCounts };
    });
  } finally {
    await session.close();
  }
};
