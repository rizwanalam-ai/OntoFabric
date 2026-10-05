import { useEffect, useState } from 'react';
import axios from 'axios';
import { ChevronLeft, ChevronRight, ClipboardCheck, Database, LayoutDashboard, Network, PencilRuler, Search, Settings2, Sparkles } from 'lucide-react';
import { api } from './api';

import type { GraphEdge, GraphNode, Primitive } from '@ontofabric/shared/types.js';
import { ActionExecutionModal } from './components/ActionExecutionModal';
import { GraphExplorer } from './components/GraphExplorer';
import { GraphChatAssistant } from './components/GraphChatAssistant';
import { IngestionPanel } from './components/IngestionPanel';
import { NodeDetailDrawer } from './components/NodeDetailDrawer';
import { LineageInspectorModal } from './components/LineageInspectorModal';
import { SMEMatchQueue, type PendingMatch } from './components/SMEMatchQueue';
import { BusinessCockpit } from './components/BusinessCockpit';
import { SchemaDesigner } from './components/SchemaDesigner';
import { AiSettingsModal } from './components/AiSettingsModal';
import { DataSourcesAdmin } from './components/DataSourcesAdmin';

type GraphPayload = { nodes: GraphNode[]; edges: GraphEdge[] };
type WorkspaceView = 'explorer' | 'approvals' | 'cockpit' | 'designer' | 'data-sources';

export default function App() {
  const [graph, setGraph] = useState<GraphPayload>({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [pendingAction, setPendingAction] = useState<{ node: GraphNode; changedFields: Record<string, Primitive> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);
  const [lineageNode, setLineageNode] = useState<GraphNode | null>(null);
  const [isSourceSyncOpen, setIsSourceSyncOpen] = useState(true);
  const [isAssistantOpen, setIsAssistantOpen] = useState(true);
  const [activeView, setActiveView] = useState<WorkspaceView>('explorer');
  const [quickAction, setQuickAction] = useState<'entity' | 'relationship' | null>(null);
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const refreshGraph = async () => {
    try {
      setLoading(true);
      const { data: ontologyGraph } = await api.get<GraphPayload>('/api/ontology/graph');
      setGraph(ontologyGraph);
      setError('');
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message ?? 'Unable to load the business graph from Neo4j.' : 'Unable to load the business graph from Neo4j.');
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
  const applyLocalChanges = () => {
    if (!pendingAction) return;
    const { node, changedFields } = pendingAction;
    const updateNode = (current: GraphNode): GraphNode => current.id === node.id ? { ...current, properties: { ...current.properties, ...changedFields } } : current;
    setGraph((current) => ({ ...current, nodes: current.nodes.map(updateNode) }));
    setSelectedNode(updateNode(node));
  };
  const deleteNode = async (node: GraphNode) => {
    try {
      await api.delete(`/api/ontology/nodes/${encodeURIComponent(node.id)}`);
      setGraph((current) => ({
        nodes: current.nodes.filter((item) => item.id !== node.id),
        edges: current.edges.filter((edge) => edge.source !== node.id && edge.target !== node.id)
      }));
      setSelectedNode(null);
    } catch (requestError) {
      throw new Error(axios.isAxiosError(requestError)
        ? requestError.response?.data?.message ?? requestError.response?.data?.error ?? 'Unable to delete this entity.'
        : 'Unable to delete this entity.');
    }
  };
  const deleteNodes = async (ids: string[]) => {
    await api.post('/api/ontology/nodes/bulk-delete', { ids });
    const deletedIds = new Set(ids);
    setGraph((current) => ({
      nodes: current.nodes.filter((node) => !deletedIds.has(node.id)),
      edges: current.edges.filter((edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target))
    }));
    if (selectedNode && deletedIds.has(selectedNode.id)) setSelectedNode(null);
  };
  const createRelationship = async (source: string, target: string, relationship: string) => {
    const { data } = await api.post<{ edge: GraphEdge }>('/api/sme/entity', {
      edge: { id: `REL-${crypto.randomUUID()}`, source, target, relationship, properties: {} }
    });
    setGraph((current) => ({ ...current, edges: [...current.edges, data.edge] }));
  };
  const entityLabels = [...new Set(graph.nodes.map((node) => node.type.label))];
  const relationshipNames = [...new Set(graph.edges.map((edge) => edge.relationship))];

  return (
    <main className="min-h-screen bg-[#f5f8fc] text-slate-800">
      <header className="flex min-h-[64px] items-center justify-between border-b border-[#183c62] bg-[#08294d] px-5 py-3 text-white backdrop-blur md:px-8">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-[#bdeafa] shadow-[0_10px_25px_rgba(15,46,74,0.12)]">
            <div className="relative h-5 w-5">
              <span className="absolute left-1 top-1 h-2.5 w-2.5 rounded-full bg-[#bdeafa]" />
              <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-[#bdeafa]" />
              <span className="absolute bottom-0 left-1 h-2.5 w-2.5 rounded-full bg-[#bdeafa]" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2"><h1 className="text-lg font-semibold tracking-tight text-white">Datamainstay</h1><span className="flex items-center gap-2 rounded-full border border-blue-300/40 bg-blue-300/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-blue-100"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-300" />Workspace active</span></div>
            <p className="mt-1 text-xs text-blue-100/75">Enterprise ontology command center</p>
          </div>
        </div>
        <nav className="flex items-center gap-2 text-xs text-blue-100">
          <button type="button" aria-label="Search workspace" className="hidden rounded-xl p-2.5 transition hover:bg-white/10 hover:text-white sm:block"><Search size={17} /></button>
          <button type="button" aria-label="Workspace settings" onClick={() => setIsAiSettingsOpen(true)} className="rounded-xl p-2.5 transition hover:bg-white/10 hover:text-white"><Settings2 size={17} /></button>
        </nav>
      </header>
      <nav className="border-b border-[#183c62] bg-[#0b3159] px-3 md:px-8" aria-label="Workspace sections">
        <div className="flex max-w-7xl gap-1" role="tablist">
          {[
            { id: 'explorer', label: 'Explorer', icon: Network },
            { id: 'designer', label: 'Schema Designer', icon: PencilRuler },
            { id: 'approvals', label: 'Approvals', icon: ClipboardCheck },
            { id: 'cockpit', label: 'Business Cockpit', icon: LayoutDashboard },
            { id: 'data-sources', label: 'Data Sources', icon: Database }
          ].map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={activeView === id} onClick={() => setActiveView(id as WorkspaceView)} className={`flex items-center gap-2 border-b-2 px-3 py-3 text-xs font-semibold transition ${activeView === id ? 'border-[#4385ff] text-white' : 'border-transparent text-blue-100/75 hover:border-white/40 hover:text-white'}`}><Icon size={14} />{label}</button>)}
        </div>
      </nav>
      <div className="flex min-h-[calc(100vh-112px)] flex-col lg:flex-row">
        {activeView === 'explorer' ? <>
          {isSourceSyncOpen && <IngestionPanel id="source-sync-panel" onRefresh={refreshGraph} onConfigureDataSources={() => setActiveView('data-sources')} graphNodes={graph.nodes} entityLabels={entityLabels} relationshipNames={relationshipNames} quickAction={quickAction} onQuickActionHandled={() => setQuickAction(null)} />}
          <section className="flex min-h-[650px] min-w-0 flex-1 flex-col gap-3 p-3 md:p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#3b82f6]"><Sparkles size={13} /> Ontology explorer</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-800 md:text-3xl">See how your business connects.</h2>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setIsSourceSyncOpen((current) => !current)} aria-expanded={isSourceSyncOpen} aria-controls="source-sync-panel" className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-slate-600 transition hover:bg-slate-200 hover:text-slate-900">{isSourceSyncOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />} <span className="hidden sm:inline">Source sync</span></button>
              <button type="button" onClick={() => setIsAssistantOpen((current) => !current)} aria-expanded={isAssistantOpen} aria-controls="graph-assistant-panel" className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"><span className="hidden sm:inline">Assistant</span>{isAssistantOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}</button>
              {loading ? <span className="ml-2 text-xs text-slate-500">Loading graph...</span> : <span className="ml-2 font-mono text-xs text-slate-500">{graph.nodes.length}N / {graph.edges.length}E</span>}
            </div>
          </div>
          {error && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">{error}</div>}
          <div className="flex h-[calc(100vh-155px)] min-h-[680px] min-w-0 flex-1 flex-col gap-3 xl:flex-row">
            <GraphExplorer
              nodes={graph.nodes}
              edges={graph.edges}
              onNodeClick={setSelectedNode}
              highlightedNodeIds={highlightedNodeIds}
              onNodeContextMenu={setLineageNode}
              onCreateEntity={() => setQuickAction('entity')}
              onAddRelationship={() => setQuickAction('relationship')}
              onDeleteNodes={deleteNodes}
              onCreateRelationship={createRelationship}
            />
            {isAssistantOpen && <GraphChatAssistant id="graph-assistant-panel" onHighlightNodes={setHighlightedNodeIds} />}
          </div>
          </section>
        </> : activeView === 'designer' ? <SchemaDesigner /> : activeView === 'data-sources' ? <DataSourcesAdmin /> : activeView === 'approvals'
          ? <section className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6"><SMEMatchQueue matches={pendingMatches} onResolved={removePendingMatch} /></section>
          : <BusinessCockpit nodes={graph.nodes} edges={graph.edges} onRefresh={refreshGraph} onOpenExplorer={() => setActiveView('explorer')} />}
      </div>
      <NodeDetailDrawer node={selectedNode} edges={graph.edges} onClose={() => setSelectedNode(null)} onViewLineage={(node) => setLineageNode(node)} onEditProperties={(node, changedFields) => setPendingAction({ node, changedFields })} onDeleteNode={deleteNode} />
      {pendingAction && <ActionExecutionModal node={pendingAction.node} changedFields={pendingAction.changedFields} onClose={() => setPendingAction(null)} onLocalSave={() => { applyLocalChanges(); setPendingAction(null); }} onSyncSuccess={() => { applyLocalChanges(); }} />}
      <LineageInspectorModal node={lineageNode} onClose={() => setLineageNode(null)} />
      {isAiSettingsOpen && <AiSettingsModal onClose={() => setIsAiSettingsOpen(false)} />}
    </main>
  );
}