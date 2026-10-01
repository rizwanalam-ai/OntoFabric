import { getActiveDataSourceConfig } from './dataSourceConfigService.js';

type DatabricksStatementResponse = {
  statement_id?: string;
  status?: { state?: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'CLOSED'; error?: { message?: string } };
  manifest?: { schema?: { columns?: Array<{ name: string }> } };
  result?: { data_array?: unknown[][] };
  error?: { message?: string };
};

const validateIdentifier = (value: string, name: string): string => {
  const identifier = value.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*){0,2}$/.test(identifier)) {
    throw new Error(`Invalid Databricks ${name}: ${value}`);
  }
  return identifier;
};

const quoteIdentifier = (identifier: string): string => identifier.split('.').map((part) => `\`${part.replace(/`/g, '``')}\``).join('.');
const normalizeLimit = (limit: number): number => Math.min(Math.max(Math.floor(limit), 1), 10000);

const getDatabricksConfig = (): { baseUrl: string; httpPath: string; token: string; warehouseId: string; catalog?: string; schema?: string } => {
  const config = getActiveDataSourceConfig('DATABRICKS');
  const hostname = String(config?.hostname ?? '').trim();
  const httpPath = String(config?.httpPath ?? '').trim();
  const token = String(config?.token ?? '').trim();
  const missing = [!hostname && 'hostname', !httpPath && 'HTTP path', !token && 'token'].filter(Boolean);
  if (missing.length > 0) throw new Error(`Databricks configuration is missing ${missing.join(', ')}. Add and activate a connection in the Data Sources admin page.`);
  const warehouseId = String(config?.warehouseId ?? '').trim() || httpPath.match(/\/warehouses\/([^/]+)/)?.[1];
  if (!warehouseId) throw new Error('Databricks requires a warehouse ID or a warehouse ID in its HTTP path.');
  return {
    baseUrl: `https://${hostname.replace(/^https?:\/\//, '').replace(/\/$/, '')}`,
    httpPath,
    token,
    warehouseId,
    catalog: String(config?.catalog ?? '').trim() || undefined,
    schema: String(config?.schema ?? '').trim() || undefined
  };
};

const databricksRequest = async (baseUrl: string, token: string, path: string, init?: RequestInit): Promise<DatabricksStatementResponse> => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
  });
  const body = await response.json() as DatabricksStatementResponse;
  if (!response.ok) throw new Error(body.error?.message ?? `Databricks request failed (${response.status}).`);
  return body;
};

export const fetchDatabricksTableData = async (tableName: string, limit = 1000): Promise<Record<string, unknown>[]> => {
  const table = validateIdentifier(tableName, 'table name');
  const config = getDatabricksConfig();
  const catalog = config.catalog;
  const schema = config.schema;
  const qualifiedTable = table.includes('.') ? quoteIdentifier(table) : [catalog, schema, table].filter(Boolean).map((part) => quoteIdentifier(part!)).join('.');
  if (!qualifiedTable) throw new Error('Databricks table name is required.');
  const statement = await databricksRequest(config.baseUrl, config.token, '/api/2.0/sql/statements', {
    method: 'POST',
    body: JSON.stringify({
      statement: `SELECT * FROM ${qualifiedTable} LIMIT ${normalizeLimit(limit)}`,
      warehouse_id: config.warehouseId,
      disposition: 'INLINE',
      format: 'JSON_ARRAY'
    })
  });
  if (!statement.statement_id) throw new Error('Databricks did not return a statement ID.');
  let result = statement;
  const deadline = Date.now() + 60000;
  while (result.status?.state === 'PENDING' || result.status?.state === 'RUNNING') {
    if (Date.now() > deadline) throw new Error('Databricks query timed out after 60 seconds.');
    await new Promise((resolve) => setTimeout(resolve, 500));
    result = await databricksRequest(config.baseUrl, config.token, `/api/2.0/sql/statements/${encodeURIComponent(statement.statement_id)}`);
  }
  if (result.status?.state !== 'SUCCEEDED') throw new Error(result.status?.error?.message ?? 'Databricks query failed.');
  const columns = result.manifest?.schema?.columns?.map((column) => column.name) ?? [];
  return (result.result?.data_array ?? []).map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index] ?? null])));
};