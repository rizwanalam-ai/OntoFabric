import OpenAI from 'openai';
import type { Record as Neo4jRecord } from 'neo4j-driver';
import { z } from 'zod';

import type { GraphNode, PrimitiveDictionary } from '@ontofabric/shared/types.js';
import { getNeo4jDriver } from './ontologyService.js';

const primitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const primitiveDictionary = z.record(primitive);
let openAiClient: OpenAI | undefined;

const getOpenAiClient = (): OpenAI => {
  openAiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openAiClient;
};

const ontologySchema = `GraphNode: id, type { id, label, attributes }, sourceSystem, properties, createdAt, validFrom, validTo, transactionFrom, transactionTo.
GraphEdge: id, source, target, relationship, properties, validFrom, validTo, transactionFrom, transactionTo.
Entity nodes are stored with label Entity and typeLabel, sourceSystem, id, and primitive properties. Relationships are stored with type RELATED_TO and a relationship property.`;

const normalizeValue = (value: unknown): unknown => {
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, normalizeValue(nested)]));
  }
  return value;
};

const nodeToGraphNode = (node: { properties: Record<string, unknown> }): GraphNode => {
  const properties = node.properties;
  const reserved = new Set(['id', 'typeId', 'typeLabel', 'sourceSystem', 'typeAttributesJson', 'provenanceJson', 'createdAt', 'validFrom', 'validTo', 'transactionFrom', 'transactionTo']);
  const nodeProperties: PrimitiveDictionary = {};
  for (const [key, value] of Object.entries(properties)) {
    const normalized = normalizeValue(value);
    if (!reserved.has(key) && (typeof normalized === 'string' || typeof normalized === 'number' || typeof normalized === 'boolean' || normalized === null)) {
      nodeProperties[key] = normalized;
    }
  }
  let attributes: PrimitiveDictionary = {};
  try {
    attributes = primitiveDictionary.parse(JSON.parse(String(properties.typeAttributesJson ?? '{}')));
  } catch {
    // Keep malformed legacy metadata out of the grounded response.
  }
  return {
    id: String(properties.id),
    type: { id: String(properties.typeId), label: String(properties.typeLabel), attributes },
    sourceSystem: properties.sourceSystem as GraphNode['sourceSystem'],
    properties: nodeProperties,
    createdAt: String(properties.createdAt),
    validFrom: String(properties.validFrom),
    validTo: String(properties.validTo),
    transactionFrom: String(properties.transactionFrom),
    transactionTo: String(properties.transactionTo),
    provenance: (() => {
      try { return JSON.parse(String(properties.provenanceJson)); } catch { return { sourceSystem: String(properties.sourceSystem), rawSourceId: String(properties.id), extractionTimestamp: String(properties.createdAt) }; }
    })()
  };
};

const collectNodes = (value: unknown, result: Map<string, GraphNode>): void => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectNodes(item, result));
    return;
  }
  if (!value || typeof value !== 'object') return;
  if ('properties' in value && 'elementId' in value) {
    const node = nodeToGraphNode(value as { properties: Record<string, unknown> });
    result.set(node.id, node);
    return;
  }
  Object.values(value).forEach((nested) => collectNodes(nested, result));
};

const serializeRecord = (record: Neo4jRecord): Record<string, unknown> => Object.fromEntries(
  record.keys.map((key) => [key, normalizeValue(record.get(key))])
);

export const translateToCypher = async (userPrompt: string, schema = ontologySchema): Promise<string> => {
  const completion = await getOpenAiClient().chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: `Translate the user's question into one executable, read-only Cypher query. Ontology schema:\n${schema}\nRules: return only Cypher; the query must begin with MATCH or WITH; use RETURN; never use CREATE, MERGE, SET, DELETE, REMOVE, DROP, CALL, LOAD CSV, FOREACH, or administrative procedures; never use multiple statements or comments.`
      },
      { role: 'user', content: userPrompt }
    ]
  });
  const query = completion.choices[0]?.message.content?.trim().replace(/^```(?:cypher)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!query) throw new Error('OpenAI returned an empty Cypher query.');
  return query;
};

export const validateReadOnlyCypher = (query: string): void => {
  const normalized = query.trim();
  if (!/^(MATCH|WITH)\b/i.test(normalized)) throw new Error('Only Cypher queries starting with MATCH or WITH are allowed.');
  if (normalized.includes(';') || /(--|\/\*)/.test(normalized)) throw new Error('Cypher comments and multiple statements are not allowed.');
  if (/\b(DELETE|DETACH|SET|CREATE|MERGE|REMOVE|DROP|CALL|LOAD\s+CSV|FOREACH|ALTER|RENAME|GRANT|DENY|REVOKE)\b/i.test(normalized)) {
    throw new Error('Write operations and administrative Cypher are not allowed.');
  }
};

export const extractSubgraphContext = async (entityIds: string[], hops = 2): Promise<string> => {
  const safeHops = Math.max(1, Math.min(4, Math.floor(hops)));
  const session = getNeo4jDriver().session();
  try {
    const result = await session.executeRead((transaction) => transaction.run(
      `MATCH p=(center:Entity)-[*1..${safeHops}]-(neighbor:Entity)
       WHERE center.id IN $entityIds
       RETURN [node IN nodes(p) | properties(node)] AS nodes,
              [edge IN relationships(p) | properties(edge)] AS relationships
       LIMIT 200`,
      { entityIds }
    ));
    return JSON.stringify({
      entityIds,
      hops: safeHops,
      paths: result.records.map(serializeRecord)
    });
  } finally {
    await session.close();
  }
};

export const executeGroundedQuery = async (userPrompt: string): Promise<{ answer: string; cypherQuery: string; sourceNodes: GraphNode[] }> => {
  const cypherQuery = await translateToCypher(userPrompt, ontologySchema);
  validateReadOnlyCypher(cypherQuery);
  const session = getNeo4jDriver().session();
  try {
    const result = await session.executeRead((transaction) => transaction.run(cypherQuery));
    const serializedResults = result.records.map(serializeRecord);
    const sourceNodeMap = new Map<string, GraphNode>();
    result.records.forEach((record) => Array.from(record.values()).forEach((value: unknown) => collectNodes(value, sourceNodeMap)));
    const context = JSON.stringify({ query: userPrompt, cypher: cypherQuery, results: serializedResults });
    const completion = await getOpenAiClient().chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: 'Answer only from the supplied graph results. Be concise and state when the graph does not contain enough information. Cite supporting node IDs inline using [node:<id>]. Do not invent entities, values, or citations.'
        },
        { role: 'user', content: `Question: ${userPrompt}\nGrounded graph result:\n${context}` }
      ]
    });
    return {
      answer: completion.choices[0]?.message.content?.trim() ?? 'The graph did not provide an answer.',
      cypherQuery,
      sourceNodes: [...sourceNodeMap.values()]
    };
  } finally {
    await session.close();
  }
};