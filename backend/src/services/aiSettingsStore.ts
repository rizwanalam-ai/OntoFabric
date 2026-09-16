import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const dataDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
fs.mkdirSync(dataDirectory, { recursive: true });

const database = new Database(path.join(dataDirectory, 'ai-settings.db'));
const unusableApiKeys = new Set(['your_key', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'DEEPSEEK_API_KEY', 'your_gemini_key', 'your_deepseek_key']);
database.pragma('journal_mode = WAL');
database.exec(`
  CREATE TABLE IF NOT EXISTS ai_provider_settings (
    provider TEXT PRIMARY KEY,
    api_key TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ai_runtime_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active_provider TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

type ProviderRow = { provider: string; api_key: string; model: string; updated_at: string };

export const getStoredActiveProvider = (): string | undefined => {
  const row = database.prepare('SELECT active_provider FROM ai_runtime_settings WHERE id = 1').get() as { active_provider?: string } | undefined;
  return row?.active_provider;
};

export const getStoredProviderSettings = (provider: string): { apiKey?: string; model?: string } => {
  const row = database.prepare('SELECT api_key, model FROM ai_provider_settings WHERE provider = ?').get(provider) as { api_key?: string; model?: string } | undefined;
  const apiKey = row?.api_key?.trim();
  return { apiKey: apiKey && !unusableApiKeys.has(apiKey) ? apiKey : undefined, model: row?.model || undefined };
};

export const saveProviderSettings = (provider: string, values: { apiKey?: string; model?: string }): void => {
  const current = getStoredProviderSettings(provider);
  database.prepare(`
    INSERT INTO ai_provider_settings (provider, api_key, model, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET api_key = excluded.api_key, model = excluded.model, updated_at = excluded.updated_at
  `).run(provider, values.apiKey?.trim() || current.apiKey || '', values.model?.trim() || current.model || '', new Date().toISOString());
};

export const saveActiveProvider = (provider: string): void => {
  database.prepare(`
    INSERT INTO ai_runtime_settings (id, active_provider, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET active_provider = excluded.active_provider, updated_at = excluded.updated_at
  `).run(provider, new Date().toISOString());
};

export const getStoredProviderRows = (): ProviderRow[] => database.prepare('SELECT provider, api_key, model, updated_at FROM ai_provider_settings').all() as ProviderRow[];