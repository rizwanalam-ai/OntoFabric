import { useEffect, useState } from 'react';
import { ChevronRight, GitMerge, Save, Trash2, X } from 'lucide-react';

import type { GraphEdge, GraphNode, Primitive } from '@ontofabric/shared/types.js';

type NodeDetailDrawerProps = {
  node: GraphNode | null;
  onClose: () => void;
  onExpandHops?: (node: GraphNode) => void;
  onViewLineage?: (node: GraphNode) => void;
  onEditProperties?: (node: GraphNode, changedFields: Record<string, Primitive>) => void;
  onDeleteNode?: (node: GraphNode) => Promise<void>;
  edges?: GraphEdge[];
};

export function NodeDetailDrawer({ node, onClose, onExpandHops, onViewLineage, onEditProperties, onDeleteNode, edges = [] }: NodeDetailDrawerProps) {
  const [draftProperties, setDraftProperties] = useState<Record<string, string>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  useEffect(() => {
    setDraftProperties(Object.fromEntries(Object.entries(node?.properties ?? {}).map(([key, value]) => [key, String(value ?? '')])));
    setConfirmingDelete(false);
    setDeleteError('');
  }, [node]);

  if (!node) return null;

  const linkedEdges = edges.filter((edge) => edge.source === node.id || edge.target === node.id);

  const changedFields = Object.fromEntries(Object.entries(node.properties).filter(([key, value]) => draftProperties[key] !== String(value ?? '')).map(([key, value]) => {
    if (typeof value === 'number') return [key, Number(draftProperties[key])];
    if (typeof value === 'boolean') return [key, draftProperties[key] === 'true'];
    return [key, draftProperties[key] as Primitive];
  })) as Record<string, Primitive>;

  const deleteNode = async () => {
    if (!onDeleteNode) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await onDeleteNode(node);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete this entity.');
    } finally {
      setDeleting(false);
    }
  };

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
          <div><div className="mb-3 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Linked edges</p><span className="rounded-full bg-cyan-300/10 px-2 py-1 text-[10px] font-semibold text-cyan-200">{linkedEdges.length}</span></div><div className="space-y-2">{linkedEdges.length === 0 ? <p className="rounded-2xl border border-white/10 bg-[#0a1221] p-4 text-xs text-slate-500">No linked relationships found.</p> : linkedEdges.map((edge) => <div key={edge.id} className="rounded-xl border border-white/10 bg-[#0a1221] p-3 text-xs"><p className="font-semibold text-cyan-200">{edge.relationship}</p><p className="mt-1 font-mono text-[10px] text-slate-500">{edge.source} → {edge.target}</p></div>)}</div></div>
          <details className="rounded-2xl border border-white/10 bg-[#0a1221]">
            <summary className="cursor-pointer px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Raw JSON payload</summary>
            <pre className="max-h-72 overflow-auto border-t border-white/10 p-4 font-mono text-[10px] leading-5 text-cyan-100">{JSON.stringify(node, null, 2)}</pre>
          </details>
          <div><div className="mb-3 flex items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Attributes</p>{Object.keys(changedFields).length > 0 && <button type="button" onClick={() => onEditProperties?.(node, changedFields)} className="flex items-center gap-1 rounded-lg bg-cyan-300 px-2.5 py-1.5 text-[10px] font-bold text-[#06111d] hover:bg-cyan-200"><Save size={12} /> Save edits</button>}</div><div className="overflow-hidden rounded-2xl border border-white/10"><table className="w-full text-left text-xs"><tbody>{Object.entries(node.properties).map(([key, value]) => <tr key={key} className="border-b border-white/5 last:border-0"><th className="w-2/5 px-3 py-2.5 font-medium text-slate-500">{key}</th><td className="px-3 py-2"><input className="w-full rounded-lg border border-white/10 bg-[#0a1221] px-2 py-1.5 text-slate-200 outline-none focus:border-cyan-300/60" value={draftProperties[key] ?? ''} onChange={(event) => setDraftProperties((current) => ({ ...current, [key]: event.target.value }))} aria-label={`Edit ${key}`} /></td></tr>)}</tbody></table></div></div>
          {deleteError && <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800" role="alert">{deleteError}</p>}
          {confirmingDelete && <div className="rounded-xl border border-rose-300 bg-rose-50 p-3" role="alertdialog" aria-label="Confirm entity deletion"><p className="text-xs font-semibold text-rose-900">Delete this entity and its linked relationships?</p><div className="mt-3 flex justify-end gap-2"><button type="button" disabled={deleting} onClick={() => setConfirmingDelete(false)} className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-900 disabled:opacity-60">Cancel</button><button type="button" disabled={deleting} onClick={() => void deleteNode()} className="flex items-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60">{deleting ? 'Deleting...' : <><Trash2 size={13} /> Delete node</>}</button></div></div>}
          <div className="grid gap-2"><button type="button" onClick={() => onExpandHops?.(node)} className="flex items-center justify-between rounded-xl border border-cyan-300/40 bg-cyan-50 px-4 py-3 text-xs font-bold text-[#174b9b] transition hover:bg-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-2"><span className="flex items-center gap-2"><GitMerge size={14} /> Expand 2-Hops</span><ChevronRight size={14} /></button><button type="button" onClick={() => onViewLineage?.(node)} className="flex items-center justify-between rounded-xl border border-fuchsia-300/40 bg-fuchsia-50 px-4 py-3 text-xs font-bold text-[#81266f] transition hover:bg-fuchsia-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-700 focus-visible:ring-offset-2">View Lineage <ChevronRight size={14} /></button>{onDeleteNode && <button type="button" disabled={deleting} onClick={() => { setConfirmingDelete(true); setDeleteError(''); }} className="flex items-center justify-between rounded-xl border border-rose-300 bg-white px-4 py-3 text-xs font-bold text-rose-800 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"><span className="flex items-center gap-2"><Trash2 size={14} /> Delete node</span><ChevronRight size={14} /></button>}</div>
        </div>
      </aside>
    </div>
  );
}
