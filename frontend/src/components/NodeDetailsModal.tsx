import { X } from 'lucide-react';

import type { GraphNode } from '@ontofabric/shared/types.js';

type NodeDetailsModalProps = {
  node: GraphNode | null;
  onClose: () => void;
};

export function NodeDetailsModal({ node, onClose }: NodeDetailsModalProps) {
  if (!node) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030711]/75 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <section className="max-h-[min(720px,calc(100vh-2rem))] w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-[#101a2c] shadow-2xl shadow-black/50" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">Entity details</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-100">{node.type.label}</h2>
            <p className="mt-1 font-mono text-xs text-slate-500">{node.id}</p>
          </div>
          <button type="button" aria-label="Close details" onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </header>
        <div className="overflow-y-auto px-6 py-5">
          <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-[#080e19] p-4 font-mono text-xs leading-6 text-slate-300">
            {JSON.stringify(node, null, 2)}
          </pre>
        </div>
      </section>
    </div>
  );
}