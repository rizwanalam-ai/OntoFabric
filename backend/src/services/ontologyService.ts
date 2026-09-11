import neo4j, { type Driver } from 'neo4j-driver';
import OpenAI from 'openai';
import { z } from 'zod';

import { DEFAULT_TEMPORAL_END, type GraphEdge, type GraphNode, type NodeProvenance, type PrimitiveDictionary } from '@ontofabric/shared/types.js';

const primitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const primitiveDictionary = z.record(primitive);
const graphNodeSchema = z.object({
  id: z.string().min(1),
  type: z.object({ id: z.string().min(1), label: z.string().min(1), attributes: primitiveDictionary }),
  sourceSystem: z.enum(['ERP', 'CRM', 'EXCEL', 'PDF', 'SME_INPUT']),
  properties: primitiveDictionary,
  createdAt: z.string().min(1),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
  transactionFrom: z.string().datetime(),
  transactionTo: z.string().datetime(),
  provenance: z.object({
    sourceSystem: z.string(), rawSourceId: z.string(), filePath: z.string().optional(),
    lineNumber: z.number().int().optional(), extractionTimestamp: z.string(), rawPayload: z.string().optional(), mcpTool: z.string().optional()
  })
});
const graphEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  relationship: z.string().min(1),
  properties: primitiveDictionary,
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
  transactionFrom: z.string().datetime(),
  transactionTo: z.string().datetime()
});
const ontologySchema = z.object({ nodes: z.array(graphNodeSchema), edges: z.array(graphEdgeSchema) });

let openAiClient: OpenAI | undefined;
let neo4jDriver: Driver | undefined;

const getOpenAiClient = (): OpenAI => {
  openAiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openAiClient;
};

export const getNeo4jDriver = (): Driver => {
  neo4jDriver ??= neo4j.driver(
    process.env.NEO4J_URI ?? 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USERNAME ?? process.env.NEO4J_USER ?? 'neo4j',
      process.env.NEO4J_PASSWORD ?? 'password'
    )
  );
  return neo4jDriver;
};

export const extractOntologyFromText = async (rawText: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> => {
  const completion = await getOpenAiClient().chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          'Extract an enterprise ontology from the supplied text.',
          'Return only a JSON object with exactly two arrays: nodes and edges.',
          'Each node must have id, type { id, label, attributes }, sourceSystem, properties, createdAt, validFrom, validTo, transactionFrom, transactionTo, and provenance { sourceSystem, rawSourceId, filePath?, lineNumber?, extractionTimestamp, rawPayload?, mcpTool? }.',
          'Each edge must have id, source, target, relationship, properties, validFrom, validTo, transactionFrom, and transactionTo.',
          'Use primitive values only in attributes, properties, and edge properties.',
          'Use sourceSystem SME_INPUT when the source cannot be inferred.'
        ].join(' ')
      },
      { role: 'user', content: rawText }
    ]
  });

  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error('OpenAI returned an empty ontology response.');
  }

  return ontologySchema.parse(JSON.parse(content));
};

const asNeo4jProperties = (properties: PrimitiveDictionary): Record<string, string | number | boolean | null> => properties;

const withoutKeys = (properties: Record<string, unknown>, keys: string[]): PrimitiveDictionary => {
  const excluded = new Set(keys);
  const result: PrimitiveDictionary = {};

  for (const [key, value] of Object.entries(properties)) {
    if (!excluded.has(key) && (
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null
    )) {
      result[key] = value;
    }
  }

  return result;
};

const parsePrimitiveDictionary = (value: unknown): PrimitiveDictionary => {
  if (typeof value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return primitiveDictionary.parse(parsed);
  } catch {
    return {};
  }
};

const parseProvenance = (value: unknown, properties: Record<string, unknown>): NodeProvenance => {
  try {
    return z.object({
      sourceSystem: z.string(), rawSourceId: z.string(), filePath: z.string().optional(),
      lineNumber: z.number().int().optional(), extractionTimestamp: z.string(), rawPayload: z.string().optional(), mcpTool: z.string().optional()
    }).parse(JSON.parse(String(value)));
  } catch {
    return {
      sourceSystem: String(properties.sourceSystem ?? 'UNKNOWN'),
      rawSourceId: String(properties.id ?? 'UNKNOWN'),
      extractionTimestamp: String(properties.createdAt ?? new Date().toISOString())
    };
  }
};

const temporalDefaults = (validFrom: string, temporal?: Partial<GraphNode>) => ({
  validFrom: temporal?.validFrom ?? validFrom,
  validTo: temporal?.validTo ?? DEFAULT_TEMPORAL_END,
  transactionFrom: temporal?.transactionFrom ?? new Date().toISOString(),
  transactionTo: temporal?.transactionTo ?? DEFAULT_TEMPORAL_END
});

const provenanceDefaults = (node: GraphNode): NodeProvenance => ({
  sourceSystem: node.provenance?.sourceSystem ?? node.sourceSystem,
  rawSourceId: node.provenance?.rawSourceId ?? node.id,
  filePath: node.provenance?.filePath,
  lineNumber: node.provenance?.lineNumber,
  extractionTimestamp: node.provenance?.extractionTimestamp ?? new Date().toISOString(),
  rawPayload: node.provenance?.rawPayload,
  mcpTool: node.provenance?.mcpTool
});

export const persistGraphToNeo4j = async (nodes: GraphNode[], edges: GraphEdge[]): Promise<void> => {
  const session = getNeo4jDriver().session();

  try {
    await session.executeWrite(async (transaction) => {
      for (const node of nodes) {
        const temporal = temporalDefaults(node.createdAt, node);
        const provenance = provenanceDefaults(node);
        await transaction.run(
          `MATCH (previous:Entity {id: $id})
           WHERE previous.transactionTo > $transactionFrom
           SET previous.transactionTo = $transactionFrom`,
          { id: node.id, transactionFrom: temporal.transactionFrom }
        );
        await transaction.run(
          `MERGE (n:Entity {id: $id, transactionFrom: $transactionFrom})
             SET n += $properties,
               n.id = $id,
               n.typeId = $typeId,
               n.typeLabel = $typeLabel,
               n.sourceSystem = $sourceSystem,
               n.typeAttributesJson = $typeAttributesJson,
               n.createdAt = $createdAt,
               n.validFrom = $validFrom,
               n.validTo = $validTo,
               n.transactionTo = $transactionTo,
               n.provenanceJson = $provenanceJson`,
          {
            id: node.id,
            typeId: node.type.id,
            typeLabel: node.type.label,
            sourceSystem: node.sourceSystem,
            properties: asNeo4jProperties(node.properties),
            typeAttributesJson: JSON.stringify(node.type.attributes),
            createdAt: node.createdAt,
            ...temporal,
            provenanceJson: JSON.stringify(provenance)
          }
        );
      }

      for (const edge of edges) {
        const temporal = temporalDefaults(edge.validFrom, edge);
        await transaction.run(
          `MATCH (source {id: $source}), (target {id: $target})
           MATCH (source)-[previous:RELATED_TO {id: $id}]->(target)
           WHERE coalesce(previous.transactionTo, $openEnded) > $transactionFrom
           SET previous.transactionTo = $transactionFrom`,
          { id: edge.id, source: edge.source, target: edge.target, openEnded: DEFAULT_TEMPORAL_END, transactionFrom: temporal.transactionFrom }
        );
        await transaction.run(
          `MATCH (source {id: $source}), (target {id: $target})
           MERGE (source)-[r:RELATED_TO {id: $id, transactionFrom: $transactionFrom}]->(target)
             SET r += $properties,
               r.id = $id,
               r.relationship = $relationship,
               r.validFrom = $validFrom,
               r.validTo = $validTo,
               r.transactionTo = $transactionTo`,
          {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            relationship: edge.relationship,
            properties: asNeo4jProperties(edge.properties),
            openEnded: DEFAULT_TEMPORAL_END,
            ...temporal
          }
        );
      }
    });
  } finally {
    await session.close();
  }
};

export const queryGraphAtTimestamp = async (asOfDate: string): Promise<{ nodes: unknown[]; edges: unknown[] }> => {
  const session = getNeo4jDriver().session();

  try {
    const result = await session.executeRead((transaction) => transaction.run(
      `MATCH (n)
       WHERE n.validFrom <= $asOfDate AND n.validTo > $asOfDate
         AND n.transactionFrom <= $asOfDate AND n.transactionTo > $asOfDate
       OPTIONAL MATCH (n)-[r]->(m)
       WHERE r IS NULL OR (
         m.validFrom <= $asOfDate AND m.validTo > $asOfDate
         AND m.transactionFrom <= $asOfDate AND m.transactionTo > $asOfDate
         AND r.validFrom <= $asOfDate AND r.validTo > $asOfDate
         AND r.transactionFrom <= $asOfDate AND r.transactionTo > $asOfDate
       )
       RETURN n, r, m LIMIT 200`,
      { asOfDate }
    ));
    const nodes = new Map<string, unknown>();
    const edges: unknown[] = [];

    for (const record of result.records) {
      const source = record.get('n');
      const relationship = record.get('r');
      const target = record.get('m');
      nodes.set(source.elementId, {
        id: source.properties.id,
        type: {
          id: source.properties.typeId,
          label: source.properties.typeLabel,
          attributes: parsePrimitiveDictionary(source.properties.typeAttributesJson)
        },
        sourceSystem: source.properties.sourceSystem,
        properties: withoutKeys(source.properties, ['id', 'typeId', 'typeLabel', 'sourceSystem', 'typeAttributesJson', 'provenanceJson', 'createdAt', 'validFrom', 'validTo', 'transactionFrom', 'transactionTo']),
        createdAt: source.properties.createdAt,
        validFrom: source.properties.validFrom,
        validTo: source.properties.validTo,
        transactionFrom: source.properties.transactionFrom,
        transactionTo: source.properties.transactionTo,
        provenance: parseProvenance(source.properties.provenanceJson, source.properties)
      });
      if (target) nodes.set(target.elementId, {
        id: target.properties.id,
        type: {
          id: target.properties.typeId,
          label: target.properties.typeLabel,
          attributes: parsePrimitiveDictionary(target.properties.typeAttributesJson)
        },
        sourceSystem: target.properties.sourceSystem,
        properties: withoutKeys(target.properties, ['id', 'typeId', 'typeLabel', 'sourceSystem', 'typeAttributesJson', 'provenanceJson', 'createdAt', 'validFrom', 'validTo', 'transactionFrom', 'transactionTo']),
        createdAt: target.properties.createdAt,
        validFrom: target.properties.validFrom,
        validTo: target.properties.validTo,
        transactionFrom: target.properties.transactionFrom,
        transactionTo: target.properties.transactionTo,
        provenance: parseProvenance(target.properties.provenanceJson, target.properties)
      });
      if (relationship && target) edges.push({
        id: relationship.properties.id,
        source: source.properties.id,
        target: target.properties.id,
        relationship: relationship.properties.relationship,
        properties: withoutKeys(relationship.properties, ['id', 'relationship', 'validFrom', 'validTo', 'transactionFrom', 'transactionTo']),
        validFrom: relationship.properties.validFrom,
        validTo: relationship.properties.validTo,
        transactionFrom: relationship.properties.transactionFrom,
        transactionTo: relationship.properties.transactionTo
      });
    }

    return { nodes: [...nodes.values()], edges };
  } finally {
    await session.close();
  }
};

export const closeOntologyServices = async (): Promise<void> => {
  if (neo4jDriver) {
    await neo4jDriver.close();
    neo4jDriver = undefined;
  }
};

export const queryGraphFromNeo4j = (): Promise<{ nodes: unknown[]; edges: unknown[] }> => (
  queryGraphAtTimestamp(new Date().toISOString())
);