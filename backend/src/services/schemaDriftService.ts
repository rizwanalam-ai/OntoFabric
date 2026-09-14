import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

import OpenAI from 'openai';

import type { EntityType, Primitive } from '@ontofabric/shared/types.js';
import { getNeo4jDriver } from './ontologyService.js';

const AUTO_HEAL_THRESHOLD = 0.85;
const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';

let openAiClient: OpenAI | undefined;

const getOpenAiClient = (): OpenAI => {
  openAiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openAiClient;
};

export type SchemaDriftResult = {
  healedMappings: Record<string, string>;
  unmappedKeys: string[];
  missingProperties: string[];
  schemaUpdated: boolean;
};

export type SchemaDriftAlert = SchemaDriftResult & {
  sourceSystem: string;
  targetEntity: string;
  detectedAt: string;
};

export const schemaDriftEvents = new EventEmitter();

const asPrimitive = (value: unknown): Primitive => (
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null
    ? value
    : String(value)
);

const cosineSimilarity = (left: number[], right: number[]): number => {
  if (left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
};

const embed = async (values: string[]): Promise<number[][]> => {
  if (values.length === 0) return [];
  const response = await getOpenAiClient().embeddings.create({ model: embeddingModel, input: values });
  return response.data
    .sort((left, right) => left.index - right.index)
    .map((item) => item.embedding);
};

const propertyDefinitions = (expectedSchema: EntityType): string[] => Object.keys(expectedSchema.attributes);

const graphMetadataKeys = new Set([
  'id', 'typeId', 'typeLabel', 'domain', 'secondaryLabels', 'sourceSystem',
  'typeAttributesJson', 'provenanceJson', 'createdAt', 'validFrom', 'validTo',
  'transactionFrom', 'transactionTo'
]);

const logSchemaDrift = async (alert: SchemaDriftAlert): Promise<void> => {
  const session = getNeo4jDriver().session();
  try {
    await session.executeWrite((transaction) => transaction.run(
      `CREATE (log:SchemaDriftLog {
         id: $id,
         sourceSystem: $sourceSystem,
         targetEntity: $targetEntity,
         healedMappingsJson: $healedMappingsJson,
         unmappedKeysJson: $unmappedKeysJson,
         missingPropertiesJson: $missingPropertiesJson,
         schemaUpdated: $schemaUpdated,
         detectedAt: $detectedAt
       })`,
      {
        id: randomUUID(),
        sourceSystem: alert.sourceSystem,
        targetEntity: alert.targetEntity,
        healedMappingsJson: JSON.stringify(alert.healedMappings),
        unmappedKeysJson: JSON.stringify(alert.unmappedKeys),
        missingPropertiesJson: JSON.stringify(alert.missingProperties),
        schemaUpdated: alert.schemaUpdated,
        detectedAt: alert.detectedAt
      }
    ));
  } finally {
    await session.close();
  }
};

export const detectSchemaDrift = async (
  sourceData: Record<string, any>[],
  expectedSchema: EntityType,
  sourceSystem = 'UNKNOWN'
): Promise<SchemaDriftResult> => {
  const expectedProperties = propertyDefinitions(expectedSchema);
  const incomingKeys = [...new Set(sourceData.flatMap((record) => Object.keys(record)))];
  const expectedSet = new Set(expectedProperties);
  const unmappedCandidates = incomingKeys.filter((key) => !expectedSet.has(key));
  const missingProperties = expectedProperties.filter((key) => !incomingKeys.includes(key));
  const healedMappings: Record<string, string> = {};
  const unresolvedKeys: string[] = [];

  if (unmappedCandidates.length > 0 && expectedProperties.length > 0) {
    const vectors = await embed([...unmappedCandidates, ...expectedProperties]);
    const incomingVectors = vectors.slice(0, unmappedCandidates.length);
    const expectedVectors = vectors.slice(unmappedCandidates.length);
    unmappedCandidates.forEach((incomingKey, incomingIndex) => {
      let bestProperty = '';
      let bestScore = 0;
      expectedProperties.forEach((expectedProperty, expectedIndex) => {
        const score = cosineSimilarity(incomingVectors[incomingIndex], expectedVectors[expectedIndex]);
        if (score > bestScore) {
          bestProperty = expectedProperty;
          bestScore = score;
        }
      });
      if (bestScore >= AUTO_HEAL_THRESHOLD) healedMappings[incomingKey] = bestProperty;
      else unresolvedKeys.push(incomingKey);
    });
  } else {
    unresolvedKeys.push(...unmappedCandidates);
  }

  const result: SchemaDriftResult = {
    healedMappings,
    unmappedKeys: unresolvedKeys,
    missingProperties,
    schemaUpdated: Object.keys(healedMappings).length > 0
  };

  if (result.unmappedKeys.length > 0 || result.missingProperties.length > 0) {
    const alert: SchemaDriftAlert = {
      ...result,
      sourceSystem,
      targetEntity: expectedSchema.label,
      detectedAt: new Date().toISOString()
    };
    await logSchemaDrift(alert);
    schemaDriftEvents.emit('schema-drift', alert);
  }

  return result;
};

export const applyHealedMappings = (
  sourceData: Record<string, any>[],
  healedMappings: Record<string, string>
): Record<string, any>[] => sourceData.map((record) => {
  const mappedRecord: Record<string, any> = { ...record };
  Object.entries(healedMappings).forEach(([incomingKey, targetKey]) => {
    if (incomingKey in mappedRecord && !(targetKey in mappedRecord)) {
      mappedRecord[targetKey] = mappedRecord[incomingKey];
      delete mappedRecord[incomingKey];
    }
  });
  return mappedRecord;
});

export const resolveExpectedSchema = async (targetEntity: string): Promise<EntityType> => {
  const session = getNeo4jDriver().session();
  try {
    const result = await session.executeRead((transaction) => transaction.run(
      `MATCH (n:Entity {typeLabel: $targetEntity})
       RETURN n.typeId AS id, n.typeLabel AS label, properties(n) AS properties
       LIMIT 1`,
      { targetEntity }
    ));
    const record = result.records[0];
    if (!record) throw new Error(`No existing ontology definition found for entity type '${targetEntity}'.`);
    const properties = record.get('properties') as Record<string, unknown> | undefined;
    return {
      id: String(record.get('id') ?? targetEntity),
      label: String(record.get('label') ?? targetEntity),
      attributes: Object.fromEntries(Object.entries(properties ?? {})
        .filter(([key]) => !graphMetadataKeys.has(key))
        .map(([key, value]) => [key, asPrimitive(value)]))
    };
  } finally {
    await session.close();
  }
};

export const AUTO_HEAL_SIMILARITY_THRESHOLD = AUTO_HEAL_THRESHOLD;
