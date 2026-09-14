import neo4j, { type Driver } from 'neo4j-driver';
import OpenAI from 'openai';
import { z } from 'zod';

import { domainSchemas } from '@ontofabric/shared/domainSchemas.js';
import { DEFAULT_TEMPORAL_END, type DomainContext, type GraphEdge, type GraphNode, type NodeProvenance, type PrimitiveDictionary } from '@ontofabric/shared/types.js';
import { anonymizeText } from './anonymizationService.js';

const primitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const primitiveDictionary = z.record(primitive);
const graphNodeSchema = z.object({
  id: z.string().min(1),
  type: z.object({ id: z.string().min(1), label: z.string().min(1), attributes: primitiveDictionary }),
  domain: z.enum(['SUPPLY_CHAIN', 'FINANCE', 'HEALTHCARE', 'HR_ORG', 'CUSTOM']).default('CUSTOM'),
  secondaryLabels: z.array(z.string()).default([]),
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
const ontologySchema = z.object({ nodes: z.array(graphNodeSchema), edges: z.array(graphEdgeSchema) }).strict();
const ontologyResponseFormat = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'ontology_extraction',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        nodes: { type: 'array', items: { type: 'object' } },
        edges: { type: 'array', items: { type: 'object' } }
      },
      required: ['nodes', 'edges']
    }
  }
};

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

const domainLabel = (domain: DomainContext): string => ({
  SUPPLY_CHAIN: 'SupplyChain',
  FINANCE: 'Finance',
  HEALTHCARE: 'Healthcare',
  HR_ORG: 'HROrg',
  CUSTOM: 'Custom'
})[domain];

const safeNeo4jLabel = (label: string): string => label.replace(/[^A-Za-z0-9_]/g, '_');

export const extractOntologyFromText = async (rawText: string, domain: DomainContext): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; privacy: { redactedCount: number; redactionId: string } }> => {
  const schema = domainSchemas[domain];
  const anonymized = await anonymizeText(rawText, domain);
  const completion = await getOpenAiClient().chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    temperature: 0,
    response_format: ontologyResponseFormat,
    messages: [
      {
        role: 'system',
        content: [
          'Extract an enterprise ontology from the supplied text.',
          'Return only a JSON object with exactly two arrays: nodes and edges.',
          'Each node must have id, type { id, label, attributes }, domain, secondaryLabels, sourceSystem, properties, createdAt, validFrom, validTo, transactionFrom, transactionTo, and provenance { sourceSystem, rawSourceId, filePath?, lineNumber?, extractionTimestamp, rawPayload?, mcpTool? }.',
          'Each edge must have id, source, target, relationship, properties, validFrom, validTo, transactionFrom, and transactionTo.',
          'Use primitive values only in attributes, properties, and edge properties.',
          'Use sourceSystem SME_INPUT when the source cannot be inferred.',
          `The selected domain is ${schema.displayName} (${domain}). ${schema.systemPromptRules}`,
          `Allowed node labels: ${schema.allowedNodeLabels.join(', ') || 'custom labels configured by the caller'}.`,
          `Allowed relationships: ${schema.allowedRelationships.join(', ') || 'custom relationships configured by the caller'}.`,
          'Return valid JSON matching exactly {"nodes": [...], "edges": [...]}. Do not return markdown or explanatory text.'
        ].join(' ')
      },
      { role: 'user', content: anonymized.sanitizedText }
    ]
  });

  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error('OpenAI returned an empty ontology response.');
  }

  const parsed = ontologySchema.parse(JSON.parse(content));
  const allowedNodeLabels = new Set(schema.allowedNodeLabels);
  const allowedRelationships = new Set(schema.allowedRelationships);
  if (domain !== 'CUSTOM' && parsed.nodes.some((node) => !allowedNodeLabels.has(node.type.label))) {
    throw new Error(`LLM returned a node label outside the ${domain} domain schema.`);
  }
  if (domain !== 'CUSTOM' && parsed.edges.some((edge) => !allowedRelationships.has(edge.relationship))) {
    throw new Error(`LLM returned a relationship outside the ${domain} domain schema.`);
  }

  return {
    nodes: parsed.nodes.map((node) => ({
      ...node,
      domain,
      secondaryLabels: [...new Set([domainLabel(domain), node.type.label, ...node.secondaryLabels])]
    })),
    edges: parsed.edges,
    privacy: {
      redactedCount: Object.keys(anonymized.redactionMap).length,
      redactionId: anonymized.redactionId
    }
  };
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
      const nodeBatch = nodes.map((node) => {
        const temporal = temporalDefaults(node.createdAt, node);
        return {
          id: node.id,
          typeId: node.type.id,
          typeLabel: safeNeo4jLabel(node.type.label),
          domain: node.domain,
          domainLabel: domainLabel(node.domain),
          secondaryLabels: node.secondaryLabels.map(safeNeo4jLabel),
          sourceSystem: node.sourceSystem,
          properties: asNeo4jProperties(node.properties),
          typeAttributesJson: JSON.stringify(node.type.attributes),
          createdAt: node.createdAt,
          provenanceJson: JSON.stringify(provenanceDefaults(node)),
          ...temporal
        };
      });
      if (nodeBatch.length > 0) {
        await transaction.run(
          `UNWIND $batch AS row
           MERGE (n:Entity {id: row.id})
           SET n += row.properties,
             n.id = row.id,
             n.typeId = row.typeId,
             n.typeLabel = row.typeLabel,
             n.domain = row.domain,
             n.secondaryLabels = row.secondaryLabels,
             n.sourceSystem = row.sourceSystem,
             n.typeAttributesJson = row.typeAttributesJson,
             n.createdAt = row.createdAt,
             n.validFrom = row.validFrom,
             n.validTo = row.validTo,
             n.transactionFrom = row.transactionFrom,
             n.transactionTo = row.transactionTo,
             n.provenanceJson = row.provenanceJson
           WITH n, row
           CALL apoc.create.addLabels(n, [row.domainLabel, row.typeLabel] + row.secondaryLabels) YIELD node
           RETURN count(node)`,
          { batch: nodeBatch }
        );
      }

      const edgeBatch = edges.map((edge) => ({
        ...edge,
        properties: asNeo4jProperties(edge.properties),
        ...temporalDefaults(edge.validFrom, edge)
      }));
      if (edgeBatch.length > 0) {
        await transaction.run(
          `UNWIND $batch AS row
           MATCH (source:Entity {id: row.source}), (target:Entity {id: row.target})
           MERGE (source)-[r:RELATED_TO {id: row.id, transactionFrom: row.transactionFrom}]->(target)
           SET r += row.properties,
             r.id = row.id,
             r.relationship = row.relationship,
             r.validFrom = row.validFrom,
             r.validTo = row.validTo,
             r.transactionTo = row.transactionTo
           RETURN count(r)`,
          { batch: edgeBatch }
        );
      }
    });
  } finally {
    await session.close();
  }
};

export const queryGraphAtTimestamp = async (asOfDate: string, domain?: DomainContext): Promise<{ nodes: unknown[]; edges: unknown[] }> => {
  const session = getNeo4jDriver().session();

  try {
    const result = await session.executeRead((transaction) => transaction.run(
      `MATCH (n)
       WHERE n.validFrom <= $asOfDate AND n.validTo > $asOfDate
         AND n.transactionFrom <= $asOfDate AND n.transactionTo > $asOfDate
       OPTIONAL MATCH (n)-[r]->(m)
       WHERE (r IS NULL OR (
         m.validFrom <= $asOfDate AND m.validTo > $asOfDate
         AND m.transactionFrom <= $asOfDate AND m.transactionTo > $asOfDate
         AND r.validFrom <= $asOfDate AND r.validTo > $asOfDate
         AND r.transactionFrom <= $asOfDate AND r.transactionTo > $asOfDate
       ))
       AND ($domain IS NULL OR n.domain = $domain OR m.domain = $domain)
       RETURN n, r, m LIMIT 200`,
      { asOfDate, domain: domain ?? null }
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
        domain: source.properties.domain ?? 'CUSTOM',
        secondaryLabels: Array.isArray(source.properties.secondaryLabels) ? source.properties.secondaryLabels : [],
        sourceSystem: source.properties.sourceSystem,
        properties: withoutKeys(source.properties, ['id', 'typeId', 'typeLabel', 'domain', 'secondaryLabels', 'sourceSystem', 'typeAttributesJson', 'provenanceJson', 'createdAt', 'validFrom', 'validTo', 'transactionFrom', 'transactionTo']),
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
        domain: target.properties.domain ?? 'CUSTOM',
        secondaryLabels: Array.isArray(target.properties.secondaryLabels) ? target.properties.secondaryLabels : [],
        sourceSystem: target.properties.sourceSystem,
        properties: withoutKeys(target.properties, ['id', 'typeId', 'typeLabel', 'domain', 'secondaryLabels', 'sourceSystem', 'typeAttributesJson', 'provenanceJson', 'createdAt', 'validFrom', 'validTo', 'transactionFrom', 'transactionTo']),
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

export const queryGraphFromNeo4j = (domain?: DomainContext): Promise<{ nodes: unknown[]; edges: unknown[] }> => (
  queryGraphAtTimestamp(new Date().toISOString(), domain)
);