import { useEffect, useState } from 'react';
import axios from 'axios';
import { Activity, ChevronLeft, ChevronRight, ClipboardCheck, Factory, Network, Search, Settings2, Sparkles } from 'lucide-react';

import type { DomainContext, GraphEdge, GraphNode } from '@ontofabric/shared/types.js';
import { DomainSelector } from './components/DomainSelector';
import { GraphExplorer } from './components/GraphExplorer';
import { GraphChatAssistant } from './components/GraphChatAssistant';
import { IngestionPanel } from './components/IngestionPanel';
import { NodeDetailDrawer } from './components/NodeDetailDrawer';
import { LineageInspectorModal } from './components/LineageInspectorModal';
import { SMEMatchQueue, type PendingMatch } from './components/SMEMatchQueue';
import { SopPlanningPanel } from './components/SopPlanningPanel';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001' });

type GraphPayload = { nodes: GraphNode[]; edges: GraphEdge[] };
type WorkspaceView = 'explorer' | 'approvals' | 'cockpit';

export default function App() {
  const [graph, setGraph] = useState<GraphPayload>({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);
  const [lineageNode, setLineageNode] = useState<GraphNode | null>(null);
  const [isSourceSyncOpen, setIsSourceSyncOpen] = useState(true);
  const [isAssistantOpen, setIsAssistantOpen] = useState(true);
  const [activeView, setActiveView] = useState<WorkspaceView>('explorer');
  const [selectedDomain, setSelectedDomain] = useState<DomainContext>('SUPPLY_CHAIN');
  const refreshGraph = async (domain: DomainContext = selectedDomain) => {
    try {
      setLoading(true);
      const [{ data: ontologyGraph }, { data: sopGraph }] = await Promise.all([
        api.get<GraphPayload>('/api/ontology/graph', { params: { domain } }),
        domain === 'SUPPLY_CHAIN' ? api.get<GraphPayload>('/api/sop/graph') : Promise.resolve({ data: { nodes: [], edges: [] } })
      ]);
      const mergedNodes = new Map(sopGraph.nodes.map((node) => [node.id, node]));
      ontologyGraph.nodes.forEach((node) => mergedNodes.set(node.id, node));
      const mergedEdges = new Map(sopGraph.edges.map((edge) => [edge.id, edge]));
      ontologyGraph.edges.forEach((edge) => mergedEdges.set(edge.id, edge));
      setGraph({ nodes: [...mergedNodes.values()], edges: [...mergedEdges.values()] });
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
  }, [selectedDomain]);

  const removePendingMatch = async (pendingId: string) => {
    setPendingMatches((matches) => matches.filter((match) => match.pendingId !== pendingId));
  };
  const entityLabels = [...new Set(graph.nodes.map((node) => node.type.label))];
  const relationshipNames = [...new Set(graph.edges.map((edge) => edge.relationship))];

  return (
    <main className="min-h-screen bg-[#060b14] text-slate-100">
      <header className="flex min-h-[64px] items-center justify-between border-b border-white/10 bg-[#0a1221]/90 px-5 py-3 backdrop-blur md:px-8">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-300 text-[#07111d] shadow-lg shadow-cyan-300/10"><Network size={20} /></div>
          <div>
            <div className="flex items-center gap-2"><h1 className="text-lg font-semibold tracking-tight">OntoFabric</h1><span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-200">Workspace</span></div>
            <p className="mt-1 text-xs text-slate-500">Enterprise ontology command center</p>
          </div>
        </div>
        <nav className="flex items-center gap-2 text-xs text-slate-400">
          <span className="hidden items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-emerald-200 sm:flex"><Activity size={13} /> Live workspace</span>
          <button type="button" aria-label="Search workspace" className="hidden rounded-xl p-2.5 transition hover:bg-white/10 hover:text-white sm:block"><Search size={17} /></button>
          <DomainSelector domain={selectedDomain} onDomainChange={setSelectedDomain} />
          <button type="button" aria-label="Workspace settings" className="rounded-xl p-2.5 transition hover:bg-white/10 hover:text-white"><Settings2 size={17} /></button>
        </nav>
      </header>
      <nav className="border-b border-white/15 bg-[#0a1221] px-3 md:px-8" aria-label="Workspace sections">
        <div className="flex max-w-7xl gap-1" role="tablist">
          {[
            { id: 'explorer', label: 'Explorer', icon: Network },
            { id: 'approvals', label: 'Approvals', icon: ClipboardCheck },
            { id: 'cockpit', label: 'S&OP Cockpit', icon: Factory }
          ].map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={activeView === id} onClick={() => setActiveView(id as WorkspaceView)} className={`flex items-center gap-2 border-b-2 px-3 py-3 text-xs font-semibold transition ${activeView === id ? 'border-cyan-300 text-cyan-200' : 'border-transparent text-slate-400 hover:border-white/30 hover:text-slate-200'}`}><Icon size={14} />{label}</button>)}
        </div>
      </nav>
      <div className="flex min-h-[calc(100vh-112px)] flex-col lg:flex-row">
        {activeView === 'explorer' ? <>
          {isSourceSyncOpen && <IngestionPanel id="source-sync-panel" domain={selectedDomain} onRefresh={() => refreshGraph(selectedDomain)} graphNodes={graph.nodes} entityLabels={entityLabels} relationshipNames={relationshipNames} />}
          <section className="flex min-h-[650px] min-w-0 flex-1 flex-col gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-fuchsia-300"><Sparkles size={13} /> Ontology explorer</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white md:text-3xl">See how your business connects.</h2>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setIsSourceSyncOpen((current) => !current)} aria-expanded={isSourceSyncOpen} aria-controls="source-sync-panel" className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white">{isSourceSyncOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />} <span className="hidden sm:inline">Source sync</span></button>
              <button type="button" onClick={() => setIsAssistantOpen((current) => !current)} aria-expanded={isAssistantOpen} aria-controls="graph-assistant-panel" className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-slate-400 transition hover:bg-white/10 hover:text-white"><span className="hidden sm:inline">Assistant</span>{isAssistantOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}</button>
              {loading ? <span className="ml-2 text-xs text-slate-500">Loading graph...</span> : <span className="ml-2 font-mono text-xs text-slate-500">{graph.nodes.length}N / {graph.edges.length}E</span>}
            </div>
          </div>
          {error && <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-xs text-amber-100">{error}</div>}
          <div className="flex h-[calc(100vh-155px)] min-h-[680px] min-w-0 flex-1 flex-col gap-3 xl:flex-row">
            <GraphExplorer
              nodes={graph.nodes}
              edges={graph.edges}
              onNodeClick={setSelectedNode}
              highlightedNodeIds={highlightedNodeIds}
              onNodeContextMenu={setLineageNode}
            />
            {isAssistantOpen && <GraphChatAssistant id="graph-assistant-panel" domain={selectedDomain} onHighlightNodes={setHighlightedNodeIds} />}
          </div>
          </section>
        </> : <section className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
          {activeView === 'approvals' ? <SMEMatchQueue matches={pendingMatches} onResolved={removePendingMatch} /> : <SopPlanningPanel refreshKey={graph.nodes.length + graph.edges.length} />}
        </section>}
      </div>
      <NodeDetailDrawer node={selectedNode} onClose={() => setSelectedNode(null)} onViewLineage={(node) => setLineageNode(node)} />
      <LineageInspectorModal node={lineageNode} onClose={() => setLineageNode(null)} />
    </main>
  );
}