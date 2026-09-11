import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { DEFAULT_TEMPORAL_END } from '@ontofabric/shared/types.js';
import { getUserRole, redactNodeProperties } from '../middleware/abacMiddleware.js';
import { callExcelParser, callPdfParser } from '../mcpClient.js';
import { extractOntologyFromText, persistGraphToNeo4j, queryGraphAtTimestamp, queryGraphFromNeo4j } from '../services/ontologyService.js';
import { executeGroundedQuery } from '../services/graphRagService.js';
import { syncSapSandbox } from '../services/sapService.js';
const router = Router();
const primitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const primitiveDictionary = z.record(primitive);
const ingestFileSchema = z.object({
    filePath: z.string().trim().min(1),
    sourceType: z.enum(['EXCEL', 'PDF']).optional()
}).strict();
const smeNodeSchema = z.object({
    id: z.string().trim().min(1),
    type: z.object({
        id: z.string().trim().min(1),
        label: z.string().trim().min(1),
        attributes: primitiveDictionary.default({})
    }).strict(),
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
const graphQuerySchema = z.object({ prompt: z.string().trim().min(1).max(4000) }).strict();
router.post('/chat/graph-query', async (request, response) => {
    const parsedRequest = graphQuerySchema.safeParse(request.body);
    if (!parsedRequest.success) {
        response.status(400).json({ error: 'Invalid graph query request.', details: parsedRequest.error.flatten() });
        return;
    }
    try {
        const result = await executeGroundedQuery(parsedRequest.data.prompt);
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
    const { filePath, sourceType } = parsedRequest.data;
    const detectedSourceType = sourceType
        ?? (path.extname(filePath).toLowerCase() === '.pdf' ? 'PDF' : 'EXCEL');
    try {
        const parsedSource = detectedSourceType === 'PDF'
            ? await callPdfParser(filePath)
            : await callExcelParser(filePath);
        const rawText = detectedSourceType === 'PDF'
            ? z.object({ text: z.string() }).passthrough().parse(parsedSource).text
            : JSON.stringify(parsedSource);
        const graph = await extractOntologyFromText(rawText);
        const nodes = graph.nodes.map((node) => ({ ...node, sourceSystem: node.sourceSystem ?? detectedSourceType }));
        await persistGraphToNeo4j(nodes, graph.edges);
        response.status(201).json({ sourceType: detectedSourceType, ...graph, nodes: redactNodeProperties(nodes, getUserRole(request)) });
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
        if (asOfTimestamp && Number.isNaN(Date.parse(asOfTimestamp))) {
            response.status(400).json({ error: 'asOfTimestamp must be a valid ISO date.' });
            return;
        }
        const graph = asOfTimestamp ? await queryGraphAtTimestamp(new Date(asOfTimestamp).toISOString()) : await queryGraphFromNeo4j();
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