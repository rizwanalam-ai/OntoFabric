import { useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import { Bot, ChevronDown, LoaderCircle, Send, Sparkles } from 'lucide-react';

import type { GraphNode } from '@ontofabric/shared/types.js';

type GraphChatAssistantProps = {
  onHighlightNodes: (nodeIds: string[]) => void;
  id?: string;
};

type QueryResponse = {
  answer: string;
  cypherQuery: string;
  sourceNodes: GraphNode[];
};

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001' });

export function GraphChatAssistant({ onHighlightNodes, id }: GraphChatAssistantProps) {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState<QueryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post<QueryResponse>('/api/chat/graph-query', { prompt: prompt.trim() });
      setResponse(data);
      onHighlightNodes(data.sourceNodes.map((node) => node.id));
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'The graph assistant is unavailable.' : 'The graph assistant is unavailable.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside id={id} className="flex w-full shrink-0 flex-col rounded-[1.75rem] border border-white/10 bg-[#0c1525] lg:w-[330px]">
      <div className="border-b border-white/10 p-5">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-300"><Sparkles size={13} /> Graph assistant</p>
        <h3 className="mt-2 text-lg font-semibold text-white">Ask the ontology</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">Answers are grounded in read-only Cypher results and cite source node IDs.</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-5">
        <div className="mb-4 flex items-center gap-2 text-xs text-slate-400"><Bot size={15} className="text-cyan-300" /> Natural-language query</div>
        <form onSubmit={submit}>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Which customers have open orders?"
            className="min-h-24 w-full resize-none rounded-xl border border-white/10 bg-[#0a1221] p-3 text-xs leading-5 text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/10"
          />
          <button type="submit" disabled={busy || !prompt.trim()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-3 py-2.5 text-xs font-bold text-[#06111d] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? <LoaderCircle size={14} className="animate-spin" /> : <Send size={14} />} Ask graph
          </button>
        </form>
        {error && <p className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/10 p-3 text-xs leading-5 text-rose-200">{error}</p>}
        {response && (
          <div className="mt-5 min-h-0 space-y-4 overflow-y-auto">
            <div className="rounded-2xl border border-white/10 bg-[#101a2c] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">Grounded answer</p>
              <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-slate-200">{response.answer}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#101a2c]">
              <details>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-xs font-semibold text-slate-300">Generated Cypher <ChevronDown size={14} className="text-slate-500" /></summary>
                <pre className="overflow-x-auto border-t border-white/10 bg-[#080e19] p-4 font-mono text-[10px] leading-5 text-cyan-100">{response.cypherQuery}</pre>
              </details>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Source nodes highlighted</p>
              <div className="flex flex-wrap gap-2">
                {response.sourceNodes.map((node) => <span key={node.id} className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 font-mono text-[10px] text-cyan-200">{node.id}</span>)}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}