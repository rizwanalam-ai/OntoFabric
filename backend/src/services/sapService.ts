import { DEFAULT_TEMPORAL_END, type GraphNode, type Primitive, type PrimitiveDictionary } from '@ontofabric/shared/types.js';
import { getActiveDataSourceConfig } from './dataSourceConfigService.js';

const primitive = (value: unknown): value is Primitive => (
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null
);

const primitiveProperties = (record: Record<string, unknown>): PrimitiveDictionary => Object.fromEntries(
  Object.entries(record).filter(([, value]) => primitive(value))
) as PrimitiveDictionary;

const getRecords = (payload: unknown): Record<string, unknown>[] => {
  if (Array.isArray(payload)) return payload.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object');
  if (payload && typeof payload === 'object') {
    const value = (payload as { value?: unknown }).value;
    if (Array.isArray(value)) return getRecords(value);
  }
  throw new Error('SAP API response did not contain an array of records or an OData value array.');
};

const recordId = (record: Record<string, unknown>, index: number): string => {
  const candidate = record.ID ?? record.Id ?? record.id ?? record.BusinessPartner ?? record.BusinessPartnerId ?? record.EmployeeId;
  return String(candidate ?? `SAP-${index + 1}`);
};

const configuredUrl = (config: Record<string, string | number | boolean>): URL => {
  const baseUrl = String(config.baseUrl).trim();
  const apiPath = String(config.apiPath ?? '/').trim();
  if (!baseUrl || baseUrl === 'undefined') throw new Error('SAP is not configured. Add and activate a connection in the Data Sources admin page.');
  return new URL(apiPath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
};

export const syncSapSandbox = async (): Promise<{ sourceType: 'ERP'; entityType: string; count: number; nodes: GraphNode[] }> => {
  const config = getActiveDataSourceConfig('SAP');
  if (!config) throw new Error('SAP is not configured. Add and activate a connection in the Data Sources admin page.');
  const url = configuredUrl(config);
  const headers: Record<string, string> = { Accept: 'application/json', DataServiceVersion: '2.0' };
  const apiKey = String(config.apiKey ?? '').trim();
  const token = String(config.apiToken ?? '').trim();
  const username = String(config.username ?? '').trim();
  const password = String(config.password ?? '');
  if (apiKey) headers.APIKey = apiKey;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (username && password) headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    const causeCode = error instanceof Error && error.cause && typeof error.cause === 'object' && 'code' in error.cause
      ? String(error.cause.code)
      : '';
    if (causeCode === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' || causeCode === 'CERT_UNTRUSTED') {
      throw new Error('SAP TLS certificate is not trusted by Node. Configure NODE_EXTRA_CA_CERTS with your corporate or SAP CA certificate, then restart the backend.');
    }
    throw new Error(`Unable to connect to SAP: ${error instanceof Error ? error.message : 'network request failed.'}`);
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error('SAP API authentication failed. Verify SAP_API_KEY or configure SAP_USERNAME and SAP_PASSWORD for this sandbox endpoint.');
    throw new Error(`SAP API returned ${response.status} ${response.statusText}.`);
  }
  const payload = await response.json() as unknown;
  const records = getRecords(payload);
  const entityType = String(config.entityType ?? 'SAPRecord').trim() || 'SAPRecord';
  const timestamp = new Date().toISOString();
  const nodes = records.map((record, index): GraphNode => ({
    id: `SAP-${entityType.toUpperCase()}-${recordId(record, index)}`,
    type: { id: `SAP-${entityType.toUpperCase()}`, label: entityType, attributes: {} },
    domain: 'CUSTOM',
    secondaryLabels: [],
    sourceSystem: 'ERP',
    properties: primitiveProperties(record),
    createdAt: timestamp,
    validFrom: timestamp,
    validTo: DEFAULT_TEMPORAL_END,
    transactionFrom: timestamp,
    transactionTo: DEFAULT_TEMPORAL_END,
    provenance: {
      sourceSystem: 'SAP',
      rawSourceId: recordId(record, index),
      extractionTimestamp: timestamp,
      connector: 'sap_business_accelerator_hub'
    }
  }));

  return { sourceType: 'ERP', entityType, count: nodes.length, nodes };
};
