import { X } from 'lucide-react';

import type { GraphNode } from '@ontofabric/shared/types.js';

type LineageInspectorModalProps = {
  node: GraphNode | null;
  onClose: () => void;
};

export function LineageInspectorModal({ node, onClose }: LineageInspectorModalProps) {
  if (!node) return null;
  const provenance = node.provenance;
  const rawLabel = provenance.filePath
    ? `${provenance.filePath}${provenance.lineNumber ? ` (Row ${provenance.lineNumber})` : ''}`
    : provenance.rawSourceId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-[#030711]/55 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <aside className="h-full max-h-[760px] w-full max-w-xl overflow-y-auto rounded-3xl border border-white/10 bg-[#101a2c] shadow-2xl shadow-black/50" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">Provenance & lineage</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-100">{node.properties.name ?? node.id}</h2>
            <p className="mt-1 font-mono text-xs text-slate-500">{node.id}</p>
          </div>
          <button type="button" aria-label="Close lineage inspector" onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </header>
        <div className="space-y-6 px-6 py-6">
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Source chain</p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-amber-100">Raw file: {rawLabel}</span>
              <span className="text-slate-600">-&gt;</span>
              <span className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-cyan-100">MCP Tool: {provenance.mcpTool ?? 'ingestion connector'}</span>
              <span className="text-slate-600">-&gt;</span>
              <span className="rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/10 px-3 py-2 text-fuchsia-100">Node: {node.id}</span>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-[#0a1221] p-4 text-xs">
            <div><dt className="text-slate-600">Source system</dt><dd className="mt-1 text-slate-200">{provenance.sourceSystem}</dd></div>
            <div><dt className="text-slate-600">Raw source ID</dt><dd className="mt-1 font-mono text-slate-200">{provenance.rawSourceId}</dd></div>
            <div><dt className="text-slate-600">Extracted</dt><dd className="mt-1 text-slate-200">{new Date(provenance.extractionTimestamp).toLocaleString()}</dd></div>
            <div><dt className="text-slate-600">Line number</dt><dd className="mt-1 text-slate-200">{provenance.lineNumber ?? 'Not provided'}</dd></div>
          </dl>
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Raw source payload</p>
            <pre className="max-h-64 overflow-auto rounded-2xl border border-white/10 bg-[#080e19] p-4 font-mono text-xs leading-5 text-cyan-100">{provenance.rawPayload ?? 'Raw payload was not retained for this record.'}</pre>
          </div>
        </div>
      </aside>
    </div>
  );
}