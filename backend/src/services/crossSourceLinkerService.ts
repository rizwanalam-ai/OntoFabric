import { z } from 'zod';

import { getNeo4jDriver } from './ontologyService.js';

export interface CrossSourceLinkConfig {
  sourceNodeLabel: string;
  sourceKeyProperty: string;
  targetNodeLabel: string;
  targetKeyProperty: string;
  relationshipType: string;
  sourceName: string;
}

const configSchema = z.object({
  sourceNodeLabel: z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  sourceKeyProperty: z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  targetNodeLabel: z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  targetKeyProperty: z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  relationshipType: z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  sourceName: z.string().trim().min(1)
}).strict();

export const getCrossSourceLinkConfigs = (): CrossSourceLinkConfig[] => {
  const rawConfigs = process.env.CROSS_SOURCE_LINKS;
  if (!rawConfigs?.trim()) return [];
  const parsed = z.array(configSchema).safeParse(JSON.parse(rawConfigs));
  if (!parsed.success) {
    throw new Error(`Invalid CROSS_SOURCE_LINKS configuration: ${parsed.error.message}`);
  }
  return parsed.data;
};

export const linkEntitiesAcrossSources = async (
  records: Record<string, unknown>[],
  config: CrossSourceLinkConfig
): Promise<number> => {
  if (records.length === 0) return 0;
  const validatedConfig = configSchema.parse(config);
  const session = getNeo4jDriver().session();
  try {
    const result = await session.executeWrite((transaction) => transaction.run(
      `UNWIND $records AS row
       WITH row WHERE row[$sourceKeyProperty] IS NOT NULL
       MATCH (source:Entity {id: toString(row.id)})
       WHERE source.typeLabel = $sourceNodeLabel
       MATCH (target:Entity)
       WHERE target.typeLabel = $targetNodeLabel
         AND toString(target[$targetKeyProperty]) = toString(row[$sourceKeyProperty])
       MERGE (source)-[r:${validatedConfig.relationshipType}]->(target)
       ON CREATE SET r.establishedByApp = true,
                     r.linkedFromSource = $sourceName,
                     r.createdAt = timestamp()
       SET r.relationship = $relationshipType,
           r.relationshipType = $relationshipType
       RETURN count(r) AS createdLinks`,
      {
        records,
        sourceKeyProperty: validatedConfig.sourceKeyProperty,
        targetKeyProperty: validatedConfig.targetKeyProperty,
        sourceNodeLabel: validatedConfig.sourceNodeLabel,
        targetNodeLabel: validatedConfig.targetNodeLabel,
        relationshipType: validatedConfig.relationshipType,
        sourceName: validatedConfig.sourceName
      }
    ));
    return result.records[0]?.get('createdLinks').toNumber() ?? 0;
  } finally {
    await session.close();
  }
};

export const linkConfiguredRecords = async (
  records: Record<string, unknown>[],
  sourceNodeLabel: string
): Promise<Record<string, number>> => {
  const configs = getCrossSourceLinkConfigs().filter((config) => config.sourceNodeLabel === sourceNodeLabel);
  const counts: Record<string, number> = {};
  for (const config of configs) {
    counts[config.relationshipType] = await linkEntitiesAcrossSources(records, config);
  }
  return counts;
};

export const linkConfiguredRecordsBestEffort = async (
  records: Record<string, unknown>[],
  sourceNodeLabel: string
): Promise<Record<string, number>> => {
  try {
    return await linkConfiguredRecords(records, sourceNodeLabel);
  } catch (error) {
    console.warn(`Source data was synced, but auto-linking ${sourceNodeLabel} records failed: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
};

export const getAutoLinkedRelationshipStats = async (): Promise<Array<{
  linkedFromSource: string;
  relationshipType: string;
  count: number;
}>> => {
  const session = getNeo4jDriver().session();
  try {
    const result = await session.executeRead((transaction) => transaction.run(
      `MATCH ()-[r]->()
       WHERE r.establishedByApp = true
       RETURN coalesce(r.linkedFromSource, 'UNKNOWN') AS linkedFromSource,
              coalesce(r.relationshipType, r.relationship, type(r)) AS relationshipType,
              count(r) AS count
       ORDER BY linkedFromSource, relationshipType`
    ));
    return result.records.map((record) => ({
      linkedFromSource: String(record.get('linkedFromSource')),
      relationshipType: String(record.get('relationshipType')),
      count: record.get('count').toNumber()
    }));
  } finally {
    await session.close();
  }
};