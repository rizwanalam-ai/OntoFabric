import { useState } from 'react';
import axios from 'axios';
import { CheckCircle2, CloudCog, LoaderCircle, Save, X } from 'lucide-react';
import { api } from '../api';

import type { GraphNode, Primitive } from '@ontofabric/shared/types.js';

type ActionExecutionModalProps = {
  node: GraphNode;
  changedFields: Record<string, Primitive>;
  onClose: () => void;
  onLocalSave: () => void;
  onSyncSuccess: () => void;
};

type ExecutionState = 'idle' | 'pending' | 'success' | 'error';
export function ActionExecutionModal({ node, changedFields, onClose, onLocalSave, onSyncSuccess }: ActionExecutionModalProps) {
  const [state, setState] = useState<ExecutionState>('idle');
  const [error, setError] = useState('');
  const [successLabel, setSuccessLabel] = useState('Sync Success');
  const supportsSync = node.sourceSystem === 'ERP' || node.sourceSystem === 'CRM';
  const actionType = node.sourceSystem === 'CRM' ? 'update_crm_account_status' : 'update_sap_purchase_order';

  const saveLocal = async () => {
    setState('pending');
    setError('');
    try {
      await api.post('/api/actions/local-update', { nodeId: node.id, oldValues: node.properties, newValues: changedFields });
      onLocalSave();
      setSuccessLabel('Saved locally');
      setState('success');
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? requestError.response?.data?.error ?? 'Local graph update failed.' : 'Local graph update failed.');
      setState('error');
    }
  };

  const syncSource = async () => {
    setState('pending');
    setError('');
    try {
      const payload = node.sourceSystem === 'CRM'
        ? { nodeId: node.id, accountId: String(node.properties.accountId ?? node.id), status: String(changedFields.status ?? node.properties.status ?? '') , oldValues: node.properties, newValues: changedFields }
        : { nodeId: node.id, orderId: String(node.properties.orderId ?? node.properties.purchaseOrderId ?? node.id), updatedFields: changedFields, oldValues: node.properties, newValues: changedFields };
      await api.post('/api/actions/write-back', { actionType, payload });
      onSyncSuccess();
      setSuccessLabel('Sync Success');
      setState('success');
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? requestError.response?.data?.error ?? 'MCP write failed.' : 'MCP write failed.');
      setState('error');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#030711]/65 p-4 backdrop-blur-sm md:items-center" role="dialog" aria-modal="true" aria-labelledby="action-execution-title">
      <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#101a2c] p-5 shadow-2xl shadow-black/50">
        <header className="flex items-start justify-between gap-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Action execution</p><h2 id="action-execution-title" className="mt-2 text-lg font-semibold text-white">Save changes to {node.properties.name ?? node.id}</h2><p className="mt-1 text-xs text-slate-500">Choose where the edited values should be applied.</p></div>
          <button type="button" onClick={onClose} aria-label="Close action execution" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X size={17} /></button>
        </header>
        <div className="mt-5 rounded-xl border border-white/10 bg-[#0a1221] p-3 text-xs"><p className="mb-2 font-semibold text-slate-300">Changed properties</p>{Object.entries(changedFields).map(([key, value]) => <div key={key} className="flex justify-between gap-4 border-t border-white/5 py-2 first:border-0"><span className="text-slate-500">{key}</span><span className="font-mono text-cyan-100">{String(value ?? 'null')}</span></div>)}</div>
        {state === 'pending' && <div className="mt-4 flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2.5 text-xs text-cyan-100"><LoaderCircle size={14} className="animate-spin" /> Pending MCP Write</div>}
        {state === 'success' && <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-2.5 text-xs text-emerald-100"><CheckCircle2 size={14} /> {successLabel}</div>}
        {error && <p className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/10 px-3 py-2.5 text-xs text-rose-100" role="alert">{error}</p>}
        {state !== 'success' && <div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => void saveLocal()} disabled={state === 'pending'} className="flex items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-3 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"><Save size={14} /> Save to Local Graph Only</button><button type="button" onClick={() => void syncSource()} disabled={!supportsSync || state === 'pending'} className="flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-3 py-3 text-xs font-bold text-[#06111d] hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"><CloudCog size={14} /> Sync Back to {node.sourceSystem === 'CRM' ? 'Salesforce' : 'SAP'}</button></div>}
        {!supportsSync && <p className="mt-3 text-[11px] text-slate-500">This node has no configured SAP or Salesforce connector.</p>}
        {state === 'success' && <button type="button" onClick={onClose} className="mt-5 w-full rounded-xl border border-white/10 px-3 py-2.5 text-xs font-bold text-slate-300 hover:bg-white/10">Close</button>}
      </section>
    </div>
  );
}
