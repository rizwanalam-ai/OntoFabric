import { Router } from 'express';
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
  attributeTypes: z.record(z.enum(['string', 'number', 'boolean', 'date'])).optional()
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

export default router;