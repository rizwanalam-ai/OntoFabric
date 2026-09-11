import OpenAI from 'openai';
import { z } from 'zod';
import { getNeo4jDriver } from './ontologyService.js';
const primitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const primitiveDictionary = z.record(primitive);
let openAiClient;
const getOpenAiClient = () => {
    openAiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openAiClient;
};
const ontologySchema = `GraphNode: id, type { id, label, attributes }, sourceSystem, properties, createdAt, validFrom, validTo, transactionFrom, transactionTo.
GraphEdge: id, source, target, relationship, properties, validFrom, validTo, transactionFrom, transactionTo.
Entity nodes are stored with label Entity and typeLabel, sourceSystem, id, and primitive properties. Relationships are stored with type RELATED_TO and a relationship property.`;
const normalizeValue = (value) => {
    if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
        return value.toNumber();
    }
    if (Array.isArray(value))
        return value.map(normalizeValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, normalizeValue(nested)]));
    }
    return value;
};
const nodeToGraphNode = (node) => {
    const properties = node.properties;
    const reserved = new Set(['id', 'typeId', 'typeLabel', 'sourceSystem', 'typeAttributesJson', 'provenanceJson', 'createdAt', 'validFrom', 'validTo', 'transactionFrom', 'transactionTo']);
    const nodeProperties = {};
    for (const [key, value] of Object.entries(properties)) {
        const normalized = normalizeValue(value);
        if (!reserved.has(key) && (typeof normalized === 'string' || typeof normalized === 'number' || typeof normalized === 'boolean' || normalized === null)) {
            nodeProperties[key] = normalized;
        }
    }
    let attributes = {};
    try {
        attributes = primitiveDictionary.parse(JSON.parse(String(properties.typeAttributesJson ?? '{}')));
    }
    catch {
        // Keep malformed legacy metadata out of the grounded response.
    }
    return {
        id: String(properties.id),
        type: { id: String(properties.typeId), label: String(properties.typeLabel), attributes },
        sourceSystem: properties.sourceSystem,
        properties: nodeProperties,
        createdAt: String(properties.createdAt),
        validFrom: String(properties.validFrom),
        validTo: String(properties.validTo),
        transactionFrom: String(properties.transactionFrom),
        transactionTo: String(properties.transactionTo),
        provenance: (() => {
            try {
                return JSON.parse(String(properties.provenanceJson));
            }
            catch {
                return { sourceSystem: String(properties.sourceSystem), rawSourceId: String(properties.id), extractionTimestamp: String(properties.createdAt) };
            }
        })()
    };
};
const collectNodes = (value, result) => {
    if (Array.isArray(value)) {
        value.forEach((item) => collectNodes(item, result));
        return;
    }
    if (!value || typeof value !== 'object')
        return;
    if ('properties' in value && 'elementId' in value) {
        const node = nodeToGraphNode(value);
        result.set(node.id, node);
        return;
    }
    Object.values(value).forEach((nested) => collectNodes(nested, result));
};
const serializeRecord = (record) => Object.fromEntries(record.keys.map((key) => [key, normalizeValue(record.get(key))]));
export const translateToCypher = async (userPrompt, schema = ontologySchema) => {
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
    if (!query)
        throw new Error('OpenAI returned an empty Cypher query.');
    return query;
};
export const validateReadOnlyCypher = (query) => {
    const normalized = query.trim();
    if (!/^(MATCH|WITH)\b/i.test(normalized))
        throw new Error('Only Cypher queries starting with MATCH or WITH are allowed.');
    if (normalized.includes(';') || /(--|\/\*)/.test(normalized))
        throw new Error('Cypher comments and multiple statements are not allowed.');
    if (/\b(DELETE|DETACH|SET|CREATE|MERGE|REMOVE|DROP|CALL|LOAD\s+CSV|FOREACH|ALTER|RENAME|GRANT|DENY|REVOKE)\b/i.test(normalized)) {
        throw new Error('Write operations and administrative Cypher are not allowed.');
    }
};
export const extractSubgraphContext = async (entityIds, hops = 2) => {
    const safeHops = Math.max(1, Math.min(4, Math.floor(hops)));
    const session = getNeo4jDriver().session();
    try {
        const result = await session.executeRead((transaction) => transaction.run(`MATCH p=(center:Entity)-[*1..${safeHops}]-(neighbor:Entity)
       WHERE center.id IN $entityIds
       RETURN [node IN nodes(p) | properties(node)] AS nodes,
              [edge IN relationships(p) | properties(edge)] AS relationships
       LIMIT 200`, { entityIds }));
        return JSON.stringify({
            entityIds,
            hops: safeHops,
            paths: result.records.map(serializeRecord)
        });
    }
    finally {
        await session.close();
    }
};
export const executeGroundedQuery = async (userPrompt) => {
    const cypherQuery = await translateToCypher(userPrompt, ontologySchema);
    validateReadOnlyCypher(cypherQuery);
    const session = getNeo4jDriver().session();
    try {
        const result = await session.executeRead((transaction) => transaction.run(cypherQuery));
        const serializedResults = result.records.map(serializeRecord);
        const sourceNodeMap = new Map();
        result.records.forEach((record) => Array.from(record.values()).forEach((value) => collectNodes(value, sourceNodeMap)));
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
    }
    finally {
        await session.close();
    }
};
//# sourceMappingURL=graphRagService.js.map