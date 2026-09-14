import { useMemo, useState } from 'react';
import axios from 'axios';
import { AlertCircle, ArrowUpRight, CheckCircle2, Database, FileSpreadsheet, FileText, Link2, LoaderCircle, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';

import type { DomainContext, GraphNode, Primitive } from '@ontofabric/shared/types.js';
import { PrivacyShieldBadge } from './PrivacyShieldBadge';
import { SchemaDriftBanner, type SchemaDriftResult } from './SchemaDriftBanner';

type PropertyValueType = 'string' | 'number' | 'boolean' | 'null';
type PropertyRow = { id: string; key: string; value: string; valueType: PropertyValueType };
type SapSyncStatus = { state: 'idle' | 'syncing' | 'success' | 'error'; message: string; count?: number };

type IngestionPanelProps = {
  onRefresh: () => Promise<void>;
  domain: DomainContext;
  id?: string;
  graphNodes?: Array<Pick<GraphNode, 'id' | 'type'>>;
  entityLabels?: string[];
  relationshipNames?: string[];
};

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001' });
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

export function IngestionPanel({ onRefresh, id, domain, graphNodes = [], entityLabels = [], relationshipNames = [] }: IngestionPanelProps) {
  const [filePath, setFilePath] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [sapStatus, setSapStatus] = useState<SapSyncStatus>({ state: 'idle', message: '' });
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

  const syncFile = (sourceType: 'EXCEL' | 'PDF') => run(sourceType, async () => {
    if (!filePath.trim()) {
      throw new Error('Enter a file path first.');
    }
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
    <aside id={id} className="w-full shrink-0 overflow-y-auto border-b border-white/10 bg-[#0c1525] lg:w-[360px] lg:border-b-0 lg:border-r">
      <div className="space-y-7 p-5 lg:p-6">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <Upload size={15} className="text-cyan-300" />
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">Source sync</h2>
          </div>
          <div className="mb-4 inline-flex rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-200">[Target Domain: {domain}]</div>
          {redactedCount !== null && <div className="mb-4"><PrivacyShieldBadge redactedCount={redactedCount} /></div>}
          {driftResult && <div className="mb-4"><SchemaDriftBanner result={driftResult} onDismiss={() => setDriftResult(null)} /></div>}
          <label className="text-xs text-slate-500" htmlFor="file-path">Document path</label>
          <input id="file-path" className={inputClass} value={filePath} onChange={(event) => setFilePath(event.target.value)} placeholder="C:\\data\\contracts.pdf" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className={`${buttonClass} bg-[#1c4c67] text-cyan-100 hover:bg-[#25627d]`} disabled={Boolean(busy)} onClick={() => void syncFile('EXCEL')}>
              {busy === 'EXCEL' ? <LoaderCircle size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Excel
            </button>
            <button type="button" className={`${buttonClass} bg-[#4d3b23] text-amber-100 hover:bg-[#6a502d]`} disabled={Boolean(busy)} onClick={() => void syncFile('PDF')}>
              {busy === 'PDF' ? <LoaderCircle size={14} className="animate-spin" /> : <FileText size={14} />} PDF
            </button>
          </div>
          <button type="button" className={`${buttonClass} mt-2 border border-white/10 text-slate-300 hover:bg-white/5`} disabled={Boolean(busy)} onClick={() => void syncSap()}>
            {busy === 'SAP' ? <LoaderCircle size={14} className="animate-spin" /> : <Database size={14} />} Sync SAP sandbox <ArrowUpRight size={13} className="ml-auto text-slate-500" />
          </button>
          {sapStatus.state !== 'idle' && <div className={`mt-2 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-5 ${sapStatus.state === 'error' ? 'border-rose-300/30 bg-rose-300/10 text-rose-100' : sapStatus.state === 'success' ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100' : 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100'}`} role={sapStatus.state === 'error' ? 'alert' : 'status'} aria-live="polite">
            {sapStatus.state === 'syncing' ? <LoaderCircle size={14} className="mt-0.5 shrink-0 animate-spin" /> : sapStatus.state === 'error' ? <AlertCircle size={14} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={14} className="mt-0.5 shrink-0" />}
            <span><strong className="font-semibold">{sapStatus.state === 'syncing' ? 'SAP sync in progress' : sapStatus.state === 'error' ? 'SAP sync failed' : 'SAP sync complete'}</strong><span className="block opacity-90">{sapStatus.message}</span></span>
          </div>}
          <button type="button" className={`${buttonClass} mt-2 border border-white/10 text-slate-300 hover:bg-white/5`} disabled={Boolean(busy)} onClick={() => setNotice('CRM sync endpoint is ready for the next connector configuration.')}>
            <RefreshCw size={14} /> Sync CRM <ArrowUpRight size={13} className="ml-auto text-slate-500" />
          </button>
          <div className="mt-5 border-t border-white/10 pt-5">
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

        <div className="border-t border-white/10 pt-6">
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
    </aside>
  );
}