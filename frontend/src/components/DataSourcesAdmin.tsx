import { useEffect, useState } from 'react';
import axios from 'axios';
import { Database, KeyRound, LoaderCircle, Plus, Save, Snowflake, Trash2, X } from 'lucide-react';
import { api } from '../api';

type SourceType = 'SAP' | 'POSTGRES' | 'SNOWFLAKE' | 'DATABRICKS' | 'HUBSPOT' | 'MONDAY' | 'SALESFORCE' | 'ODOO';
type SourceRecord = {
  id: string;
  name: string;
  type: SourceType;
  config: Record<string, string | number | boolean>;
  configuredSecrets: Record<string, boolean>;
  isActive: boolean;
  updatedAt: string;
};
type Field = { key: string; label: string; secret?: boolean; required?: boolean; placeholder?: string; type?: 'text' | 'number' };

const fieldsByType: Record<SourceType, Field[]> = {
  SAP: [
    { key: 'baseUrl', label: 'API base URL', required: true, placeholder: 'https://sandbox.api.sap.com' },
    { key: 'apiPath', label: 'API path', placeholder: '/path/to/odata/entity-set' },
    { key: 'entityType', label: 'Entity type', placeholder: 'BusinessPartner' },
    { key: 'apiKey', label: 'API key', secret: true },
    { key: 'apiToken', label: 'Bearer token', secret: true },
    { key: 'username', label: 'Username', secret: true },
    { key: 'password', label: 'Password', secret: true }
  ],
  POSTGRES: [
    { key: 'host', label: 'Host', required: true, placeholder: 'localhost' },
    { key: 'port', label: 'Port', required: true, type: 'number', placeholder: '5432' },
    { key: 'database', label: 'Database', required: true },
    { key: 'user', label: 'Username', required: true },
    { key: 'password', label: 'Password', secret: true },
    { key: 'ssl', label: 'Use TLS', placeholder: 'Enabled by default' }
  ],
  SNOWFLAKE: [
    { key: 'account', label: 'Account identifier', required: true, placeholder: 'organization-account.region' },
    { key: 'username', label: 'Username', required: true },
    { key: 'password', label: 'Password', secret: true },
    { key: 'database', label: 'Database', required: true },
    { key: 'schema', label: 'Schema', required: true },
    { key: 'warehouse', label: 'Warehouse', required: true }
  ],
  DATABRICKS: [
    { key: 'hostname', label: 'Workspace hostname', required: true, placeholder: 'workspace.cloud.databricks.com' },
    { key: 'httpPath', label: 'SQL warehouse HTTP path', required: true, placeholder: '/sql/1.0/warehouses/...' },
    { key: 'warehouseId', label: 'Warehouse ID', placeholder: 'Optional if included in HTTP path' },
    { key: 'catalog', label: 'Default catalog' },
    { key: 'schema', label: 'Default schema' },
    { key: 'token', label: 'Personal access token', secret: true, required: true }
  ],
  HUBSPOT: [
    { key: 'baseUrl', label: 'API base URL', placeholder: 'https://api.hubapi.com' },
    { key: 'objectType', label: 'Object type', required: true, placeholder: 'contacts, companies, deals' },
    { key: 'properties', label: 'Properties (comma-separated)', placeholder: 'firstname,lastname,email' },
    { key: 'accessToken', label: 'Private app access token', secret: true, required: true }
  ],
  MONDAY: [
    { key: 'boardId', label: 'Board ID', required: true },
    { key: 'entityType', label: 'Entity label', placeholder: 'MondayItem' },
    { key: 'apiToken', label: 'API token', secret: true, required: true }
  ],
  SALESFORCE: [
    { key: 'instanceUrl', label: 'Instance URL', required: true, placeholder: 'https://your-domain.my.salesforce.com' },
    { key: 'objectName', label: 'Object API name', required: true, placeholder: 'Account, Contact, Opportunity' },
    { key: 'apiVersion', label: 'API version', placeholder: 'v60.0' },
    { key: 'accessToken', label: 'OAuth access token', secret: true, required: true }
  ],
  ODOO: [
    { key: 'url', label: 'Odoo URL', required: true, placeholder: 'https://odoo.example.com' },
    { key: 'database', label: 'Database', required: true },
    { key: 'username', label: 'Username', required: true },
    { key: 'model', label: 'Model', required: true, placeholder: 'res.partner' },
    { key: 'fields', label: 'Fields (comma-separated)', placeholder: 'name,email,phone' },
    { key: 'apiKey', label: 'API key', secret: true, required: true }
  ]
};

const sourceIcon: Record<SourceType, typeof Database> = {
  SAP: Database, POSTGRES: Database, SNOWFLAKE: Snowflake,
  DATABRICKS: Database, HUBSPOT: Database, MONDAY: Database, SALESFORCE: Database, ODOO: Database
};
const emptyValues = (): Record<string, string> => ({});

export function DataSourcesAdmin() {
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [type, setType] = useState<SourceType>('POSTGRES');
  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<string, string>>(emptyValues());
  const [editing, setEditing] = useState<SourceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [keyInput, setKeyInput] = useState('');

  const loadSources = async () => {
    if (!adminKey) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get<{ dataSources: SourceRecord[] }>('/api/admin/data-sources', { headers: { 'x-admin-key': adminKey } });
      setSources(data.dataSources);
      setError('');
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error ?? 'Unable to load saved data sources.' : 'Unable to load saved data sources.');
      if (axios.isAxiosError(requestError) && requestError.response?.status === 403) setAdminKey('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadSources(); }, [adminKey]);

  const resetForm = (nextType = type) => {
    setEditing(null);
    setType(nextType);
    setName('');
    setValues(emptyValues());
    setNotice('');
  };

  const editSource = (source: SourceRecord) => {
    setEditing(source);
    setType(source.type);
    setName(source.name);
    setValues(Object.fromEntries(Object.entries(source.config).map(([key, value]) => [key, String(value)])));
    setNotice('');
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const config = Object.fromEntries(fieldsByType[type].flatMap((field) => {
      const value = values[field.key]?.trim();
      if (field.secret && !value) return [];
      if (!value) return [];
      return [[field.key, field.type === 'number' ? Number(value) : field.key === 'ssl' ? value.toLowerCase() !== 'false' : value]];
    }));
    try {
      const request = { name: name.trim(), type, config, isActive: editing?.isActive ?? true };
      if (editing) await api.put(`/api/admin/data-sources/${editing.id}`, request, { headers: { 'x-admin-key': adminKey } });
      else await api.post('/api/admin/data-sources', request, { headers: { 'x-admin-key': adminKey } });
      setNotice('Data source configuration saved.');
      resetForm(type);
      await loadSources();
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error ?? 'Unable to save data-source configuration.' : 'Unable to save data-source configuration.');
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (source: SourceRecord) => {
    setError('');
    try {
      await api.patch(`/api/admin/data-sources/${source.id}/active`, { isActive: !source.isActive }, { headers: { 'x-admin-key': adminKey } });
      await loadSources();
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error ?? 'Unable to update active state.' : 'Unable to update active state.');
    }
  };

  const remove = async (source: SourceRecord) => {
    setError('');
    try {
      await api.delete(`/api/admin/data-sources/${source.id}`, { headers: { 'x-admin-key': adminKey } });
      if (editing?.id === source.id) resetForm();
      await loadSources();
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error ?? 'Unable to delete data source.' : 'Unable to delete data source.');
    }
  };

  const Icon = sourceIcon[type];
  return <section className="min-w-0 flex-1 overflow-y-auto p-4 md:p-7">
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Administration</p><h2 className="mt-2 text-2xl font-semibold text-white">Data sources</h2><p className="mt-1 text-sm text-slate-400">Manage encrypted connection settings for databases, CRM, and ERP providers.</p></div>
        <div className="flex items-center gap-2 text-xs text-emerald-200"><KeyRound size={14} /> Credentials encrypted at rest</div>
      </header>

      {!adminKey && <form onSubmit={(event) => { event.preventDefault(); setError(''); setAdminKey(keyInput); setKeyInput(''); }} className="mb-6 flex max-w-xl items-end gap-3 border-b border-white/10 pb-6">
        <label className="min-w-0 flex-1 text-xs font-semibold text-slate-300">Administrator key<input type="password" autoComplete="off" required value={keyInput} onChange={(event) => setKeyInput(event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0a1221] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/60" placeholder="DATA_SOURCE_ADMIN_KEY" /></label>
        <button type="submit" className="rounded-lg bg-cyan-300 px-4 py-2.5 text-xs font-bold text-[#06111d] hover:bg-cyan-200">Unlock</button>
      </form>}

      {error && <p className="mb-4 rounded-lg border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-100" role="alert">{error}</p>}
      {notice && <p className="mb-4 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100" role="status">{notice}</p>}

      {adminKey && <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <section>
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-100">Saved connections</h3><span className="font-mono text-xs text-slate-500">{sources.length}</span></div>
          {loading ? <div className="flex items-center gap-2 py-8 text-xs text-slate-400"><LoaderCircle size={14} className="animate-spin" /> Loading configurations...</div> : sources.length === 0 ? <div className="border-y border-dashed border-white/15 py-10 text-center text-xs text-slate-500">No data sources configured yet.</div> : <div className="divide-y divide-white/10 border-y border-white/10">{sources.map((source) => {
            const SourceIcon = sourceIcon[source.type];
            return <article key={source.id} className="flex flex-wrap items-center gap-3 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-cyan-200"><SourceIcon size={16} /></span>
              <button type="button" onClick={() => editSource(source)} className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-semibold text-slate-100">{source.name}</span><span className="mt-1 block text-[11px] text-slate-500">{source.type} · {Object.values(source.configuredSecrets).filter(Boolean).length} saved secret(s) · Updated {new Date(source.updatedAt).toLocaleDateString()}</span></button>
              <button type="button" onClick={() => void setActive(source)} aria-pressed={source.isActive} className={`rounded-md border px-2.5 py-1.5 text-[10px] font-bold ${source.isActive ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200' : 'border-white/10 text-slate-400'}`}>{source.isActive ? 'Active' : 'Inactive'}</button>
              <button type="button" onClick={() => void remove(source)} aria-label={`Delete ${source.name}`} title="Delete source" className="rounded-md p-2 text-slate-500 hover:bg-rose-300/10 hover:text-rose-300"><Trash2 size={14} /></button>
            </article>;
          })}</div>}
        </section>

        <section className="border-t border-white/10 pt-5 xl:border-l xl:border-t-0 xl:pl-7 xl:pt-0">
          <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-100">{editing ? 'Edit connection' : 'Add connection'}</h3>{editing && <button type="button" onClick={() => resetForm()} aria-label="Cancel edit" className="rounded-md p-1.5 text-slate-400 hover:bg-white/10"><X size={15} /></button>}</div>
          <form onSubmit={(event) => void save(event)} className="space-y-3">
            <label className="block text-xs font-semibold text-slate-300">Connection name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0a1221] px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/60" placeholder="Production PostgreSQL" /></label>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-[#0a1221] p-1 sm:grid-cols-4">{(['SAP', 'POSTGRES', 'SNOWFLAKE', 'DATABRICKS', 'HUBSPOT', 'MONDAY', 'SALESFORCE', 'ODOO'] as const).map((item) => <button key={item} type="button" disabled={Boolean(editing)} onClick={() => { setType(item); setValues(emptyValues()); }} className={`rounded-md px-2 py-2 text-[10px] font-bold ${type === item ? 'bg-cyan-300 text-[#06111d]' : 'text-slate-400 hover:bg-white/5'} disabled:cursor-not-allowed`}>{item}</button>)}</div>
            <div className="grid gap-3 sm:grid-cols-2">{fieldsByType[type].map((field) => <label key={field.key} className="block text-xs font-semibold text-slate-300">{field.label}{field.secret && <span className="ml-1 text-cyan-300">· encrypted</span>}
              <input type={field.secret ? 'password' : 'text'} inputMode={field.type === 'number' ? 'numeric' : undefined} required={Boolean(field.required) && (!field.secret || !editing?.configuredSecrets[field.key])} autoComplete="off" value={values[field.key] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0a1221] px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-300/60" placeholder={field.secret && editing?.configuredSecrets[field.key] ? 'Leave blank to keep saved value' : field.placeholder ?? ''} />
            </label>)}</div>
            <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-lg bg-cyan-300 px-4 py-2.5 text-xs font-bold text-[#06111d] hover:bg-cyan-200 disabled:opacity-50">{saving ? <LoaderCircle size={14} className="animate-spin" /> : editing ? <Save size={14} /> : <Plus size={14} />}{editing ? 'Save changes' : 'Save connection'}</button>
          </form>
          <p className="mt-4 text-[10px] leading-4 text-slate-500">Set <code className="text-slate-300">CONFIG_ENCRYPTION_KEY</code> on the backend before saving credentials. Generate a 32-byte key and keep it outside source control.</p>
        </section>
      </div>}
    </div>
  </section>;
}