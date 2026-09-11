import { useEffect, useState } from 'react';
import axios from 'axios';
import { Activity, Network, Search, Settings2, Sparkles } from 'lucide-react';

import type { GraphEdge, GraphNode } from '@ontofabric/shared/types.js';
import { GraphExplorer } from './components/GraphExplorer';
import { GraphChatAssistant } from './components/GraphChatAssistant';
import { IngestionPanel } from './components/IngestionPanel';
import { NodeDetailDrawer } from './components/NodeDetailDrawer';
import { LineageInspectorModal } from './components/LineageInspectorModal';
import { SMEMatchQueue, type PendingMatch } from './components/SMEMatchQueue';
import { SopPlanningPanel } from './components/SopPlanningPanel';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001' });

type GraphPayload = { nodes: GraphNode[]; edges: GraphEdge[] };

export default function App() {
  const [graph, setGraph] = useState<GraphPayload>({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);
  const [lineageNode, setLineageNode] = useState<GraphNode | null>(null);
  const refreshGraph = async () => {
    try {
      const { data } = await api.get<GraphPayload>('/api/sop/graph');
      setGraph(data);
      setError('');
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'Unable to load S&OP data from Neo4j.' : 'Unable to load S&OP data from Neo4j.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshGraph();
    void api.get<{ matches: PendingMatch[] }>('/api/resolution/pending')
      .then(({ data }) => setPendingMatches(data.matches))
      .catch(() => setPendingMatches([]));
  }, []);

  const removePendingMatch = async (pendingId: string) => {
    setPendingMatches((matches) => matches.filter((match) => match.pendingId !== pendingId));
  };

  return (
    <main className="min-h-screen bg-[#060b14] text-slate-100">
      <header className="flex min-h-[76px] items-center justify-between border-b border-white/10 bg-[#0a1221]/90 px-5 py-4 backdrop-blur md:px-8">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-300 text-[#07111d] shadow-lg shadow-cyan-300/10"><Network size={20} /></div>
          <div>
            <div className="flex items-center gap-2"><h1 className="text-lg font-semibold tracking-tight">OntoFabric</h1><span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-200">Workspace</span></div>
            <p className="mt-1 text-xs text-slate-500">Enterprise ontology command center</p>
          </div>
        </div>
        <nav className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
          <span className="flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-emerald-200"><Activity size={13} /> Live workspace</span>
          <button type="button" aria-label="Search workspace" className="rounded-xl p-2.5 transition hover:bg-white/10 hover:text-white"><Search size={17} /></button>
          <button type="button" aria-label="Workspace settings" className="rounded-xl p-2.5 transition hover:bg-white/10 hover:text-white"><Settings2 size={17} /></button>
        </nav>
      </header>
      <div className="flex min-h-[calc(100vh-76px)] flex-col lg:flex-row">
        <IngestionPanel onRefresh={refreshGraph} />
        <section className="flex min-h-[650px] min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-fuchsia-300"><Sparkles size={13} /> Ontology explorer</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">See how your business connects.</h2>
            </div>
            {loading ? <span className="text-xs text-slate-500">Loading graph...</span> : <span className="font-mono text-xs text-slate-500">{graph.nodes.length}N / {graph.edges.length}E</span>}
          </div>
          {error && <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-xs text-amber-100">{error}</div>}
          <div className="flex h-[calc(100vh-190px)] min-h-[680px] min-w-0 flex-1 flex-col gap-4 xl:flex-row">
            <GraphExplorer
              nodes={graph.nodes}
              edges={graph.edges}
              onNodeClick={setSelectedNode}
              highlightedNodeIds={highlightedNodeIds}
              onNodeContextMenu={setLineageNode}
            />
            <GraphChatAssistant onHighlightNodes={setHighlightedNodeIds} />
          </div>
          <SMEMatchQueue matches={pendingMatches} onResolved={removePendingMatch} />
          <SopPlanningPanel />
        </section>
      </div>
      <NodeDetailDrawer node={selectedNode} onClose={() => setSelectedNode(null)} onViewLineage={(node) => setLineageNode(node)} />
      <LineageInspectorModal node={lineageNode} onClose={() => setLineageNode(null)} />
    </main>
  );
}