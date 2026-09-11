import { createHash } from 'node:crypto';
import { DEFAULT_TEMPORAL_END } from '@ontofabric/shared/types.js';
import { z } from 'zod';
import { getNeo4jDriver } from './ontologyService.js';
import OpenAI from 'openai';
const primitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const primitiveDictionary = z.record(primitive);
const graphNodeSchema = z.object({
    id: z.string(),
    type: z.object({ id: z.string(), label: z.string(), attributes: primitiveDictionary }),
    sourceSystem: z.enum(['ERP', 'CRM', 'EXCEL', 'PDF', 'SME_INPUT']),
    properties: primitiveDictionary,
    createdAt: z.string(),
    validFrom: z.string(),
    validTo: z.string(),
    transactionFrom: z.string(),
    transactionTo: z.string(),
    provenance: z.object({
        sourceSystem: z.string(), rawSourceId: z.string(), filePath: z.string().optional(), lineNumber: z.number().int().optional(),
        extractionTimestamp: z.string(), rawPayload: z.string().optional(), mcpTool: z.string().optional()
    })
});
let openAiClient;
const getOpenAiClient = () => {
    openAiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openAiClient;
};
const asText = (value) => String(value ?? '').trim();
const jaroWinkler = (first, second) => {
    const a = first.toLowerCase().trim();
    const b = second.toLowerCase().trim();
    if (!a || !b)
        return 0;
    if (a === b)
        return 1;
    const distance = Math.floor(Math.max(a.length, b.length) / 2) - 1;
    const aMatches = new Array(a.length).fill(false);
    const bMatches = new Array(b.length).fill(false);
    let matches = 0;
    for (let index = 0; index < a.length; index += 1) {
        for (let candidate = Math.max(0, index - distance); candidate <= Math.min(index + distance, b.length - 1); candidate += 1) {
            if (!bMatches[candidate] && a[index] === b[candidate]) {
                aMatches[index] = true;
                bMatches[candidate] = true;
                matches += 1;
                break;
            }
        }
    }
    if (!matches)
        return 0;
    const aSequence = a.split('').filter((_, index) => aMatches[index]);
    const bSequence = b.split('').filter((_, index) => bMatches[index]);
    let transpositions = 0;
    for (let index = 0; index < aSequence.length; index += 1) {
        if (aSequence[index] !== bSequence[index])
            transpositions += 1;
    }
    const jaro = (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
    let prefix = 0;
    while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix])
        prefix += 1;
    return jaro + prefix * 0.1 * (1 - jaro);
};
const cosineSimilarity = (first, second) => {
    const dot = first.reduce((sum, value, index) => sum + value * (second[index] ?? 0), 0);
    const firstMagnitude = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
    const secondMagnitude = Math.sqrt(second.reduce((sum, value) => sum + value * value, 0));
    return firstMagnitude && secondMagnitude ? dot / (firstMagnitude * secondMagnitude) : 0;
};
const embeddingSimilarity = async (first, second) => {
    if (!first || !second || !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_key')
        return null;
    const response = await getOpenAiClient().embeddings.create({
        model: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
        input: [first, second]
    });
    return cosineSimilarity(response.data[0].embedding, response.data[1].embedding);
};
export const calculateSimilarity = async (entityA, entityB) => {
    const nameA = asText(entityA.properties.name ?? entityA.properties.label ?? entityA.id);
    const nameB = asText(entityB.properties.name ?? entityB.properties.label ?? entityB.id);
    const nameScore = jaroWinkler(nameA, nameB);
    const descriptionScore = await embeddingSimilarity(asText(entityA.properties.description), asText(entityB.properties.description));
    const propertyKeys = [...new Set([...Object.keys(entityA.properties), ...Object.keys(entityB.properties)])]
        .filter((key) => !['name', 'description'].includes(key));
    const propertyScore = propertyKeys.length === 0 ? nameScore : propertyKeys.reduce((sum, key) => (sum + (entityA.properties[key] !== undefined && entityA.properties[key] === entityB.properties[key] ? 1 : 0)), 0) / propertyKeys.length;
    const score = descriptionScore === null
        ? nameScore * 0.75 + propertyScore * 0.25
        : nameScore * 0.5 + descriptionScore * 0.35 + propertyScore * 0.15;
    return Number(Math.max(0, Math.min(1, score)).toFixed(4));
};
const nodeFromRecord = (raw) => {
    const properties = raw.properties;
    const excluded = new Set(['id', 'typeId', 'typeLabel', 'sourceSystem', 'typeAttributesJson', 'createdAt', 'validFrom', 'validTo', 'transactionFrom', 'transactionTo']);
    const nodeProperties = {};
    for (const [key, value] of Object.entries(properties)) {
        if (!excluded.has(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null)) {
            nodeProperties[key] = value;
        }
    }
    let attributes = {};
    try {
        attributes = primitiveDictionary.parse(JSON.parse(asText(properties.typeAttributesJson)));
    }
    catch {
        // Older records may not have serialized type attributes.
    }
    return graphNodeSchema.parse({
        id: properties.id,
        type: { id: properties.typeId, label: properties.typeLabel, attributes },
        sourceSystem: properties.sourceSystem,
        properties: nodeProperties,
        createdAt: properties.createdAt,
        validFrom: properties.validFrom ?? properties.createdAt,
        validTo: properties.validTo ?? DEFAULT_TEMPORAL_END,
        transactionFrom: properties.transactionFrom ?? properties.createdAt,
        transactionTo: properties.transactionTo ?? DEFAULT_TEMPORAL_END,
        provenance: (() => {
            try {
                return JSON.parse(String(properties.provenanceJson));
            }
            catch {
                return { sourceSystem: String(properties.sourceSystem), rawSourceId: String(properties.id), extractionTimestamp: String(properties.createdAt) };
            }
        })()
    });
};
const pendingIdFor = (first, second) => createHash('sha256')
    .update([first, second].sort().join('|'))
    .digest('hex')
    .slice(0, 24);
const mergeNodes = async (transaction, entityAId, entityBId, action) => {
    await transaction.run(`MATCH (a:Entity {id: $entityAId}), (b:Entity {id: $entityBId})
     MERGE (a)-[r:${action === 'MERGE' ? 'SAME_AS' : 'ALIAS_OF'} {id: $relationshipId}]->(b)
     SET r.confidence = 1.0, r.resolvedAt = $resolvedAt, r.resolutionAction = $action,
         b.canonicalId = CASE WHEN $action = 'MERGE' THEN a.id ELSE coalesce(b.canonicalId, b.id) END,
         b.lineageStatus = CASE WHEN $action = 'MERGE' THEN 'MERGED' ELSE 'ALIASED' END,
         b.resolvedAt = $resolvedAt,
         b.resolutionAction = $action`, {
        entityAId,
        entityBId,
        relationshipId: `${action}-${pendingIdFor(entityAId, entityBId)}`,
        resolvedAt: new Date().toISOString(),
        action
    });
};
export const findCandidateDuplicates = async (newNode, threshold = 0.70) => {
    const session = getNeo4jDriver().session();
    const candidates = [];
    try {
        const result = await session.executeRead((transaction) => transaction.run('MATCH (n:Entity) WHERE n.typeLabel = $typeLabel AND n.id <> $id RETURN n LIMIT 500', { typeLabel: newNode.type.label, id: newNode.id }));
        for (const record of result.records) {
            const existing = nodeFromRecord(record.get('n'));
            const confidence = await calculateSimilarity(newNode, existing);
            if (confidence < threshold)
                continue;
            const pendingId = pendingIdFor(newNode.id, existing.id);
            const conflicts = [...new Set([...Object.keys(newNode.properties), ...Object.keys(existing.properties)])]
                .filter((key) => newNode.properties[key] !== undefined && existing.properties[key] !== undefined && newNode.properties[key] !== existing.properties[key]);
            if (confidence >= 0.92) {
                await session.executeWrite((transaction) => mergeNodes(transaction, newNode.id, existing.id, 'MERGE'));
            }
            else {
                await session.executeWrite((transaction) => transaction.run(`MERGE (p:PendingReview {pendingId: $pendingId})
           SET p.entityAId = $entityAId, p.entityBId = $entityBId,
               p.entityAJson = $entityAJson, p.entityBJson = $entityBJson,
               p.confidence = $confidence, p.conflictsJson = $conflictsJson,
               p.status = 'PENDING', p.createdAt = $createdAt`, { pendingId, entityAId: newNode.id, entityBId: existing.id, entityAJson: JSON.stringify(newNode), entityBJson: JSON.stringify(existing), confidence, conflictsJson: JSON.stringify(conflicts), createdAt: new Date().toISOString() }));
                candidates.push({ pendingId, entityA: newNode, entityB: existing, confidence, conflicts, status: 'PENDING', createdAt: new Date().toISOString() });
            }
        }
        return candidates;
    }
    finally {
        await session.close();
    }
};
export const getPendingMatches = async () => {
    const session = getNeo4jDriver().session();
    try {
        const result = await session.executeRead((transaction) => transaction.run(`MATCH (p:PendingReview {status: 'PENDING'}) RETURN p ORDER BY p.createdAt DESC LIMIT 200`));
        return result.records.map((record) => {
            const properties = record.get('p').properties;
            return {
                pendingId: asText(properties.pendingId),
                entityA: JSON.parse(asText(properties.entityAJson)),
                entityB: JSON.parse(asText(properties.entityBJson)),
                confidence: Number(properties.confidence),
                conflicts: JSON.parse(asText(properties.conflictsJson)),
                status: 'PENDING',
                createdAt: asText(properties.createdAt)
            };
        });
    }
    finally {
        await session.close();
    }
};
export const resolvePendingMatch = async (pendingId, action) => {
    const session = getNeo4jDriver().session();
    try {
        await session.executeWrite(async (transaction) => {
            const result = await transaction.run(`MATCH (p:PendingReview {pendingId: $pendingId, status: 'PENDING'}) RETURN p`, { pendingId });
            const pending = result.records[0]?.get('p')?.properties;
            if (!pending)
                throw new Error('Pending match was not found or was already resolved.');
            if (action === 'MERGE' || action === 'LINK') {
                await mergeNodes(transaction, asText(pending.entityAId), asText(pending.entityBId), action);
            }
            await transaction.run(`MATCH (p:PendingReview {pendingId: $pendingId})
         SET p.status = $status, p.resolvedAt = $resolvedAt, p.resolutionAction = $action`, { pendingId, status: action === 'REJECT' ? 'REJECTED' : 'RESOLVED', resolvedAt: new Date().toISOString(), action });
        });
    }
    finally {
        await session.close();
    }
};
//# sourceMappingURL=entityResolutionService.js.map