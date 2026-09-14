import { Router } from 'express';
import OpenAI from 'openai';
import { z } from 'zod';

import { domainSchemas, updateDomainSchema } from '@ontofabric/shared/domainSchemas.js';
import type { DomainContext, DomainSchemaConfig } from '@ontofabric/shared/types.js';
import { getNeo4jDriver } from '../services/ontologyService.js';

const router = Router();
const domainSchema = z.enum(['SUPPLY_CHAIN', 'FINANCE', 'HEALTHCARE', 'HR_ORG', 'CUSTOM']);
const primitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const entityTypeSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  attributes: z.record(primitive),
  attributeTypes: z.record(z.enum(['string', 'number', 'boolean', 'date'])).optional(),
  primaryKeys: z.array(z.string()).optional(),
  requiredProperties: z.array(z.string()).optional()
}).strict();
const relationTypeSchema = z.object({
  id: z.string().trim().min(1),
  sourceTypeId: z.string().trim().min(1),
  targetTypeId: z.string().trim().min(1),
  relationName: z.string().trim().min(1)
}).strict();
const customSchema = z.object({
  domain: domainSchema,
  nodeTypes: z.array(entityTypeSchema),
  relationTypes: z.array(relationTypeSchema)
}).strict();
const saveSchema = customSchema;
const promptSchema = z.object({
  domain: domainSchema,
  prompt: z.string().trim().min(1).max(4000)
}).strict();

const safeIdentifier = (value: string): string => value.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[^A-Za-z_]+/, '_').slice(0, 64);

const validateSchemaReferences = (nodeTypes: z.infer<typeof entityTypeSchema>[], relationTypes: z.infer<typeof relationTypeSchema>[]): string | undefined => {
  const nodeIds = new Set<string>();
  const labels = new Set<string>();
  for (const nodeType of nodeTypes) {
    if (nodeIds.has(nodeType.id)) return `Duplicate node type id: ${nodeType.id}.`;
    if (labels.has(nodeType.label)) return `Duplicate node type label: ${nodeType.label}.`;
    nodeIds.add(nodeType.id);
    labels.add(nodeType.label);
    const propertyNames = new Set(Object.keys(nodeType.attributes));
    for (const property of [...(nodeType.primaryKeys ?? []), ...(nodeType.requiredProperties ?? [])]) {
      if (!propertyNames.has(property)) return `Property ${property} is not defined on node type ${nodeType.label}.`;
    }
  }
  const relationIds = new Set<string>();
  for (const relation of relationTypes) {
    if (relationIds.has(relation.id)) return `Duplicate relationship id: ${relation.id}.`;
    relationIds.add(relation.id);
    if (!nodeIds.has(relation.sourceTypeId) || !nodeIds.has(relation.targetTypeId)) return 'Every relationship must reference submitted node types.';
  }
  return undefined;
};

const persistSchema = async (domain: DomainContext, nodeTypes: z.infer<typeof entityTypeSchema>[], relationTypes: z.infer<typeof relationTypeSchema>[]) => {
  const config: DomainSchemaConfig = {
    domain,
    displayName: domain === 'CUSTOM' ? 'Custom Enterprise Mix' : domainSchemas[domain].displayName,
    allowedNodeLabels: nodeTypes.map((nodeType) => nodeType.label),
    allowedRelationships: relationTypes.map((relation) => relation.relationName),
    systemPromptRules: `Use the custom ${domain} ontology defined by the submitted node and relationship types. Stay within the configured labels and relationships.`
  };
  const session = getNeo4jDriver().session();
  try {
    await session.executeWrite(async (transaction) => {
      for (const nodeType of nodeTypes) {
        const label = safeIdentifier(nodeType.label);
        for (const property of Object.keys(nodeType.attributes)) {
          const indexName = safeIdentifier(`schema_${domain}_${label}_${property}`);
          await transaction.run(`CREATE INDEX ${indexName} IF NOT EXISTS FOR (n:${label}) ON (n.${safeIdentifier(property)})`);
        }
        for (const primaryKey of nodeType.primaryKeys ?? []) {
          const constraintName = safeIdentifier(`schema_${domain}_${label}_${primaryKey}_unique`);
          await transaction.run(`CREATE CONSTRAINT ${constraintName} IF NOT EXISTS FOR (n:${label}) REQUIRE n.${safeIdentifier(primaryKey)} IS UNIQUE`);
        }
      }
      await transaction.run(
        `MERGE (schema:DomainSchema {domain: $domain})
         SET schema.displayName = $displayName, schema.allowedNodeLabelsJson = $allowedNodeLabelsJson,
             schema.allowedRelationshipsJson = $allowedRelationshipsJson, schema.systemPromptRules = $systemPromptRules,
             schema.nodeTypesJson = $nodeTypesJson, schema.relationTypesJson = $relationTypesJson, schema.updatedAt = $updatedAt`,
        { domain, displayName: config.displayName, allowedNodeLabelsJson: JSON.stringify(config.allowedNodeLabels), allowedRelationshipsJson: JSON.stringify(config.allowedRelationships), systemPromptRules: config.systemPromptRules, nodeTypesJson: JSON.stringify(nodeTypes), relationTypesJson: JSON.stringify(relationTypes), updatedAt: new Date().toISOString() }
      );
      await transaction.run(`MATCH (old:SchemaNodeType {domain: $domain}) DETACH DELETE old`, { domain });
      await transaction.run(`MATCH (old:SchemaRelationType {domain: $domain}) DETACH DELETE old`, { domain });
      for (const nodeType of nodeTypes) {
        await transaction.run(
          `CREATE (nodeType:SchemaNodeType {id: $id, domain: $domain, label: $label, attributesJson: $attributesJson, attributeTypesJson: $attributeTypesJson, primaryKeysJson: $primaryKeysJson, requiredPropertiesJson: $requiredPropertiesJson, updatedAt: $updatedAt})`,
          { id: nodeType.id, domain, label: nodeType.label, attributesJson: JSON.stringify(nodeType.attributes), attributeTypesJson: JSON.stringify(nodeType.attributeTypes ?? {}), primaryKeysJson: JSON.stringify(nodeType.primaryKeys ?? []), requiredPropertiesJson: JSON.stringify(nodeType.requiredProperties ?? []), updatedAt: new Date().toISOString() }
        );
      }
      for (const relationType of relationTypes) {
        await transaction.run(
          `CREATE (relation:SchemaRelationType {id: $id, domain: $domain, sourceTypeId: $sourceTypeId, targetTypeId: $targetTypeId, relationName: $relationName, updatedAt: $updatedAt})`,
          { ...relationType, domain, updatedAt: new Date().toISOString() }
        );
      }
    });
  } finally {
    await session.close();
  }
  updateDomainSchema(config);
  return config;
};

let openAiClient: OpenAI | undefined;
const getOpenAiClient = (): OpenAI => { openAiClient ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); return openAiClient; };

const localSchemaTemplates: Record<DomainContext, z.infer<typeof entityTypeSchema>[]> = {
  SUPPLY_CHAIN: [
    { id: 'ENTITY-Product', label: 'Product', attributes: { productId: '', name: '' }, attributeTypes: { productId: 'string', name: 'string' }, primaryKeys: ['productId'], requiredProperties: ['productId'] },
    { id: 'ENTITY-Supplier', label: 'Supplier', attributes: { supplierId: '', name: '' }, attributeTypes: { supplierId: 'string', name: 'string' }, primaryKeys: ['supplierId'], requiredProperties: ['supplierId'] },
    { id: 'ENTITY-Facility', label: 'Facility', attributes: { facilityId: '', name: '' }, attributeTypes: { facilityId: 'string', name: 'string' }, primaryKeys: ['facilityId'], requiredProperties: ['facilityId'] }
  ],
  FINANCE: [{ id: 'ENTITY-FinancialAccount', label: 'FinancialAccount', attributes: { accountId: '', balance: 0 }, attributeTypes: { accountId: 'string', balance: 'number' }, primaryKeys: ['accountId'], requiredProperties: ['accountId'] }],
  HEALTHCARE: [{ id: 'ENTITY-Patient', label: 'Patient', attributes: { patientId: '', active: false }, attributeTypes: { patientId: 'string', active: 'boolean' }, primaryKeys: ['patientId'], requiredProperties: ['patientId'] }],
  HR_ORG: [{ id: 'ENTITY-Employee', label: 'Employee', attributes: { employeeId: '', name: '' }, attributeTypes: { employeeId: 'string', name: 'string' }, primaryKeys: ['employeeId'], requiredProperties: ['employeeId'] }],
  CUSTOM: [{ id: 'ENTITY-Entity', label: 'Entity', attributes: { id: '', name: '' }, attributeTypes: { id: 'string', name: 'string' }, primaryKeys: ['id'], requiredProperties: ['id'] }]
};

router.post('/custom', async (request, response) => {
  const parsedRequest = customSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    response.status(400).json({ error: 'Invalid custom schema.', details: parsedRequest.error.flatten() });
    return;
  }

  const { domain, nodeTypes, relationTypes } = parsedRequest.data;
  const nodeTypeIds = new Set(nodeTypes.map((nodeType) => nodeType.id));
  if (relationTypes.some((relation) => !nodeTypeIds.has(relation.sourceTypeId) || !nodeTypeIds.has(relation.targetTypeId))) {
    response.status(400).json({ error: 'Every relation must reference node types in the submitted schema.' });
    return;
  }

  const config: DomainSchemaConfig = {
    domain: domain as DomainContext,
    displayName: domain === 'CUSTOM' ? 'Custom Enterprise Mix' : domainSchemas[domain as DomainContext].displayName,
    allowedNodeLabels: nodeTypes.map((nodeType) => nodeType.label),
    allowedRelationships: relationTypes.map((relation) => relation.relationName),
    systemPromptRules: `Use the custom ${domain} ontology defined by the submitted node and relationship types. Stay within the configured labels and relationships.`
  };

  const session = getNeo4jDriver().session();
  try {
    await session.executeWrite(async (transaction) => {
      await transaction.run(
        `MERGE (schema:DomainSchema {domain: $domain})
         SET schema.displayName = $displayName,
             schema.allowedNodeLabelsJson = $allowedNodeLabelsJson,
             schema.allowedRelationshipsJson = $allowedRelationshipsJson,
             schema.systemPromptRules = $systemPromptRules,
             schema.updatedAt = $updatedAt`,
        {
          domain,
          displayName: config.displayName,
          allowedNodeLabelsJson: JSON.stringify(config.allowedNodeLabels),
          allowedRelationshipsJson: JSON.stringify(config.allowedRelationships),
          systemPromptRules: config.systemPromptRules,
          updatedAt: new Date().toISOString()
        }
      );
      await transaction.run(
        `MATCH (old:SchemaNodeType {domain: $domain}) DETACH DELETE old`,
        { domain }
      );
      await transaction.run(
        `MATCH (old:SchemaRelationType {domain: $domain}) DETACH DELETE old`,
        { domain }
      );
      for (const nodeType of nodeTypes) {
        await transaction.run(
          `CREATE (nodeType:SchemaNodeType {
             id: $id, domain: $domain, label: $label, attributesJson: $attributesJson,
             updatedAt: $updatedAt
           })`,
          { id: nodeType.id, domain, label: nodeType.label, attributesJson: JSON.stringify(nodeType.attributes), updatedAt: new Date().toISOString() }
        );
      }
      for (const relationType of relationTypes) {
        await transaction.run(
          `CREATE (relation:SchemaRelationType {
             id: $id, domain: $domain, sourceTypeId: $sourceTypeId,
             targetTypeId: $targetTypeId, relationName: $relationName,
             updatedAt: $updatedAt
           })`,
          { ...relationType, domain, updatedAt: new Date().toISOString() }
        );
      }
    });
  } finally {
    await session.close();
  }

  updateDomainSchema(config);
  response.status(201).json({ config, nodeTypes, relationTypes });
});

router.post('/save', async (request, response) => {
  const parsedRequest = saveSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    response.status(400).json({ error: 'Invalid schema structure.', details: parsedRequest.error.flatten() });
    return;
  }
  const validationError = validateSchemaReferences(parsedRequest.data.nodeTypes, parsedRequest.data.relationTypes);
  if (validationError) {
    response.status(400).json({ error: validationError });
    return;
  }
  try {
    const config = await persistSchema(parsedRequest.data.domain, parsedRequest.data.nodeTypes, parsedRequest.data.relationTypes);
    response.status(201).json({ config, nodeTypes: parsedRequest.data.nodeTypes, relationTypes: parsedRequest.data.relationTypes });
  } catch (error) {
    response.status(503).json({ error: 'Unable to save schema.', message: error instanceof Error ? error.message : 'Request failed.' });
  }
});

router.post('/generate-from-prompt', async (request, response) => {
  const parsedRequest = promptSchema.safeParse(request.body);
  if (!parsedRequest.success) {
    response.status(400).json({ error: 'Invalid schema generation request.', details: parsedRequest.error.flatten() });
    return;
  }
  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey || apiKey === 'OPENAI_API_KEY' || apiKey === 'your_key') {
      response.json({ nodeTypes: localSchemaTemplates[parsedRequest.data.domain] });
      return;
    }
    const completion = await getOpenAiClient().chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o', temperature: 0, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: 'Return JSON only with nodeTypes. Each nodeType has id, label, attributes, attributeTypes, primaryKeys, and requiredProperties. Primitive attributeTypes are string, number, boolean, or date.' }, { role: 'user', content: `Domain: ${parsedRequest.data.domain}\nSchema description: ${parsedRequest.data.prompt}` }]
    });
    const parsed = z.object({ nodeTypes: z.array(entityTypeSchema) }).parse(JSON.parse(completion.choices[0]?.message.content ?? '{}'));
    response.json(parsed);
  } catch (error) {
    response.status(502).json({ error: 'Unable to generate schema.', message: error instanceof Error ? error.message : 'Request failed.' });
  }
});

export default router;