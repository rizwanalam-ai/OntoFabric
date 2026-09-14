import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { DEFAULT_TEMPORAL_END } from '@ontofabric/shared/types.js';
import { getUserRole, redactNodeProperties } from '../middleware/abacMiddleware.js';
import { callExcelParser, callPdfParser } from '../mcpClient.js';
import { extractOntologyFromText, persistGraphToNeo4j, queryGraphAtTimestamp, queryGraphFromNeo4j } from '../services/ontologyService.js';
import { executeGroundedQuery } from '../services/graphRagService.js';
import { rehydrateText } from '../services/anonymizationService.js';
import { applyHealedMappings, detectSchemaDrift, resolveExpectedSchema } from '../services/schemaDriftService.js';
import { executeLocalGraphUpdate, executeWriteBackAction } from '../services/actionEngineService.js';
import { syncSapSandbox } from '../services/sapService.js';
const router = Router();
const primitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const primitiveDictionary = z.record(primitive);
const domainSchema = z.enum(['SUPPLY_CHAIN', 'FINANCE', 'HEALTHCARE', 'HR_ORG', 'CUSTOM']);
const ingestFileSchema = z.object({
    filePath: z.string().trim().min(1),
    sourceType: z.enum(['EXCEL', 'PDF']).optional(),
    domain: domainSchema.optional(),
    targetEntity: z.string().trim().min(1).optional()
}).strict();
const smeNodeSchema = z.object({
    id: z.string().trim().min(1),
    type: z.object({
        id: z.string().trim().min(1),
        label: z.string().trim().min(1),
        attributes: primitiveDictionary.default({})
    }).strict(),
    domain: domainSchema.default('CUSTOM'),
    secondaryLabels: z.array(z.string()).default([]),
    sourceSystem: z.enum(['ERP', 'CRM', 'EXCEL', 'PDF', 'SME_INPUT']).default('SME_INPUT'),
    properties: primitiveDictionary.default({}),
    createdAt: z.string().trim().min(1).optional(),
    validFrom: z.string().datetime().optional(),
    validTo: z.string().datetime().optional(),
    transactionFrom: z.string().datetime().optional(),
    transactionTo: z.string().datetime().optional(),
    provenance: z.object({
        sourceSystem: z.string(), rawSourceId: z.string(), filePath: z.string().optional(), lineNumber: z.number().int().optional(),
        extractionTimestamp: z.string(), rawPayload: z.string().optional(), mcpTool: z.string().optional()
    }).optional()
}).strict();
const smeEdgeSchema = z.object({
    id: z.string().trim().min(1),
    source: z.string().trim().min(1),
    target: z.string().trim().min(1),
    relationship: z.string().trim().min(1),
    properties: primitiveDictionary.default({}),
    validFrom: z.string().datetime().optional(),
    validTo: z.string().datetime().optional(),
    transactionFrom: z.string().datetime().optional(),
    transactionTo: z.string().datetime().optional()
}).strict();
const smeEntitySchema = z.object({
    node: smeNodeSchema.optional(),
    edge: smeEdgeSchema.optional()
}).strict().refine((value) => Boolean(value.node) !== Boolean(value.edge), {
    message: 'Provide exactly one of node or edge.'
});
const errorMessage = (error) => error instanceof Error ? error.message : 'Request failed.';
const graphQuerySchema = z.object({ prompt: z.string().trim().min(1).max(4000), domain: domainSchema.default('CUSTOM') }).strict();
const schemaDriftCheckSchema = z.object({
    sourceSystem: z.string().trim().min(1),
    incomingSample: z.record(z.unknown()),
    targetEntity: z.string().trim().min(1)
}).strict();
const rehydrateSchema = z.object({
    sanitizedText: z.string(),
    redactionId: z.string().min(1)
}).strict();
const actionSchema = z.object({
    actionType: z.enum(['update_sap_purchase_order', 'update_crm_account_status']),
    payload: z.record(z.unknown())
}).strict();
const localActionSchema = z.object({
    nodeId: z.string().trim().min(1),
    oldValues: z.record(z.unknown()).default({}),
    newValues: z.record(z.unknown())
}).strict();
router.post('/privacy/rehydrate', async (request, response) => {
    const parsedRequest = rehydrateSchema.safeParse(request.body);
    if (!parsedRequest.success) {
        response.status(400).json({ error: 'Invalid rehydration request.', details: parsedRequest.error.flatten() });
        return;
    }
    try {
        response.json({ text: rehydrateText(parsedRequest.data.sanitizedText, parsedRequest.data.redactionId, getUserRole(request)) });
    }
    catch (error) {
        response.status(403).json({ error: 'Rehydration is not authorized or the cache entry has expired.', message: errorMessage(error) });
    }
});
router.post('/actions/write-back', async (request, response) => {
    const parsedRequest = actionSchema.safeParse(request.body);
    if (!parsedRequest.success) {
        response.status(400).json({ error: 'Invalid write-back action request.', details: parsedRequest.error.flatten() });
        return;
    }
    try {
        const userId = request.header('x-user-id') ?? `role:${getUserRole(request)}`;
        const result = await executeWriteBackAction(parsedRequest.data.actionType, { ...parsedRequest.data.payload, userId });
        response.json(result);
    }
    catch (error) {
        response.status(502).json({ error: 'Write-back action failed.', message: errorMessage(error) });
    }
});
router.post('/actions/local-update', async (request, response) => {
    const parsedRequest = localActionSchema.safeParse(request.body);
    if (!parsedRequest.success) {
        response.status(400).json({ error: 'Invalid local graph update request.', details: parsedRequest.error.flatten() });
        return;
    }
    try {
        const userId = request.header('x-user-id') ?? `role:${getUserRole(request)}`;
        response.json(await executeLocalGraphUpdate({ ...parsedRequest.data, userId }));
    }
    catch (error) {
        response.status(502).json({ error: 'Local graph update failed.', message: errorMessage(error) });
    }
});
router.post('/schema/drift-check', async (request, response) => {
    const parsedRequest = schemaDriftCheckSchema.safeParse(request.body);
    if (!parsedRequest.success) {
        response.status(400).json({ error: 'Invalid schema drift request.', details: parsedRequest.error.flatten() });
        return;
    }
    try {
        const expectedSchema = await resolveExpectedSchema(parsedRequest.data.targetEntity);
        const result = await detectSchemaDrift([parsedRequest.data.incomingSample], expectedSchema, parsedRequest.data.sourceSystem);
        response.json(result);
    }
    catch (error) {
        response.status(502).json({ error: 'Schema drift check failed.', message: errorMessage(error) });
    }
});
router.post('/chat/graph-query', async (request, response) => {
    const parsedRequest = graphQuerySchema.safeParse(request.body);
    if (!parsedRequest.success) {
        response.status(400).json({ error: 'Invalid graph query request.', details: parsedRequest.error.flatten() });
        return;
    }
    try {
        const result = await executeGroundedQuery(parsedRequest.data.prompt, parsedRequest.data.domain);
        response.json({ ...result, sourceNodes: redactNodeProperties(result.sourceNodes, getUserRole(request)) });
    }
    catch (error) {
        response.status(502).json({ error: 'Grounded graph query failed.', message: errorMessage(error) });
    }
});
router.post('/ingest/file', async (request, response) => {
    const parsedRequest = ingestFileSchema.safeParse(request.body);
    if (!parsedRequest.success) {
        response.status(400).json({ error: 'Invalid file ingestion request.', details: parsedRequest.error.flatten() });
        return;
    }
    const queryDomain = domainSchema.safeParse(request.query.domain);
    if (request.query.domain !== undefined && !queryDomain.success) {
        response.status(400).json({ error: 'Invalid domain query parameter.', details: queryDomain.error.flatten() });
        return;
    }
    const { filePath, sourceType, targetEntity } = parsedRequest.data;
    const domain = queryDomain.success ? queryDomain.data : parsedRequest.data.domain ?? 'CUSTOM';
    const detectedSourceType = sourceType
        ?? (path.extname(filePath).toLowerCase() === '.pdf' ? 'PDF' : 'EXCEL');
    try {
        const parsedSource = detectedSourceType === 'PDF'
            ? await callPdfParser(filePath)
            : await callExcelParser(filePath);
        let sourceForExtraction = parsedSource;
        let schemaDrift;
        if (targetEntity) {
            try {
                const expectedSchema = await resolveExpectedSchema(targetEntity);
                const samples = Array.isArray(parsedSource)
                    ? parsedSource.filter((item) => Boolean(item) && typeof item === 'object' && !Array.isArray(item)).slice(0, 25)
                    : [parsedSource];
                schemaDrift = await detectSchemaDrift(samples, expectedSchema, detectedSourceType);
                if (Array.isArray(parsedSource) && Object.keys(schemaDrift.healedMappings).length > 0) {
                    sourceForExtraction = applyHealedMappings(parsedSource, schemaDrift.healedMappings);
                }
            }
            catch {
                // Drift detection is advisory and must not block document ingestion.
            }
        }
        const rawText = detectedSourceType === 'PDF'
            ? z.object({ text: z.string() }).passthrough().parse(sourceForExtraction).text
            : JSON.stringify(sourceForExtraction);
        const graph = await extractOntologyFromText(rawText, domain);
        const nodes = graph.nodes.map((node) => ({ ...node, domain, sourceSystem: node.sourceSystem ?? detectedSourceType }));
        await persistGraphToNeo4j(nodes, graph.edges);
        response.status(201).json({ sourceType: detectedSourceType, domain, schemaDrift, ...graph, nodes: redactNodeProperties(nodes, getUserRole(request)) });
    }
    catch (error) {
        response.status(502).json({ error: 'File ingestion failed.', message: errorMessage(error) });
    }
});
router.post('/integrations/sap/sync', async (_request, response) => {
    try {
        const result = await syncSapSandbox();
        await persistGraphToNeo4j(result.nodes, []);
        response.status(201).json({ sourceType: result.sourceType, entityType: result.entityType, count: result.count });
    }
    catch (error) {
        response.status(502).json({ error: 'SAP sandbox sync failed.', message: errorMessage(error) });
    }
});
router.get('/ontology/graph', async (request, response) => {
    try {
        const asOfTimestamp = typeof request.query.asOfTimestamp === 'string' ? request.query.asOfTimestamp : undefined;
        const domain = typeof request.query.domain === 'string' ? domainSchema.safeParse(request.query.domain) : undefined;
        if (domain && !domain.success) {
            response.status(400).json({ error: 'domain must be a supported domain context.', details: domain.error.flatten() });
            return;
        }
        if (asOfTimestamp && Number.isNaN(Date.parse(asOfTimestamp))) {
            response.status(400).json({ error: 'asOfTimestamp must be a valid ISO date.' });
            return;
        }
        const selectedDomain = domain?.success ? domain.data : undefined;
        const graph = asOfTimestamp
            ? await queryGraphAtTimestamp(new Date(asOfTimestamp).toISOString(), selectedDomain)
            : await queryGraphFromNeo4j(selectedDomain);
        response.json({ ...graph, nodes: redactNodeProperties(graph.nodes, getUserRole(request)) });
    }
    catch (error) {
        response.status(503).json({ error: 'Unable to query ontology graph.', message: errorMessage(error) });
    }
});
router.post('/sme/entity', async (request, response) => {
    const parsedRequest = smeEntitySchema.safeParse(request.body);
    if (!parsedRequest.success) {
        response.status(400).json({ error: 'Invalid SME entity request.', details: parsedRequest.error.flatten() });
        return;
    }
    try {
        if (parsedRequest.data.node) {
            const node = {
                ...parsedRequest.data.node,
                createdAt: parsedRequest.data.node.createdAt ?? new Date().toISOString(),
                validFrom: parsedRequest.data.node.validFrom ?? parsedRequest.data.node.createdAt ?? new Date().toISOString(),
                validTo: parsedRequest.data.node.validTo ?? DEFAULT_TEMPORAL_END,
                transactionFrom: parsedRequest.data.node.transactionFrom ?? new Date().toISOString(),
                transactionTo: parsedRequest.data.node.transactionTo ?? DEFAULT_TEMPORAL_END,
                provenance: parsedRequest.data.node.provenance ?? {
                    sourceSystem: parsedRequest.data.node.sourceSystem ?? 'SME_INPUT',
                    rawSourceId: parsedRequest.data.node.id,
                    extractionTimestamp: new Date().toISOString()
                }
            };
            await persistGraphToNeo4j([node], []);
            response.status(201).json({ node });
            return;
        }
        const edgeInput = parsedRequest.data.edge;
        const edge = {
            ...edgeInput,
            validFrom: edgeInput?.validFrom ?? new Date().toISOString(),
            validTo: edgeInput?.validTo ?? DEFAULT_TEMPORAL_END,
            transactionFrom: edgeInput?.transactionFrom ?? new Date().toISOString(),
            transactionTo: edgeInput?.transactionTo ?? DEFAULT_TEMPORAL_END
        };
        await persistGraphToNeo4j([], [edge]);
        response.status(201).json({ edge });
    }
    catch (error) {
        response.status(503).json({ error: 'Unable to persist SME entity.', message: errorMessage(error) });
    }
});
export default router;
//# sourceMappingURL=api.js.map