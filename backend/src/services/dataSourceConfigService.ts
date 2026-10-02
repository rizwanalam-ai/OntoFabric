import { randomUUID } from 'node:crypto';

import { decryptConfig, encryptConfig } from '../config/cryptoService.js';
import { getConfigDatabase } from '../config/sqlite.js';

export type DataSourceType = 'SAP' | 'POSTGRES' | 'SNOWFLAKE' | 'DATABRICKS' | 'HUBSPOT' | 'MONDAY' | 'SALESFORCE' | 'ODOO';
export type DataSourceConfig = Record<string, string | number | boolean>;

type DataSourceRow = {
  id: string;
  name: string;
  type: DataSourceType;
  config_json: string;
  is_active: number;
  created_at: string;
  updated_at: string;
};

const secretFields: Record<DataSourceType, string[]> = {
  SAP: ['apiKey', 'apiToken', 'username', 'password'],
  POSTGRES: ['password'],
  SNOWFLAKE: ['password'],
  DATABRICKS: ['token'],
  HUBSPOT: ['accessToken', 'clientSecret', 'refreshToken'],
  MONDAY: ['apiToken'],
  SALESFORCE: ['accessToken'],
  ODOO: ['apiKey']
};

const readConfig = (row: DataSourceRow): DataSourceConfig => JSON.parse(decryptConfig(row.config_json)) as DataSourceConfig;

export const listDataSources = () => {
  const rows = getConfigDatabase().prepare('SELECT * FROM data_sources ORDER BY created_at DESC').all() as DataSourceRow[];
  return rows.map((row) => {
    const config = readConfig(row);
    const secrets = secretFields[row.type];
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      config: Object.fromEntries(Object.entries(config).filter(([key]) => !secrets.includes(key))),
      configuredSecrets: Object.fromEntries(secrets.map((key) => [key, Boolean(config[key])])),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });
};

export const getActiveDataSourceConfig = (type: DataSourceType): DataSourceConfig | undefined => {
  const row = getConfigDatabase().prepare(
    'SELECT * FROM data_sources WHERE type = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1'
  ).get(type) as DataSourceRow | undefined;
  return row ? readConfig(row) : undefined;
};

export const getDataSourceConfig = (id: string): { type: DataSourceType; config: DataSourceConfig } | undefined => {
  const row = getConfigDatabase().prepare('SELECT * FROM data_sources WHERE id = ?').get(id) as DataSourceRow | undefined;
  return row ? { type: row.type, config: readConfig(row) } : undefined;
};

export const getActiveDataSource = (type: DataSourceType): { id: string; name: string; config: DataSourceConfig } | undefined => {
  const row = getConfigDatabase().prepare(
    'SELECT * FROM data_sources WHERE type = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 1'
  ).get(type) as DataSourceRow | undefined;
  return row ? { id: row.id, name: row.name, config: readConfig(row) } : undefined;
};

export const saveDataSource = (input: {
  id?: string;
  name: string;
  type: DataSourceType;
  config: DataSourceConfig;
  isActive: boolean;
}): string => {
  const database = getConfigDatabase();
  const id = input.id ?? randomUUID();
  const current = input.id
    ? database.prepare('SELECT * FROM data_sources WHERE id = ?').get(input.id) as DataSourceRow | undefined
    : undefined;
  if (input.id && !current) throw new Error('Data source configuration was not found.');
  const mergedConfig = current ? { ...readConfig(current), ...input.config } : input.config;
  const now = new Date().toISOString();
  const saveTransaction = database.transaction(() => {
    if (input.isActive) {
      database.prepare('UPDATE data_sources SET is_active = 0, updated_at = ? WHERE type = ? AND id <> ?')
        .run(now, input.type, id);
    }
    database.prepare(`
    INSERT INTO data_sources (id, name, type, config_json, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type,
      config_json = excluded.config_json, is_active = excluded.is_active, updated_at = excluded.updated_at
    `).run(id, input.name, input.type, encryptConfig(JSON.stringify(mergedConfig)), input.isActive ? 1 : 0, current?.created_at ?? now, now);
  });
  saveTransaction();
  return id;
};

export const setDataSourceActive = (id: string, isActive: boolean): boolean => {
  const database = getConfigDatabase();
  const now = new Date().toISOString();
  const activateTransaction = database.transaction(() => {
    const current = database.prepare('SELECT type FROM data_sources WHERE id = ?').get(id) as { type: DataSourceType } | undefined;
    if (!current) return false;
    if (isActive) database.prepare('UPDATE data_sources SET is_active = 0, updated_at = ? WHERE type = ? AND id <> ?').run(now, current.type, id);
    database.prepare('UPDATE data_sources SET is_active = ?, updated_at = ? WHERE id = ?').run(isActive ? 1 : 0, now, id);
    return true;
  });
  return activateTransaction();
};

export const deleteDataSource = (id: string): boolean => (
  getConfigDatabase().prepare('DELETE FROM data_sources WHERE id = ?').run(id).changes > 0
);

