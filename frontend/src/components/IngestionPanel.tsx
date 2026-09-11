import { useState } from 'react';
import axios from 'axios';
import { ArrowUpRight, Database, FileSpreadsheet, FileText, Link2, LoaderCircle, Plus, RefreshCw, Upload } from 'lucide-react';

type IngestionPanelProps = {
  onRefresh: () => Promise<void>;
};

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001' });

export function IngestionPanel({ onRefresh }: IngestionPanelProps) {
  const [filePath, setFilePath] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [nodeLabel, setNodeLabel] = useState('');
  const [nodeProperties, setNodeProperties] = useState('{\n  "name": ""\n}');
  const [sourceNode, setSourceNode] = useState('');
  const [targetNode, setTargetNode] = useState('');
  const [relationship, setRelationship] = useState('');

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setNotice('');
    try {
      await action();
      await onRefresh();
      setNotice('Graph updated successfully.');
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
    await api.post('/api/ingest/file', { filePath: filePath.trim(), sourceType });
  });

  const createNode = () => run('node', async () => {
    const properties = JSON.parse(nodeProperties) as Record<string, string | number | boolean | null>;
    await api.post('/api/sme/entity', {
      node: {
        id: `SME-${crypto.randomUUID()}`,
        type: { id: `TYPE-${nodeLabel.trim().toUpperCase().replace(/\s+/g, '-')}`, label: nodeLabel.trim(), attributes: {} },
        sourceSystem: 'SME_INPUT',
        properties,
        createdAt: new Date().toISOString()
      }
    });
    setNodeLabel('');
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
    });
    setSourceNode('');
    setTargetNode('');
    setRelationship('');
  });

  const inputClass = 'mt-2 w-full rounded-xl border border-white/10 bg-[#0a1221] px-3 py-2.5 text-xs text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/10';
  const buttonClass = 'flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <aside className="w-full shrink-0 overflow-y-auto border-b border-white/10 bg-[#0c1525] lg:w-[360px] lg:border-b-0 lg:border-r">
      <div className="space-y-7 p-5 lg:p-6">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <Upload size={15} className="text-cyan-300" />
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">Source sync</h2>
          </div>
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
          <button type="button" className={`${buttonClass} mt-2 border border-white/10 text-slate-300 hover:bg-white/5`} disabled={Boolean(busy)} onClick={() => setNotice('ERP sync endpoint is ready for the next connector configuration.')}>
            <Database size={14} /> Sync ERP <ArrowUpRight size={13} className="ml-auto text-slate-500" />
          </button>
          <button type="button" className={`${buttonClass} mt-2 border border-white/10 text-slate-300 hover:bg-white/5`} disabled={Boolean(busy)} onClick={() => setNotice('CRM sync endpoint is ready for the next connector configuration.')}>
            <RefreshCw size={14} /> Sync CRM <ArrowUpRight size={13} className="ml-auto text-slate-500" />
          </button>
        </div>

        <div className="border-t border-white/10 pt-6">
          <div className="mb-4 flex items-center gap-2">
            <Plus size={15} className="text-fuchsia-300" />
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">SME input</h2>
          </div>
          <label className="text-xs text-slate-500" htmlFor="node-label">Entity label</label>
          <input id="node-label" className={inputClass} value={nodeLabel} onChange={(event) => setNodeLabel(event.target.value)} placeholder="Supplier" />
          <label className="mt-4 block text-xs text-slate-500" htmlFor="node-properties">Properties JSON</label>
          <textarea id="node-properties" className={`${inputClass} min-h-24 resize-y font-mono leading-5`} value={nodeProperties} onChange={(event) => setNodeProperties(event.target.value)} />
          <button type="button" className={`${buttonClass} mt-3 bg-fuchsia-400 text-[#190d25] hover:bg-fuchsia-300`} disabled={Boolean(busy) || !nodeLabel.trim()} onClick={() => void createNode()}>
            {busy === 'node' ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />} Create entity
          </button>

          <div className="my-6 h-px bg-white/10" />
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-300"><Link2 size={14} className="text-fuchsia-300" /> Link entities</div>
          <input className={inputClass} value={sourceNode} onChange={(event) => setSourceNode(event.target.value)} placeholder="Source node ID" />
          <input className={inputClass} value={targetNode} onChange={(event) => setTargetNode(event.target.value)} placeholder="Target node ID" />
          <input className={inputClass} value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder="Relationship name" />
          <button type="button" className={`${buttonClass} mt-3 border border-fuchsia-300/30 text-fuchsia-200 hover:bg-fuchsia-300/10`} disabled={Boolean(busy) || !sourceNode.trim() || !targetNode.trim() || !relationship.trim()} onClick={() => void createEdge()}>
            {busy === 'edge' ? <LoaderCircle size={14} className="animate-spin" /> : <Link2 size={14} />} Create relationship
          </button>
        </div>
        {notice && <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-5 text-slate-400">{notice}</p>}
      </div>
    </aside>
  );
}