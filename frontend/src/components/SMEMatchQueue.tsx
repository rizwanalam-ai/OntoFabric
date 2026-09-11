import { useState } from 'react';
import axios from 'axios';
import { Check, ChevronLeft, ChevronRight, Link2, LoaderCircle, ShieldAlert, X } from 'lucide-react';

import type { GraphNode } from '@ontofabric/shared/types.js';

export type PendingMatch = {
  pendingId: string;
  entityA: GraphNode;
  entityB: GraphNode;
  confidence: number;
  conflicts: string[];
  status: 'PENDING';
  createdAt: string;
};

type SMEMatchQueueProps = {
  matches: PendingMatch[];
  onResolved: (pendingId: string) => Promise<void>;
};

const sourceColor: Record<GraphNode['sourceSystem'], string> = {
  ERP: 'text-blue-300 bg-blue-300/10 border-blue-300/20',
  CRM: 'text-emerald-300 bg-emerald-300/10 border-emerald-300/20',
  EXCEL: 'text-amber-300 bg-amber-300/10 border-amber-300/20',
  PDF: 'text-amber-300 bg-amber-300/10 border-amber-300/20',
  SME_INPUT: 'text-fuchsia-300 bg-fuchsia-300/10 border-fuchsia-300/20',
  SOP: 'text-teal-300 bg-teal-300/10 border-teal-300/20'
};

const displayValue = (value: unknown): string => value === null || value === undefined ? 'Not provided' : String(value);

function EntityCard({ label, node, conflicts }: { label: string; node: GraphNode; conflicts: string[] }) {
  const fields = [...new Set([...Object.keys(node.properties), ...conflicts])];
  return (
    <div className="min-w-0 flex-1 rounded-2xl border border-white/15 bg-[#0a1221] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">{label}</span>
        <span className={`rounded-full border px-2 py-1 text-[9px] font-bold tracking-[0.12em] ${sourceColor[node.sourceSystem]}`}>{node.sourceSystem}</span>
      </div>
      <h4 className="mt-3 truncate text-sm font-semibold text-slate-100">{displayValue(node.properties.name ?? node.id)}</h4>
      <p className="mt-1 truncate font-mono text-[10px] text-slate-400">{node.id}</p>
      <dl className="mt-4 space-y-2">
        {fields.map((key) => (
          <div key={key} className={`flex items-start justify-between gap-4 rounded-lg px-2 py-1.5 text-xs ${conflicts.includes(key) ? 'bg-amber-300/10 ring-1 ring-amber-300/20' : ''}`}>
            <dt className="text-slate-300">{key}</dt>
            <dd className={`max-w-[62%] truncate text-right ${conflicts.includes(key) ? 'text-amber-100' : 'text-slate-300'}`}>{displayValue(node.properties[key])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function SMEMatchQueue({ matches, onResolved }: SMEMatchQueueProps) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const match = matches[index];

  const resolve = async (action: 'MERGE' | 'LINK' | 'REJECT') => {
    if (!match) return;
    setBusy(action);
    setError('');
    try {
      await axios.post(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/api/resolution/approve`, { pendingId: match.pendingId, action });
      await onResolved(match.pendingId);
      setIndex((current) => Math.min(current, Math.max(0, matches.length - 2)));
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'Resolution request failed.' : 'Resolution request failed.');
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="rounded-[1.75rem] border border-white/15 bg-[#0c1525] p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300"><ShieldAlert size={13} /> SME approval queue</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Resolve possible duplicates</h3>
          <p className="mt-1 text-xs text-slate-300">Review low-confidence matches before they enter the canonical graph.</p>
        </div>
        <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 font-mono text-xs text-amber-200">{matches.length} pending</span>
      </div>
      {!match ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/15 px-5 py-8 text-center text-xs text-slate-300">No candidate matches need review.</div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-300"><span className="font-mono text-white">{index + 1}</span> of {matches.length}</div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Previous match" disabled={index === 0} onClick={() => setIndex((current) => current - 1)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 disabled:opacity-30"><ChevronLeft size={16} /></button>
              <button type="button" aria-label="Next match" disabled={index === matches.length - 1} onClick={() => setIndex((current) => current + 1)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>
          </div>
          <div className="relative mt-3 flex flex-col gap-3 lg:flex-row">
            <EntityCard label="Entity A" node={match.entityA} conflicts={match.conflicts} />
            <div className="flex shrink-0 items-center justify-center lg:w-20">
              <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-center">
                <div className="text-xl font-semibold text-amber-200">{Math.round(match.confidence * 100)}%</div>
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-amber-300/70">match</div>
              </div>
            </div>
            <EntityCard label="Entity B" node={match.entityB} conflicts={match.conflicts} />
          </div>
          {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(busy)} onClick={() => void resolve('MERGE')} className="flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-bold text-[#06150e] transition hover:bg-emerald-300 disabled:opacity-40"><Check size={14} /> {busy === 'MERGE' ? <LoaderCircle size={14} className="animate-spin" /> : 'Approve merge'}</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void resolve('LINK')} className="flex items-center gap-2 rounded-xl border border-cyan-300/30 px-4 py-2.5 text-xs font-bold text-cyan-200 transition hover:bg-cyan-300/10 disabled:opacity-40"><Link2 size={14} /> Link as alias</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => void resolve('REJECT')} className="flex items-center gap-2 rounded-xl border border-rose-300/20 px-4 py-2.5 text-xs font-bold text-rose-200 transition hover:bg-rose-300/10 disabled:opacity-40"><X size={14} /> Reject match</button>
          </div>
        </>
      )}
    </section>
  );
}