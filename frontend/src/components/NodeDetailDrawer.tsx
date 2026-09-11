import { ChevronRight, GitMerge, X } from 'lucide-react';

import type { GraphNode } from '@ontofabric/shared/types.js';

type NodeDetailDrawerProps = {
  node: GraphNode | null;
  onClose: () => void;
  onExpandHops?: (node: GraphNode) => void;
  onViewLineage?: (node: GraphNode) => void;
};

export function NodeDetailDrawer({ node, onClose, onExpandHops, onViewLineage }: NodeDetailDrawerProps) {
  if (!node) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#030711]/55 backdrop-blur-sm" onMouseDown={onClose}>
      <aside className="absolute bottom-0 right-0 top-0 w-full max-w-[430px] overflow-y-auto border-l border-white/10 bg-[#101a2c] shadow-2xl shadow-black/50" onMouseDown={(event) => event.stopPropagation()}>
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-white/10 bg-[#101a2c]/95 px-6 py-5 backdrop-blur-md">
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">Entity detail</p><h2 className="mt-2 truncate text-xl font-semibold text-slate-100">{node.properties.name ?? node.id}</h2><p className="mt-1 font-mono text-xs text-slate-500">{node.id}</p></div>
          <button type="button" aria-label="Close node details" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </header>
        <div className="space-y-6 px-6 py-6">
          <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-white/10 bg-[#0a1221] p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Entity type</p><p className="mt-2 text-sm font-semibold text-slate-200">{node.type.label}</p></div><div className="rounded-xl border border-white/10 bg-[#0a1221] p-3"><p className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Source</p><p className="mt-2 text-sm font-semibold text-cyan-200">{node.provenance.sourceSystem}</p></div></div>
          <div><p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Source provenance</p><div className="rounded-2xl border border-white/10 bg-[#0a1221] p-4 text-xs"><p className="text-slate-400">{node.provenance.filePath ?? node.provenance.rawSourceId}</p><p className="mt-2 font-mono text-slate-600">{node.provenance.rawSourceId}{node.provenance.lineNumber ? ` · line ${node.provenance.lineNumber}` : ''}</p></div></div>
          <div><p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Attributes</p><div className="overflow-hidden rounded-2xl border border-white/10"><table className="w-full text-left text-xs"><tbody>{Object.entries(node.properties).map(([key, value]) => <tr key={key} className="border-b border-white/5 last:border-0"><th className="w-2/5 px-3 py-2.5 font-medium text-slate-500">{key}</th><td className="px-3 py-2.5 text-slate-200">{String(value ?? 'null')}</td></tr>)}</tbody></table></div></div>
          <div className="grid gap-2"><button type="button" onClick={() => onExpandHops?.(node)} className="flex items-center justify-between rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-xs font-bold text-cyan-100 hover:bg-cyan-300/20"><span className="flex items-center gap-2"><GitMerge size={14} /> Expand 2-Hops</span><ChevronRight size={14} /></button><button type="button" onClick={() => onViewLineage?.(node)} className="flex items-center justify-between rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/10 px-4 py-3 text-xs font-bold text-fuchsia-100 hover:bg-fuchsia-300/20">View Lineage <ChevronRight size={14} /></button></div>
        </div>
      </aside>
    </div>
  );
}
