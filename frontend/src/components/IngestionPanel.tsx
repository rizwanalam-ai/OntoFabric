import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AlertCircle, ArrowUpRight, CheckCircle2, Cloud, Database, FileSpreadsheet, FileText, Link2, LoaderCircle, Plus, RefreshCw, Snowflake, Trash2, Upload, X } from 'lucide-react';
import { api } from '../api';

import type { DomainContext, GraphNode, Primitive } from '@ontofabric/shared/types.js';
import { PrivacyShieldBadge } from './PrivacyShieldBadge';
import { SchemaDriftBanner, type SchemaDriftResult } from './SchemaDriftBanner';

type PropertyValueType = 'string' | 'number' | 'boolean' | 'null';
type PropertyRow = { id: string; key: string; value: string; valueType: PropertyValueType };
type SapSyncStatus = { state: 'idle' | 'syncing' | 'success' | 'error'; message: string; count?: number };
type RelationalSyncStatus = { state: 'idle' | 'syncing' | 'success' | 'error'; message: string; count?: number };
type RelationalSource = 'POSTGRES' | 'SNOWFLAKE';
type FileSource = 'LOCAL' | 'GOOGLE_DRIVE' | 'DROPBOX';

type IngestionPanelProps = {
  onRefresh: () => Promise<void>;
  domain: DomainContext;
  id?: string;
  graphNodes?: Array<Pick<GraphNode, 'id' | 'type'>>;
  entityLabels?: string[];
  relationshipNames?: string[];
  quickAction?: 'entity' | 'relationship' | null;
  onQuickActionHandled?: () => void;
};

const defaultEntityLabels = ['Product', 'Component', 'Facility', 'WorkCenter', 'Supplier', 'Customer', 'DemandForecast'];
const defaultRelationshipNames = ['HAS_DEMAND', 'FOR_PRODUCT', 'REQUIRES_BOM', 'STORED_AT', 'PRODUCED_AT', 'SUPPLIED_BY', 'SHIPPED_TO', 'FULFILLED_BY'];

const createPropertyRow = (): PropertyRow => ({ id: crypto.randomUUID(), key: '', value: '', valueType: 'string' });

const getPropertyValue = (row: PropertyRow): Primitive => {
  if (row.valueType === 'number') return Number(row.value);
  if (row.valueType === 'boolean') return row.value === 'true';
  if (row.valueType === 'null') return null;
  return row.value;
};

const validatePropertyRows = (rows: PropertyRow[]) => {
  const errors = new Map<string, string[]>();
  const keys = new Map<string, string>();
  const addError = (rowId: string, message: string) => errors.set(rowId, [...(errors.get(rowId) ?? []), message]);
  rows.forEach((row) => {
    const key = row.key.trim();
    const hasValue = row.value.trim() !== '' || row.valueType === 'null';
    if (!key && !hasValue) return;
    if (!key) addError(row.id, 'Property name is required.');
    if (key && keys.has(key)) {
      addError(row.id, 'Property names must be unique.');
      addError(keys.get(key)!, 'Property names must be unique.');
    } else if (key) {
      keys.set(key, row.id);
    }
    if (row.valueType === 'number' && (!hasValue || !Number.isFinite(Number(row.value)))) addError(row.id, 'Enter a valid number.');
  });
  return errors;
};

export function IngestionPanel({ onRefresh, id, domain, graphNodes = [], entityLabels = [], relationshipNames = [], quickAction = null, onQuickActionHandled }: IngestionPanelProps) {
  const [filePath, setFilePath] = useState('');
  const [fileSource, setFileSource] = useState<FileSource>('LOCAL');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [remoteFileUrl, setRemoteFileUrl] = useState('');
  const [remoteFileName, setRemoteFileName] = useState('');
  const [hubOpen, setHubOpen] = useState(false);
  const [hubTab, setHubTab] = useState<'files' | 'databases' | 'warehouses' | 'sme'>('files');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [sapStatus, setSapStatus] = useState<SapSyncStatus>({ state: 'idle', message: '' });
  const [relationalStatus, setRelationalStatus] = useState<Record<RelationalSource, RelationalSyncStatus>>({
    POSTGRES: { state: 'idle', message: '' },
    SNOWFLAKE: { state: 'idle', message: '' }
  });
  const [relationalToast, setRelationalToast] = useState<{ state: 'success' | 'error'; message: string } | null>(null);
  const [postgresTable, setPostgresTable] = useState('');
  const [postgresPrimaryKey, setPostgresPrimaryKey] = useState('');
  const [postgresEntityLabel, setPostgresEntityLabel] = useState('');
  const [snowflakeTable, setSnowflakeTable] = useState('');
  const [snowflakePrimaryKey, setSnowflakePrimaryKey] = useState('');
  const [snowflakeEntityLabel, setSnowflakeEntityLabel] = useState('');
  const [nodeLabel, setNodeLabel] = useState('');
  const [propertyRows, setPropertyRows] = useState<PropertyRow[]>([createPropertyRow()]);
  const [sourceNode, setSourceNode] = useState('');
  const [targetNode, setTargetNode] = useState('');
  const [relationship, setRelationship] = useState('');
  const [driftTargetEntity, setDriftTargetEntity] = useState('Product');
  const [driftSample, setDriftSample] = useState('{\n  "customerId": "C-1001",\n  "name": "Example"\n}');
  const [driftResult, setDriftResult] = useState<SchemaDriftResult | null>(null);
  const [redactedCount, setRedactedCount] = useState<number | null>(null);
  const propertyErrors = useMemo(() => validatePropertyRows(propertyRows), [propertyRows]);
  const entityOptions = [...new Set([...defaultEntityLabels, ...entityLabels])];
  const relationshipOptions = [...new Set([...defaultRelationshipNames, ...relationshipNames])];

  useEffect(() => {
    if (!quickAction) return;
    setHubOpen(true);
    setHubTab('sme');
    onQuickActionHandled?.();
  }, [onQuickActionHandled, quickAction]);

  const run = async (key: string, action: () => Promise<string | void>) => {
    setBusy(key);
    setNotice('');
    try {
      const successMessage = await action();
      await onRefresh();
      setNotice(successMessage ?? 'Graph updated successfully.');
    } catch (error) {
      setNotice(axios.isAxiosError(error) ? error.response?.data?.message ?? error.response?.data?.error ?? 'Request failed.' : 'Request failed.');
    } finally {
      setBusy('');
    }
  };

  const syncFile = (sourceType: 'EXCEL' | 'CSV' | 'PDF' | 'WORD') => run(sourceType, async () => {
    if (selectedFile || fileSource !== 'LOCAL') {
      if (fileSource !== 'LOCAL' && !remoteFileUrl.trim()) throw new Error('Paste a Google Drive or Dropbox shared link first.');
      const formData = new FormData();
      formData.append('source', fileSource);
      formData.append('domain', domain);
      formData.append('targetEntity', driftTargetEntity.trim());
      if (selectedFile) formData.append('file', selectedFile);
      if (remoteFileUrl.trim()) formData.append('remoteUrl', remoteFileUrl.trim());
      if (remoteFileName.trim()) formData.append('fileName', remoteFileName.trim());
      const { data } = await api.post<{ schemaDrift?: SchemaDriftResult; privacy?: { redactedCount: number } }>('/api/ingest/upload', formData);
      if (data.schemaDrift) setDriftResult(data.schemaDrift);
      if (data.privacy) setRedactedCount(data.privacy.redactedCount);
      return;
    }
    if (!filePath.trim()) throw new Error('Choose a file or enter a server file path first.');
    if (sourceType === 'CSV' || sourceType === 'WORD') throw new Error('CSV and Word files must be selected with the browser picker or a shared link.');
    const { data } = await api.post<{ schemaDrift?: SchemaDriftResult; privacy?: { redactedCount: number } }>('/api/ingest/file', { filePath: filePath.trim(), sourceType, domain, targetEntity: driftTargetEntity.trim() });
    if (data.schemaDrift) setDriftResult(data.schemaDrift);
    if (data.privacy) setRedactedCount(data.privacy.redactedCount);
  });

  const checkSchemaDrift = () => run('drift', async () => {
    let incomingSample: Record<string, unknown>;
    try {
      const parsed = JSON.parse(driftSample) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Sample must be a JSON object.');
      incomingSample = parsed as Record<string, unknown>;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Enter a valid JSON sample.');
    }
    const { data } = await api.post<SchemaDriftResult>('/api/schema/drift-check', {
      sourceSystem: 'EXCEL',
      incomingSample,
      targetEntity: driftTargetEntity.trim()
    });
    setDriftResult(data);
    return data.unmappedKeys.length > 0 ? 'Schema drift found. Review the notice above.' : 'Schema matches the selected ontology.';
  });

  const syncSap = async () => {
    setBusy('SAP');
    setNotice('');
    setSapStatus({ state: 'syncing', message: 'Connecting to SAP Business Accelerator Hub...' });
    try {
      const { data } = await api.post<{ count: number; entityType: string }>('/api/integrations/sap/sync', undefined, { params: { domain } });
      await onRefresh();
      setSapStatus({ state: 'success', count: data.count, message: `Imported ${data.count} ${data.entityType} record${data.count === 1 ? '' : 's'}.` });
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message ?? error.response?.data?.error ?? 'SAP synchronization failed.'
        : error instanceof Error ? error.message : 'SAP synchronization failed.';
      setSapStatus({ state: 'error', message });
    } finally {
      setBusy('');
    }
  };

  const syncRelational = async (sourceType: RelationalSource) => {
    const isPostgres = sourceType === 'POSTGRES';
    const tableName = (isPostgres ? postgresTable : snowflakeTable).trim();
    const primaryKeyColumn = (isPostgres ? postgresPrimaryKey : snowflakePrimaryKey).trim();
    const entityLabel = (isPostgres ? postgresEntityLabel : snowflakeEntityLabel).trim();
    if (!tableName || !primaryKeyColumn || !entityLabel) {
      const message = 'Table name, primary key column, and entity label are required.';
      setRelationalStatus((current) => ({ ...current, [sourceType]: { state: 'error', message } }));
      setRelationalToast({ state: 'error', message });
      return;
    }

    setBusy(sourceType);
    setRelationalToast(null);
    setRelationalStatus((current) => ({ ...current, [sourceType]: { state: 'syncing', message: 'Syncing Relational Schema...' } }));
    try {
      const endpoint = isPostgres ? '/api/sync/postgres' : '/api/sync/snowflake';
      const { data } = await api.post<{ nodeCount: number; relationshipCounts?: Record<string, number> }>(endpoint, { tableName, primaryKeyColumn, entityLabel, domain });
      await onRefresh();
      const message = `Imported ${data.nodeCount} ${entityLabel} record${data.nodeCount === 1 ? '' : 's'} and refreshed the graph.`;
      setRelationalStatus((current) => ({ ...current, [sourceType]: { state: 'success', count: data.nodeCount, message } }));
      setRelationalToast({ state: 'success', message });
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message ?? error.response?.data?.error ?? `${sourceType} synchronization failed.`
        : error instanceof Error ? error.message : `${sourceType} synchronization failed.`;
      setRelationalStatus((current) => ({ ...current, [sourceType]: { state: 'error', message } }));
      setRelationalToast({ state: 'error', message });
    } finally {
      setBusy('');
    }
  };

  const createNode = () => run('node', async () => {
    if (propertyErrors.size > 0) throw new Error('Fix the property validation errors before creating the entity.');
    const properties = Object.fromEntries(propertyRows.filter((row) => row.key.trim()).map((row) => [row.key.trim(), getPropertyValue(row)]));
    await api.post('/api/sme/entity', {
      node: {
        id: `SME-${crypto.randomUUID()}`,
        type: { id: `TYPE-${nodeLabel.trim().toUpperCase().replace(/\s+/g, '-')}`, label: nodeLabel.trim(), attributes: {} },
        sourceSystem: 'SME_INPUT',
        properties,
        createdAt: new Date().toISOString()
      }
    }, { params: { domain } });
    setNodeLabel('');
    setPropertyRows([createPropertyRow()]);
  });

  const createEdge = () => run('edge', async () => {
    await api.post('/api/sme/entity', {
      edge: {
        id: `SME-REL-${crypto.randomUUID()}`,
        source: sourceNode.trim(),
        target: targetNode.trim(),
        relationship: relationship.trim(),
        properties: {}
      }
    }, { params: { domain } });
    setSourceNode('');
    setTargetNode('');
    setRelationship('');
  });

  const inputClass = 'mt-2 w-full rounded-xl border border-white/10 bg-[#0a1221] px-3 py-2.5 text-xs text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/10';
  const buttonClass = 'flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40';
  const updatePropertyRow = (rowId: string, update: Partial<PropertyRow>) => setPropertyRows((rows) => rows.map((row) => row.id === rowId ? { ...row, ...update } : row));

  return (
    <aside id={id} className="relative w-full shrink-0 border-b border-white/10 bg-[#0c1525] lg:w-[248px] lg:border-b-0 lg:border-r">
      <div className="p-4 lg:p-5">
        <div className="mb-5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300"><Upload size={14} /> Data mesh</div>
        <div className="rounded-2xl border border-cyan-300/15 bg-[#101a2c] p-3 shadow-xl shadow-black/10">
          <p className="text-sm font-semibold text-slate-100">Connect your sources</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Bring tables, documents, and SME knowledge into the graph.</p>
          <button type="button" className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-3 py-2.5 text-xs font-bold text-[#06111d] transition hover:bg-cyan-200" onClick={() => setHubOpen(true)}><Plus size={15} /> Add Data Source</button>
        </div>
        <div className="mt-5 space-y-2 text-xs text-slate-500">
          <p className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">Connectors</p>
          <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2"><Database size={14} className="text-indigo-300" /> PostgreSQL</div>
          <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2"><Snowflake size={14} className="text-sky-300" /> Snowflake</div>
          <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2"><FileText size={14} className="text-amber-300" /> Files &amp; APIs</div>
        </div>
      </div>
      {hubOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030711]/70 p-4 backdrop-blur-sm" onMouseDown={() => setHubOpen(false)}>
        <div className="flex max-h-[min(850px,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0c1525] shadow-2xl shadow-black/60" onMouseDown={(event) => event.stopPropagation()}>
          <header className="flex items-start justify-between border-b border-white/10 px-5 py-4">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Data connections</p><h2 className="mt-1 text-lg font-semibold text-white">Add a source to the mesh</h2><p className="mt-1 text-xs text-slate-500">Active domain: <span className="font-semibold text-cyan-200">{domain}</span></p></div>
            <button type="button" aria-label="Close data connections" onClick={() => setHubOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X size={18} /></button>
          </header>
          <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-5 pt-3">
            {([['files', 'Files'], ['databases', 'Databases'], ['warehouses', 'Cloud Warehouses'], ['sme', 'SME Form']] as const).map(([tab, label]) => <button key={tab} type="button" onClick={() => setHubTab(tab)} className={`whitespace-nowrap border-b-2 px-3 pb-3 text-xs font-semibold transition ${hubTab === tab ? 'border-cyan-300 text-cyan-200' : 'border-transparent text-slate-500 hover:text-slate-200'}`}>{label}</button>)}
          </div>
          <div className="overflow-y-auto">
      <div className="space-y-7 p-5 lg:p-6">
        <div className={hubTab === 'sme' ? 'hidden' : ''}>
          <div className="mb-4 flex items-center gap-2">
            <Upload size={15} className="text-cyan-300" />
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">Source sync</h2>
          </div>
          <div className="mb-4 inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-200">[Target Domain: {domain}]</div>
          {redactedCount !== null && <div className="mb-4"><PrivacyShieldBadge redactedCount={redactedCount} /></div>}
          {driftResult && <div className="mb-4"><SchemaDriftBanner result={driftResult} onDismiss={() => setDriftResult(null)} /></div>}
          <div className={hubTab === 'files' ? '' : 'hidden'}>
          <label className="text-xs text-slate-500" htmlFor="file-source">File source</label>
          <select id="file-source" className={inputClass} value={fileSource} onChange={(event) => { setFileSource(event.target.value as FileSource); setSelectedFile(null); setRemoteFileUrl(''); setRemoteFileName(''); }}>
            <option value="LOCAL">Local computer</option>
            <option value="GOOGLE_DRIVE">Google Drive shared link</option>
            <option value="DROPBOX">Dropbox shared link</option>
          </select>
          {fileSource === 'LOCAL' ? <>
            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-300/35 bg-cyan-300/[0.06] px-3 py-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-300/10" htmlFor="file-picker"><Upload size={14} /> {selectedFile ? selectedFile.name : 'Browse PDF, Excel, CSV, or Word'}<input id="file-picker" className="hidden" type="file" accept=".pdf,.xls,.xlsx,.csv,.doc,.docx,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} /></label>
            <label className="mt-3 text-[10px] text-slate-600" htmlFor="file-path">Or use a server-side path</label>
            <input id="file-path" className={inputClass} value={filePath} onChange={(event) => setFilePath(event.target.value)} placeholder="C:\\data\\contracts.pdf" />
          </> : <>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] px-3 py-2 text-[10px] text-cyan-100"><Cloud size={14} /> Paste a publicly accessible shared link</div>
            <input className={inputClass} value={remoteFileUrl} onChange={(event) => setRemoteFileUrl(event.target.value)} placeholder={fileSource === 'GOOGLE_DRIVE' ? 'https://drive.google.com/file/d/...' : 'https://www.dropbox.com/s/...'} aria-label={`${fileSource} shared file URL`} />
            <input className={inputClass} value={remoteFileName} onChange={(event) => setRemoteFileName(event.target.value)} placeholder="File name with extension, e.g. orders.xlsx" aria-label="Shared file name with extension" />
          </>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className={`${buttonClass} bg-[#1c4c67] text-cyan-100 hover:bg-[#25627d]`} disabled={Boolean(busy)} onClick={() => void syncFile('EXCEL')}>
              {busy === 'EXCEL' ? <LoaderCircle size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Excel
            </button>
            <button type="button" className={`${buttonClass} bg-sky-700/80 text-sky-100 hover:bg-sky-600`} disabled={Boolean(busy)} onClick={() => void syncFile('CSV')}>
              {busy === 'CSV' ? <LoaderCircle size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} CSV
            </button>
            <button type="button" className={`${buttonClass} bg-[#4d3b23] text-amber-100 hover:bg-[#6a502d]`} disabled={Boolean(busy)} onClick={() => void syncFile('PDF')}>
              {busy === 'PDF' ? <LoaderCircle size={14} className="animate-spin" /> : <FileText size={14} />} PDF
            </button>
            <button type="button" className={`${buttonClass} bg-blue-700/80 text-blue-100 hover:bg-blue-600`} disabled={Boolean(busy)} onClick={() => void syncFile('WORD')}>
              {busy === 'WORD' ? <LoaderCircle size={14} className="animate-spin" /> : <FileText size={14} />} Word
            </button>
          </div>
          <button type="button" className={`${buttonClass} mt-2 border border-white/10 text-slate-300 hover:bg-white/5`} disabled={Boolean(busy)} onClick={() => void syncSap()}>
            {busy === 'SAP' ? <LoaderCircle size={14} className="animate-spin" /> : <Database size={14} />} Sync SAP sandbox <ArrowUpRight size={13} className="ml-auto text-slate-500" />
          </button>
          {sapStatus.state !== 'idle' && <div className={`mt-2 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-5 ${sapStatus.state === 'error' ? 'border-rose-300/30 bg-rose-300/10 text-rose-100' : sapStatus.state === 'success' ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' : 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100'}`} role={sapStatus.state === 'error' ? 'alert' : 'status'} aria-live="polite">
            {sapStatus.state === 'syncing' ? <LoaderCircle size={14} className="mt-0.5 shrink-0 animate-spin" /> : sapStatus.state === 'error' ? <AlertCircle size={14} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
            <span><strong className="font-semibold">{sapStatus.state === 'syncing' ? 'SAP sync in progress' : sapStatus.state === 'error' ? 'SAP sync failed' : 'SAP sync complete'}</strong><span className="block opacity-90">{sapStatus.message}</span></span>
          </div>}
          </div>
          <div className={`mt-6 border-t border-white/10 pt-5 ${hubTab === 'databases' || hubTab === 'warehouses' ? '' : 'hidden'}`}>
            <div className="mb-3 flex items-center gap-2">
              <Database size={15} className="text-indigo-300" />
              <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">Database &amp; Data Warehouse Sync</h2>
            </div>
            <div className="space-y-3">
              <div className="rounded-2xl border border-indigo-400/25 bg-indigo-400/[0.06] p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300"><Database size={16} /></span>
                  <div><p className="text-xs font-semibold text-slate-100">PostgreSQL</p><p className="text-[10px] text-indigo-200/70">Relational table sync</p></div>
                  <span className="ml-auto rounded-full bg-indigo-500/20 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-indigo-200">PG</span>
                </div>
                <input className={inputClass} value={postgresTable} onChange={(event) => setPostgresTable(event.target.value)} placeholder="Table Name" aria-label="PostgreSQL table name" />
                <input className={inputClass} value={postgresPrimaryKey} onChange={(event) => setPostgresPrimaryKey(event.target.value)} placeholder="Primary Key Column" aria-label="PostgreSQL primary key column" />
                <input className={inputClass} value={postgresEntityLabel} onChange={(event) => setPostgresEntityLabel(event.target.value)} placeholder="Entity Label, e.g. Order" aria-label="PostgreSQL entity label" />
                <button type="button" className={`${buttonClass} mt-2 bg-indigo-500 text-white hover:bg-indigo-400`} disabled={Boolean(busy)} onClick={() => void syncRelational('POSTGRES')}>
                  {busy === 'POSTGRES' ? <LoaderCircle size={14} className="animate-spin" /> : <Database size={14} />} {busy === 'POSTGRES' ? 'Syncing Relational Schema...' : 'Sync PostgreSQL'} <ArrowUpRight size={13} className="ml-auto" />
                </button>
                {relationalStatus.POSTGRES.state !== 'idle' && <p className={`mt-2 text-[10px] leading-4 ${relationalStatus.POSTGRES.state === 'error' ? 'text-rose-300' : relationalStatus.POSTGRES.state === 'success' ? 'text-emerald-300' : 'text-indigo-200'}`} role={relationalStatus.POSTGRES.state === 'error' ? 'alert' : 'status'}>{relationalStatus.POSTGRES.message}</p>}
              </div>
              <div className="rounded-2xl border border-sky-400/25 bg-sky-400/[0.06] p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300"><Snowflake size={16} /></span>
                  <div><p className="text-xs font-semibold text-slate-100">Snowflake</p><p className="text-[10px] text-sky-200/70">Warehouse table or view</p></div>
                  <span className="ml-auto rounded-full bg-sky-500/20 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-sky-200">SF</span>
                </div>
                <input className={inputClass} value={snowflakeTable} onChange={(event) => setSnowflakeTable(event.target.value)} placeholder="Table / View Name" aria-label="Snowflake table or view name" />
                <input className={inputClass} value={snowflakePrimaryKey} onChange={(event) => setSnowflakePrimaryKey(event.target.value)} placeholder="Primary Key Column" aria-label="Snowflake primary key column" />
                <input className={inputClass} value={snowflakeEntityLabel} onChange={(event) => setSnowflakeEntityLabel(event.target.value)} placeholder="Entity Label, e.g. Order" aria-label="Snowflake entity label" />
                <button type="button" className={`${buttonClass} mt-2 bg-sky-500 text-white hover:bg-sky-400`} disabled={Boolean(busy)} onClick={() => void syncRelational('SNOWFLAKE')}>
                  {busy === 'SNOWFLAKE' ? <LoaderCircle size={14} className="animate-spin" /> : <Snowflake size={14} />} {busy === 'SNOWFLAKE' ? 'Syncing Relational Schema...' : 'Sync Snowflake'} <ArrowUpRight size={13} className="ml-auto" />
                </button>
                {relationalStatus.SNOWFLAKE.state !== 'idle' && <p className={`mt-2 text-[10px] leading-4 ${relationalStatus.SNOWFLAKE.state === 'error' ? 'text-rose-300' : relationalStatus.SNOWFLAKE.state === 'success' ? 'text-emerald-300' : 'text-sky-200'}`} role={relationalStatus.SNOWFLAKE.state === 'error' ? 'alert' : 'status'}>{relationalStatus.SNOWFLAKE.message}</p>}
              </div>
            </div>
          </div>
          <button type="button" className={`${buttonClass} mt-2 border border-white/10 text-slate-300 hover:bg-white/5 ${hubTab === 'warehouses' ? '' : 'hidden'}`} disabled={Boolean(busy)} onClick={() => setNotice('CRM sync endpoint is ready for the next connector configuration.')}>
            <RefreshCw size={14} /> Sync CRM <ArrowUpRight size={13} className="ml-auto text-slate-500" />
          </button>
          <div className={`mt-5 border-t border-white/10 pt-5 ${hubTab === 'files' ? '' : 'hidden'}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><p className="text-xs font-semibold text-slate-300">Schema drift check</p><p className="mt-1 text-[10px] leading-4 text-slate-500">Compare a source sample with an existing entity type.</p></div>
              <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-300/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-fuchsia-200">Auto-heal &ge; 0.85</span>
            </div>
            <input className={inputClass} value={driftTargetEntity} onChange={(event) => setDriftTargetEntity(event.target.value)} placeholder="Target entity, e.g. Product" aria-label="Schema drift target entity" />
            <textarea className={`${inputClass} min-h-24 resize-y font-mono text-[11px]`} value={driftSample} onChange={(event) => setDriftSample(event.target.value)} aria-label="Incoming schema sample" />
            <button type="button" className={`${buttonClass} mt-2 border border-fuchsia-300/30 text-fuchsia-200 hover:bg-fuchsia-300/10`} disabled={Boolean(busy) || !driftTargetEntity.trim()} onClick={() => void checkSchemaDrift()}>
              {busy === 'drift' ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} Check schema drift
            </button>
          </div>
        </div>

        <div className={`border-t border-white/10 pt-6 ${hubTab === 'sme' ? '' : 'hidden'}`}>
          <div className="mb-4 flex items-center gap-2">
            <Plus size={15} className="text-fuchsia-300" />
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">SME input</h2>
          </div>
          <label className="text-xs text-slate-500" htmlFor="node-label">Entity label</label>
          <select id="node-label" className={inputClass} value={nodeLabel} onChange={(event) => setNodeLabel(event.target.value)}>
            <option value="">Select an entity type</option>
            {entityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <div className="mt-4 flex items-center justify-between gap-3">
            <label className="text-xs text-slate-500" htmlFor="property-name">Properties</label>
            <span className={`text-[10px] font-semibold ${propertyErrors.size === 0 ? 'text-emerald-300' : 'text-rose-300'}`} aria-live="polite">{propertyErrors.size === 0 ? 'Schema valid' : `${propertyErrors.size} row${propertyErrors.size === 1 ? '' : 's'} need attention`}</span>
          </div>
          <div className="mt-2 space-y-2" aria-label="Entity properties">
            {propertyRows.map((row, index) => {
              const rowErrors = propertyErrors.get(row.id) ?? [];
              return <div key={row.id} className="rounded-xl border border-white/10 bg-[#0a1221]/70 p-2">
                <div className="flex items-center gap-2">
                  <input id={index === 0 ? 'property-name' : undefined} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0a1221] px-2.5 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-300/70" value={row.key} onChange={(event) => updatePropertyRow(row.id, { key: event.target.value })} placeholder="Property name" aria-label={`Property ${index + 1} name`} />
                  <select className="w-24 rounded-lg border border-white/10 bg-[#0a1221] px-2 py-2 text-[11px] text-slate-300 outline-none focus:border-cyan-300/70" value={row.valueType} onChange={(event) => updatePropertyRow(row.id, { valueType: event.target.value as PropertyValueType, value: event.target.value === 'null' ? '' : row.value })} aria-label={`Property ${index + 1} type`}>
                    <option value="string">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="null">Null</option>
                  </select>
                  <button type="button" onClick={() => setPropertyRows((rows) => rows.filter((item) => item.id !== row.id))} aria-label={`Delete property ${index + 1}`} title="Delete property" className="rounded-lg p-2 text-slate-500 hover:bg-rose-300/10 hover:text-rose-300"><Trash2 size={14} /></button>
                </div>
                {row.valueType === 'boolean' ? <select className="mt-2 w-full rounded-lg border border-white/10 bg-[#0a1221] px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-cyan-300/70" value={row.value || 'false'} onChange={(event) => updatePropertyRow(row.id, { value: event.target.value })} aria-label={`Property ${index + 1} value`}><option value="true">True</option><option value="false">False</option></select> : row.valueType !== 'null' ? <input className={`mt-2 w-full rounded-lg border bg-[#0a1221] px-2.5 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-300/70 ${rowErrors.length > 0 ? 'border-rose-300/50' : 'border-white/10'}`} type={row.valueType === 'number' ? 'number' : 'text'} value={row.value} onChange={(event) => updatePropertyRow(row.id, { value: event.target.value })} placeholder="Value" aria-label={`Property ${index + 1} value`} /> : <p className="mt-2 px-2.5 py-2 text-[11px] italic text-slate-500">Value is null</p>}
                {rowErrors.length > 0 && <p className="mt-1 px-1 text-[10px] text-rose-300" role="alert">{rowErrors.join(' ')}</p>}
              </div>;
            })}
          </div>
          <button type="button" onClick={() => setPropertyRows((rows) => [...rows, createPropertyRow()])} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-300/30 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-300/10"><Plus size={14} /> Add property</button>
          <button type="button" className={`${buttonClass} mt-3 bg-fuchsia-400 text-[#190d25] hover:bg-fuchsia-300`} disabled={Boolean(busy) || !nodeLabel.trim() || propertyErrors.size > 0} onClick={() => void createNode()}>
            {busy === 'node' ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />} Create entity
          </button>

          <div className="my-6 h-px bg-white/10" />
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-300"><Link2 size={14} className="text-fuchsia-300" /> Link entities</div>
          <select className={inputClass} value={sourceNode} onChange={(event) => setSourceNode(event.target.value)}>
            <option value="">Select source entity</option>
            {graphNodes.map((node) => <option key={`source-${node.id}`} value={node.id}>{node.type.label}: {node.id}</option>)}
          </select>
          <select className={inputClass} value={targetNode} onChange={(event) => setTargetNode(event.target.value)}>
            <option value="">Select target entity</option>
            {graphNodes.map((node) => <option key={`target-${node.id}`} value={node.id}>{node.type.label}: {node.id}</option>)}
          </select>
          <select className={inputClass} value={relationship} onChange={(event) => setRelationship(event.target.value)}>
            <option value="">Select a relationship</option>
            {relationshipOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <button type="button" className={`${buttonClass} mt-3 border border-fuchsia-300/30 text-fuchsia-200 hover:bg-fuchsia-300/10`} disabled={Boolean(busy) || !sourceNode.trim() || !targetNode.trim() || !relationship.trim()} onClick={() => void createEdge()}>
            {busy === 'edge' ? <LoaderCircle size={14} className="animate-spin" /> : <Link2 size={14} />} Create relationship
          </button>
        </div>
        {notice && <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-slate-400">{notice}</p>}
      </div>
      {relationalToast && <div className={`fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-xs shadow-2xl backdrop-blur-md ${relationalToast.state === 'success' ? 'border-emerald-300/30 bg-emerald-950/90 text-emerald-100' : 'border-rose-300/30 bg-rose-950/90 text-rose-100'}`} role={relationalToast.state === 'error' ? 'alert' : 'status'} aria-live="polite">
        {relationalToast.state === 'success' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertCircle size={16} className="mt-0.5 shrink-0" />}
        <span className="leading-5">{relationalToast.message}</span>
        <button type="button" className="rounded-lg p-1 opacity-70 hover:bg-white/10 hover:opacity-100" aria-label="Dismiss notification" onClick={() => setRelationalToast(null)}><X size={14} /></button>
      </div>}
          </div>
        </div>
      </div>}
    </aside>
  );
}