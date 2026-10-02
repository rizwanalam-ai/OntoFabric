import { Router } from 'express';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';

import { deleteDataSource, getDataSourceConfig, listDataSources, saveDataSource, setDataSourceActive } from '../services/dataSourceConfigService.js';

const router = Router();
const typeSchema = z.enum(['SAP', 'POSTGRES', 'SNOWFLAKE', 'DATABRICKS', 'HUBSPOT', 'MONDAY', 'SALESFORCE', 'ODOO']);
const sourceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  type: typeSchema,
  config: z.record(z.union([z.string().max(5000), z.number(), z.boolean()])),
  isActive: z.boolean().default(true)
}).strict().superRefine((value, context) => {
  const requiredFields: Record<z.infer<typeof typeSchema>, string[]> = {
    SAP: ['baseUrl'],
    POSTGRES: ['host', 'port', 'database', 'user'],
    SNOWFLAKE: ['account', 'username', 'database', 'schema', 'warehouse'],
    DATABRICKS: ['hostname', 'httpPath', 'token'],
    HUBSPOT: ['accessToken', 'objectType'],
    MONDAY: ['apiToken', 'boardId'],
    SALESFORCE: ['accessToken', 'instanceUrl', 'objectName'],
    ODOO: ['url', 'database', 'username', 'apiKey', 'model']
  };
  for (const key of requiredFields[value.type]) {
    if (value.config[key] === undefined || String(value.config[key]).trim() === '') {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['config', key], message: `${key} is required for ${value.type}.` });
    }
  }
  if (value.type === 'HUBSPOT') {
    const oauthFields = ['clientId', 'clientSecret', 'refreshToken'];
    const configuredFields = oauthFields.filter((key) => String(value.config[key] ?? '').trim());
    if (configuredFields.length > 0 && configuredFields.length < oauthFields.length) {
      for (const key of oauthFields.filter((field) => !String(value.config[field] ?? '').trim())) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['config', key], message: `${key} is required when configuring HubSpot OAuth token refresh.` });
      }
    }
  }
});
const activeSchema = z.object({ isActive: z.boolean() }).strict();

const requireAdmin = (request: Parameters<Parameters<typeof router.get>[1]>[0], response: Parameters<Parameters<typeof router.get>[1]>[1]): boolean => {
  const expected = process.env.DATA_SOURCE_ADMIN_KEY;
  if (!expected) {
    response.status(503).json({ error: 'Set DATA_SOURCE_ADMIN_KEY in the backend environment to enable data-source administration.' });
    return false;
  }
  const provided = request.header('x-admin-key') ?? '';
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length > 0 && expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer)) return true;
  response.status(403).json({ error: 'Valid data-source administrator key required.' });
  return false;
};

router.get('/', (request, response) => {
  if (!requireAdmin(request, response)) return;
  try {
    response.json({ dataSources: listDataSources() });
  } catch (error) {
    response.status(503).json({ error: error instanceof Error ? error.message : 'Unable to read data-source configuration.' });
  }
});

router.post('/', (request, response) => {
  if (!requireAdmin(request, response)) return;
  const parsed = sourceSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid data-source configuration.', details: parsed.error.flatten() });
    return;
  }
  try {
    const id = saveDataSource(parsed.data);
    response.status(201).json({ id });
  } catch (error) {
    response.status(503).json({ error: error instanceof Error ? error.message : 'Unable to save data-source configuration.' });
  }
});

router.put('/:id', (request, response) => {
  if (!requireAdmin(request, response)) return;
  const id = z.string().uuid().safeParse(request.params.id);
  if (!id.success) {
    response.status(400).json({ error: 'Invalid data-source ID.' });
    return;
  }
  const existing = getDataSourceConfig(id.data);
  if (!existing) {
    response.status(404).json({ error: 'Data source configuration was not found.' });
    return;
  }
  const updateBody = z.object({
    name: z.string().trim().min(1).max(120),
    type: typeSchema,
    config: z.record(z.union([z.string().max(5000), z.number(), z.boolean()])),
    isActive: z.boolean().default(true)
  }).strict().safeParse(request.body);
  if (!updateBody.success) {
    response.status(400).json({ error: 'Invalid data-source configuration.', details: updateBody.error.flatten() });
    return;
  }
  if (updateBody.data.type !== existing.type) {
    response.status(400).json({ error: 'A saved connection type cannot be changed. Create a separate source configuration instead.' });
    return;
  }
  const parsed = sourceSchema.safeParse({
    ...updateBody.data,
    id: id.data,
    config: { ...existing.config, ...updateBody.data.config }
  });
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid data-source configuration.', details: parsed.error.flatten() });
    return;
  }
  try {
    const id = saveDataSource(parsed.data);
    response.json({ id });
  } catch (error) {
    response.status(404).json({ error: error instanceof Error ? error.message : 'Unable to update data-source configuration.' });
  }
});

router.patch('/:id/active', (request, response) => {
  if (!requireAdmin(request, response)) return;
  const parsed = activeSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid active-state request.', details: parsed.error.flatten() });
    return;
  }
  if (!setDataSourceActive(request.params.id, parsed.data.isActive)) {
    response.status(404).json({ error: 'Data source configuration was not found.' });
    return;
  }
  response.json({ id: request.params.id, isActive: parsed.data.isActive });
});

router.delete('/:id', (request, response) => {
  if (!requireAdmin(request, response)) return;
  if (!deleteDataSource(request.params.id)) {
    response.status(404).json({ error: 'Data source configuration was not found.' });
    return;
  }
  response.status(204).end();
});

export default router;