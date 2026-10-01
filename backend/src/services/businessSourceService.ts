import { DEFAULT_TEMPORAL_END, type GraphNode, type Primitive, type PrimitiveDictionary } from '@ontofabric/shared/types.js';
import { getActiveDataSource } from './dataSourceConfigService.js';

type BusinessSource = 'HUBSPOT' | 'MONDAY' | 'SALESFORCE' | 'ODOO';
type NormalizedRows = { records: Record<string, unknown>[]; sourceType: 'CRM' | 'ERP'; entityType: string };

const asString = (value: unknown): string => String(value ?? '').trim();
const asPrimitive = (value: unknown): Primitive => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  return JSON.stringify(value);
};

const primitiveProperties = (record: Record<string, unknown>): PrimitiveDictionary => Object.fromEntries(
  Object.entries(record).map(([key, value]) => [key, asPrimitive(value)])
);

const responseJson = async (response: Response): Promise<Record<string, unknown>> => {
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const message = (body.message ?? body.error_description ?? body.error) as string | undefined;
    throw new Error(`${response.status}: ${message ?? response.statusText}`);
  }
  return body;
};

const fetchHubSpot = async (config: Record<string, string | number | boolean>): Promise<NormalizedRows> => {
  const objectType = asString(config.objectType);
  const token = asString(config.accessToken);
  const baseUrl = asString(config.baseUrl) || 'https://api.hubapi.com';
  const records: Record<string, unknown>[] = [];
  let after = '';
  for (let page = 0; page < 10; page += 1) {
    const url = new URL(`/crm/v3/objects/${encodeURIComponent(objectType)}`, baseUrl);
    url.searchParams.set('limit', '100');
    const properties = asString(config.properties).split(',').map((property) => property.trim()).filter(Boolean);
    if (properties.length) url.searchParams.set('properties', properties.join(','));
    if (after) url.searchParams.set('after', after);
    const body = await responseJson(await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }));
    const results = Array.isArray(body.results) ? body.results as Record<string, unknown>[] : [];
    records.push(...results.map((item) => ({ id: item.id, ...(item.properties as Record<string, unknown> ?? {}), createdAt: item.createdAt })));
    const paging = body.paging as { next?: { after?: string } } | undefined;
    after = asString(paging?.next?.after);
    if (!after || records.length >= 1000) break;
  }
  return { records, sourceType: 'CRM', entityType: objectType };
};

const fetchMonday = async (config: Record<string, string | number | boolean>): Promise<NormalizedRows> => {
  const boardId = asString(config.boardId);
  const records: Record<string, unknown>[] = [];
  let cursor = '';
  for (let page = 0; page < 10; page += 1) {
    const cursorArg = cursor ? `, cursor: ${JSON.stringify(cursor)}` : '';
    const query = `query { boards(ids: [${JSON.stringify(boardId)}]) { id name items_page(limit: 500${cursorArg}) { cursor items { id name column_values { id text value } } } } }`;
    const body = await responseJson(await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: { Authorization: asString(config.apiToken), 'Content-Type': 'application/json', 'API-Version': '2025-01' },
      body: JSON.stringify({ query })
    }));
    if (Array.isArray(body.errors) && body.errors.length) throw new Error('monday.com query failed. Verify API token and board access.');
    const data = body.data as { boards?: Array<{ name?: string; items_page?: { cursor?: string | null; items?: Array<Record<string, unknown>> } }> } | undefined;
    const board = data?.boards?.[0];
    records.push(...(board?.items_page?.items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      ...Object.fromEntries(((item.column_values as Array<Record<string, unknown>>) ?? []).map((column) => [asString(column.id), column.text ?? column.value ?? '']))
    })));
    cursor = asString(board?.items_page?.cursor);
    if (!cursor || records.length >= 5000) break;
  }
  return { records, sourceType: 'CRM', entityType: asString(config.entityType) || 'MondayItem' };
};

const fetchSalesforce = async (config: Record<string, string | number | boolean>): Promise<NormalizedRows> => {
  const objectName = asString(config.objectName);
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(objectName)) throw new Error('Salesforce object name must be a valid API identifier.');
  const baseUrl = asString(config.instanceUrl).replace(/\/$/, '');
  const version = asString(config.apiVersion) || 'v60.0';
  const records: Record<string, unknown>[] = [];
  let nextUrl: string | undefined = `${baseUrl}/services/data/${encodeURIComponent(version)}/query?q=${encodeURIComponent(`SELECT FIELDS(ALL) FROM ${objectName} LIMIT 200`)}`;
  for (let page = 0; nextUrl && page < 10; page += 1) {
    const url = nextUrl.startsWith('https://') ? nextUrl : new URL(nextUrl, baseUrl).toString();
    const body = await responseJson(await fetch(url, { headers: { Authorization: `Bearer ${asString(config.accessToken)}`, Accept: 'application/json' } }));
    records.push(...(Array.isArray(body.records) ? body.records as Record<string, unknown>[] : []));
    nextUrl = body.done === false ? asString(body.nextRecordsUrl) : '';
  }
  return { records: records.slice(0, 2000), sourceType: 'CRM', entityType: objectName };
};

const callOdoo = async (url: string, body: Record<string, unknown>): Promise<unknown> => {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json() as { result?: unknown; error?: { data?: { message?: string }; message?: string } };
  if (!response.ok || payload.error) throw new Error(payload.error?.data?.message ?? payload.error?.message ?? `Odoo request failed (${response.status}).`);
  return payload.result;
};

const fetchOdoo = async (config: Record<string, string | number | boolean>): Promise<NormalizedRows> => {
  const baseUrl = asString(config.url).replace(/\/$/, '');
  const database = asString(config.database);
  const username = asString(config.username);
  const apiKey = asString(config.apiKey);
  const model = asString(config.model);
  if (!/^[A-Za-z0-9_.]+$/.test(model)) throw new Error('Odoo model must be a valid model identifier.');
  const uid = await callOdoo(`${baseUrl}/jsonrpc`, {
    jsonrpc: '2.0', method: 'call', id: 1,
    params: { service: 'common', method: 'authenticate', args: [database, username, apiKey, {}] }
  });
  if (typeof uid !== 'number' || uid <= 0) throw new Error('Odoo authentication failed. Check database, username, and API key.');
  const fields = asString(config.fields).split(',').map((field) => field.trim()).filter(Boolean);
  const result = await callOdoo(`${baseUrl}/jsonrpc`, {
    jsonrpc: '2.0', method: 'call', id: 2,
    params: { service: 'object', method: 'execute_kw', args: [database, uid, apiKey, model, 'search_read', [[]], { ...(fields.length ? { fields } : {}), limit: 1000 }] }
  });
  return { records: Array.isArray(result) ? result as Record<string, unknown>[] : [], sourceType: 'ERP', entityType: model };
};

const providers: Record<BusinessSource, (config: Record<string, string | number | boolean>) => Promise<NormalizedRows>> = {
  HUBSPOT: fetchHubSpot,
  MONDAY: fetchMonday,
  SALESFORCE: fetchSalesforce,
  ODOO: fetchOdoo
};

export const syncBusinessSource = async (type: BusinessSource): Promise<{ nodes: GraphNode[]; count: number; entityType: string }> => {
  const source = getActiveDataSource(type);
  if (!source) throw new Error(`${type} is not configured. Add and activate a connection in the Data Sources admin page.`);
  const result = await providers[type](source.config);
  const timestamp = new Date().toISOString();
  const nodes = result.records.map((record, index): GraphNode => {
    const rawId = asString(record.id ?? record.ID ?? record.Id ?? record._id ?? index + 1);
    return {
      id: `${type}-${result.entityType}-${rawId}`,
      type: { id: `${type}-${result.entityType}`, label: result.entityType, attributes: {} },
      domain: 'CUSTOM',
      secondaryLabels: [],
      sourceSystem: result.sourceType,
      properties: primitiveProperties(record),
      createdAt: timestamp,
      validFrom: timestamp,
      validTo: DEFAULT_TEMPORAL_END,
      transactionFrom: timestamp,
      transactionTo: DEFAULT_TEMPORAL_END,
      provenance: { sourceSystem: type, rawSourceId: rawId, extractionTimestamp: timestamp, mcpTool: `${type.toLowerCase()}_api` }
    };
  });
  return { nodes, count: nodes.length, entityType: result.entityType };
};