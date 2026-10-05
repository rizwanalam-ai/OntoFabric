import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import dagre from 'dagre';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Connection,
  type Node,
  type NodeProps,
  type ReactFlowInstance
} from '@xyflow/react';
import { Copy, Expand, Fullscreen, GitBranch, Link2, LocateFixed, Minimize2, MousePointer2, Plus, Search, Trash2, Waypoints, ZoomIn, ZoomOut } from 'lucide-react';
import '@xyflow/react/dist/style.css';

import type { GraphEdge, GraphNode } from '@ontofabric/shared/types.js';

type LayoutMode = 'force' | 'hierarchical';
type ExplorerEdge = Edge<{ establishedByApp?: boolean }>;
type ExplorerNodeData = {
  graphNode?: GraphNode;
  clusterMembers?: GraphNode[];
  highlighted: boolean;
  dimmed: boolean;
  isHub?: boolean;
  toggleCluster?: () => void;
};

type GraphExplorerProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick: (node: GraphNode) => void;
  timeline?: ReactNode;
  highlightedNodeIds?: string[];
  onNodeContextMenu?: (node: GraphNode) => void;
  onCreateEntity?: () => void;
  onAddRelationship?: () => void;
  onDeleteNodes: (ids: string[]) => Promise<void>;
  onCreateRelationship: (source: string, target: string, relationship: string) => Promise<void>;
};

const sourceStyles: Record<GraphNode['sourceSystem'], { accent: string; tint: string; label: string }> = {
  ERP: { accent: '#65d39b', tint: 'rgba(101, 211, 155, 0.16)', label: 'ERP' },
  CRM: { accent: '#f97316', tint: 'rgba(249, 115, 22, 0.16)', label: 'CRM' },
  EXCEL: { accent: '#f4bd62', tint: 'rgba(244, 189, 98, 0.16)', label: 'EXCEL' },
  CSV: { accent: '#7dd3fc', tint: 'rgba(125, 211, 252, 0.16)', label: 'CSV' },
  PDF: { accent: '#f38ba8', tint: 'rgba(243, 139, 168, 0.16)', label: 'PDF' },
  WORD: { accent: '#60a5fa', tint: 'rgba(96, 165, 250, 0.16)', label: 'WORD' },
  SME_INPUT: { accent: '#d69cff', tint: 'rgba(214, 156, 255, 0.16)', label: 'SME INPUT' },
  SOP: { accent: '#8bd5ca', tint: 'rgba(139, 213, 202, 0.16)', label: 'S&OP' },
  POSTGRES: { accent: '#93c5fd', tint: 'rgba(147, 197, 253, 0.16)', label: 'POSTGRES' },
  SNOWFLAKE: { accent: '#38bdf8', tint: 'rgba(56, 189, 248, 0.16)', label: 'SNOWFLAKE' },
  DATABRICKS: { accent: '#fb923c', tint: 'rgba(251, 146, 60, 0.16)', label: 'DATABRICKS' }
};

function OntologyNode({ data }: NodeProps<Node<ExplorerNodeData>>) {
  const graphNode = data.graphNode;
  const members = data.clusterMembers;
  const sourceStyle = sourceStyles[graphNode?.sourceSystem ?? members?.[0]?.sourceSystem ?? 'SME_INPUT'];
  const label = graphNode?.type.label ?? members?.[0]?.type.label ?? 'Group';
  const displayTitle = String(graphNode?.properties.displayTitle ?? graphNode?.properties.name ?? `${sourceStyle.label} ${label}`);
  const rawSourceId = graphNode?.provenance.rawSourceId ?? graphNode?.id;

  return (
    <div className="min-w-[210px] max-w-[250px] rounded-xl border bg-[#101a2c]/95 px-4 py-3 shadow-2xl shadow-black/30 transition-transform duration-200 hover:-translate-y-1" style={{ borderColor: data.highlighted ? '#f5f06a' : sourceStyle.accent, opacity: data.dimmed ? 0.25 : 1, boxShadow: data.highlighted ? '0 0 0 3px rgba(245, 240, 106, 0.24), 0 14px 38px rgba(0, 0, 0, 0.24)' : data.isHub ? `0 0 0 4px ${sourceStyle.tint}, 0 14px 38px rgba(0, 0, 0, 0.24)` : '0 14px 38px rgba(0, 0, 0, 0.24)' }}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-2 !border-[#101a2c] !bg-cyan-300" />
      <div className="mb-2 flex items-start justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">{label}</span><span className="rounded-full px-2 py-1 text-[9px] font-bold tracking-[0.12em]" style={{ color: sourceStyle.accent, backgroundColor: sourceStyle.tint }}>{members ? `${members.length} grouped` : sourceStyle.label}</span></div>
      <p className="break-words text-sm font-bold leading-snug text-slate-100">{members ? `${label} cluster` : displayTitle}</p>
      {rawSourceId && <button type="button" title="Copy source ID" onClick={(event) => { event.stopPropagation(); void navigator.clipboard?.writeText(String(rawSourceId)); }} className="nodrag mt-1 flex max-w-full items-start gap-1.5 text-left font-mono text-[10px] leading-4 text-slate-400 hover:text-slate-200"><span className="break-all">{rawSourceId}</span><Copy size={11} className="mt-0.5 shrink-0" /></button>}
      {members && <button type="button" onClick={data.toggleCluster} className="mt-3 flex items-center gap-1 text-[10px] font-bold text-cyan-200 hover:text-white"><Expand size={12} /> Expand group</button>}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-2 !border-[#101a2c] !bg-cyan-300" />
    </div>
  );
}

function RelationshipEdge({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, markerEnd, label, data }: EdgeProps<ExplorerEdge>) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const autoLinked = data?.establishedByApp === true;
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: autoLinked ? '#0EA5E9' : '#475569', strokeWidth: 2, strokeDasharray: autoLinked ? '7 5' : undefined }} />
    {autoLinked && <circle r="3.5" fill="#67E8F9" filter="drop-shadow(0 0 4px #0EA5E9)"><animateMotion dur="2.4s" path={path} repeatCount="indefinite" /></circle>}
    <EdgeLabelRenderer><div className={`nodrag nopan pointer-events-none absolute z-10 rounded-full border px-2 py-1 font-mono text-[10px] font-semibold shadow-lg backdrop-blur-sm ${autoLinked ? 'border-sky-300/50 bg-sky-950/90 text-sky-100' : 'border-cyan-100/20 bg-[#0b1220]/80 text-cyan-50'}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{label}</div></EdgeLabelRenderer>
  </>;
}

const nodeTypes = { ontology: OntologyNode };
const edgeTypes = { relationship: RelationshipEdge };
const nodeWidth = 220;
const nodeHeight = 120;
const fitViewOptions = { padding: 0.2, duration: 300 };

const layoutNodes = (nodes: Node<ExplorerNodeData>[], edges: Edge[], layout: LayoutMode): Node<ExplorerNodeData>[] => {
  if (layout === 'force') {
    const degrees = new Map<string, number>();
    edges.forEach((edge) => {
      degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
    });
    const hub = nodes.reduce<Node<ExplorerNodeData> | undefined>((current, node) =>
      (degrees.get(node.id) ?? 0) > (degrees.get(current?.id ?? '') ?? 0) ? node : current, undefined);
    const spokes = hub ? nodes.filter((node) => node.id !== hub.id) : nodes;
    const radius = Math.max(340, Math.sqrt(Math.max(1, spokes.length)) * 105);
    return nodes.map((node) => {
      if (hub && node.id === hub.id) return { ...node, data: { ...node.data, isHub: true }, position: { x: -nodeWidth / 2, y: -nodeHeight / 2 } };
      const index = spokes.findIndex((spoke) => spoke.id === node.id);
      const angle = (index / Math.max(1, spokes.length)) * Math.PI * 2;
      return { ...node, position: { x: Math.cos(angle) * radius - nodeWidth / 2, y: Math.sin(angle) * radius - nodeHeight / 2 } };
    });
  }
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120 });
  nodes.forEach((node) => graph.setNode(node.id, { width: nodeWidth, height: nodeHeight }));
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);
  return nodes.map((node) => { const position = graph.node(node.id); return { ...node, position: { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 } }; });
};

export function GraphExplorer({ nodes, edges, onNodeClick, timeline, highlightedNodeIds = [], onNodeContextMenu, onCreateEntity, onAddRelationship, onDeleteNodes, onCreateRelationship }: GraphExplorerProps) {
  const canvasRef = useRef<HTMLElement>(null);
  const [contextMenu, setContextMenu] = useState<{ node?: GraphNode; x: number; y: number } | null>(null);
  const [layout, setLayout] = useState<LayoutMode>('force');
  const [search, setSearch] = useState('');
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [relationshipDraft, setRelationshipDraft] = useState<{ sourceId: string; targetId: string; relationship: string } | null>(null);
  const [isSavingRelationship, setIsSavingRelationship] = useState(false);
  const [actionError, setActionError] = useState('');
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance<Node<ExplorerNodeData>, Edge> | null>(null);
  const connectedCounts = useMemo(() => { const counts = new Map<string, number>(); edges.forEach((edge) => { counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1); counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1); }); return counts; }, [edges]);

  const flowModel = useMemo(() => {
    const grouped = new Map<string, GraphNode[]>();
    const nodesByType = new Map<string, GraphNode[]>();
    nodes.forEach((node) => nodesByType.set(node.type.id, [...(nodesByType.get(node.type.id) ?? []), node]));
    nodes.forEach((node) => {
      if ((connectedCounts.get(node.id) ?? 0) > 5 || (nodesByType.get(node.type.id)?.length ?? 0) >= 12) {
        grouped.set(node.type.id, nodesByType.get(node.type.id) ?? []);
      }
    });
    const clusterByNode = new Map<string, string>();
    const clusters = [...grouped.entries()].filter(([, members]) => members.length > 1);
    clusters.forEach(([typeId, members]) => members.forEach((member) => clusterByNode.set(member.id, `cluster-${typeId}`)));
    const visibleNodes: Node<ExplorerNodeData>[] = [];
    const matchesSearch = (node: GraphNode) => `${node.id} ${node.type.label} ${Object.values(node.properties).join(' ')}`.toLowerCase().includes(search.toLowerCase());
    nodes.forEach((graphNode) => { const clusterId = clusterByNode.get(graphNode.id); if (clusterId && !expandedClusters.has(clusterId)) return; visibleNodes.push({ id: graphNode.id, type: 'ontology', position: { x: 0, y: 0 }, data: { graphNode, highlighted: highlightedNodeIds.includes(graphNode.id), dimmed: Boolean(search) && !matchesSearch(graphNode) } }); });
    clusters.forEach(([typeId, members]) => { const clusterId = `cluster-${typeId}`; if (expandedClusters.has(clusterId)) return; visibleNodes.push({ id: clusterId, type: 'ontology', position: { x: 0, y: 0 }, data: { clusterMembers: members, highlighted: members.some((member) => highlightedNodeIds.includes(member.id)), dimmed: Boolean(search) && !members.some(matchesSearch), toggleCluster: () => setExpandedClusters((current) => new Set(current).add(clusterId)) } }); });
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    const visibleEdges: ExplorerEdge[] = edges.flatMap((edge) => { const sourceCluster = clusterByNode.get(edge.source); const targetCluster = clusterByNode.get(edge.target); const source = sourceCluster && !expandedClusters.has(sourceCluster) ? sourceCluster : edge.source; const target = targetCluster && !expandedClusters.has(targetCluster) ? targetCluster : edge.target; if (source === target || !visibleIds.has(source) || !visibleIds.has(target)) return []; const establishedByApp = edge.properties.establishedByApp === true; return [{ id: edge.id, source, target, type: 'relationship', label: edge.relationship, data: { establishedByApp }, markerEnd: { type: MarkerType.ArrowClosed, color: establishedByApp ? '#0EA5E9' : '#475569' } }]; });
    return { nodes: layoutNodes(visibleNodes, visibleEdges, layout).map((node) => ({ ...node, selected: Boolean(node.data.graphNode && selectedNodeIds.includes(node.id)) })), edges: visibleEdges };
  }, [connectedCounts, edges, expandedClusters, highlightedNodeIds, layout, nodes, search, selectedNodeIds]);

  useEffect(() => {
    if (!reactFlow || flowModel.nodes.length === 0) return;
    const fitGraph = () => {
      requestAnimationFrame(() => void reactFlow.fitView(fitViewOptions));
    };
    const frame = requestAnimationFrame(fitGraph);
    const observer = new ResizeObserver(fitGraph);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [flowModel, reactFlow]);

  const openContextMenu = (event: { clientX: number; clientY: number }, node?: GraphNode) => {
    setContextMenu({ node, x: event.clientX, y: event.clientY });
  };

  const deleteSelectedNodes = async () => {
    if (selectedNodeIds.length === 0) return;
    const confirmed = window.confirm(`Delete ${selectedNodeIds.length} selected ${selectedNodeIds.length === 1 ? 'entity' : 'entities'}? Connected relationships will also be removed.`);
    if (!confirmed) return;
    setActionError('');
    try {
      await onDeleteNodes(selectedNodeIds);
      setSelectedNodeIds([]);
      setSelectionMode(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to delete selected entities.');
    }
  };

  const openRelationshipDialog = () => {
    if (selectedNodeIds.length !== 2) return;
    setRelationshipDraft({ sourceId: selectedNodeIds[0], targetId: selectedNodeIds[1], relationship: 'RELATED_TO' });
    setActionError('');
  };

  const saveRelationship = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!relationshipDraft || !relationshipDraft.relationship.trim() || relationshipDraft.sourceId === relationshipDraft.targetId) return;
    setIsSavingRelationship(true);
    setActionError('');
    try {
      await onCreateRelationship(relationshipDraft.sourceId, relationshipDraft.targetId, relationshipDraft.relationship.trim());
      setRelationshipDraft(null);
      setSelectedNodeIds([]);
      setSelectionMode(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to create this relationship.');
    } finally {
      setIsSavingRelationship(false);
    }
  };

  return <section ref={canvasRef} className={`${isFullscreen ? 'fixed inset-4 z-50 h-[calc(100vh-2rem)] w-[calc(100vw-2rem)]' : 'relative h-full min-h-[680px] min-w-0 flex-1'} overflow-hidden rounded-[1.75rem] border border-slate-300 bg-slate-50 shadow-2xl shadow-black/20`}>
    {isFullscreen && <div className="fixed inset-0 -z-10 bg-[#030711]/90 backdrop-blur-sm" />}
    <div className="absolute left-3 right-3 top-3 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[#101a2c]/95 p-2 shadow-xl shadow-black/20 backdrop-blur-md"><div className="flex items-center gap-2 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300"><Waypoints size={14} /> Explorer</div><button type="button" onClick={() => setLayout('force')} className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs ${layout === 'force' ? 'bg-cyan-300 text-[#06111d]' : 'text-slate-400 hover:bg-white/10'}`}><GitBranch size={13} /> Force</button><button type="button" onClick={() => setLayout('hierarchical')} className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs ${layout === 'hierarchical' ? 'bg-cyan-300 text-[#06111d]' : 'text-slate-400 hover:bg-white/10'}`}><GitBranch size={13} /> Dagre</button><div className="relative min-w-[180px] flex-1 md:max-w-xs"><Search size={13} className="absolute left-3 top-2.5 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter nodes" className="w-full rounded-lg border border-white/10 bg-[#0a1221] py-2 pl-8 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-300/60" /></div><div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#0a1221]/70 p-1"><button type="button" onClick={() => void reactFlow?.zoomIn({ duration: 250 })} aria-label="Zoom In" title="Zoom In" className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white"><ZoomIn size={13} /><span className="hidden lg:inline">Zoom In</span></button><button type="button" onClick={() => void reactFlow?.zoomOut({ duration: 250 })} aria-label="Zoom Out" title="Zoom Out" className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white"><ZoomOut size={13} /><span className="hidden lg:inline">Zoom Out</span></button><button type="button" onClick={() => reactFlow?.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 })} aria-label="Reset View" title="Reset View" className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white"><LocateFixed size={13} /><span className="hidden lg:inline">Reset View</span></button><button type="button" onClick={() => void reactFlow?.fitView(fitViewOptions)} aria-label="Center" title="Center" className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white"><LocateFixed size={13} /><span className="hidden lg:inline">Center</span></button></div><button type="button" onClick={() => setIsFullscreen((current) => !current)} aria-label={isFullscreen ? 'Exit fullscreen graph' : 'Open fullscreen graph'} title={isFullscreen ? 'Exit fullscreen graph' : 'Open fullscreen graph'} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white">{isFullscreen ? <Minimize2 size={15} /> : <Fullscreen size={15} />}</button><span className="ml-auto rounded-full border border-[#b8c9df] bg-[#eaf2ff] px-3 py-2 text-xs font-semibold text-[#17345f]">{nodes.length} entities · {edges.length} relationships</span></div>
  {nodes.length === 0 ? <div className="flex h-full min-h-[680px] items-center justify-center text-sm text-slate-500">No graph records found in Neo4j.</div> : <ReactFlow nodes={flowModel.nodes} edges={flowModel.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultEdgeOptions={{ style: { stroke: '#475569', strokeWidth: 2 }, animated: true }} fitView fitViewOptions={fitViewOptions} onInit={setReactFlow} nodesDraggable nodesConnectable panOnDrag zoomOnScroll elementsSelectable={selectionMode} selectionOnDrag={selectionMode} multiSelectionKeyCode="Shift" onConnect={(connection: Connection) => { if (connection.source && connection.target && connection.source !== connection.target) setRelationshipDraft({ sourceId: connection.source, targetId: connection.target, relationship: 'RELATED_TO' }); }} onSelectionChange={({ nodes: selectedNodes }) => { const ids = selectedNodes.flatMap((node) => node.data.graphNode ? [node.id] : []); setSelectedNodeIds((current) => current.length === ids.length && current.every((id) => ids.includes(id)) ? current : ids); }} onNodeClick={(_, node) => { if (!selectionMode && node.data.graphNode) onNodeClick(node.data.graphNode); }} onNodeContextMenu={(event, node) => { event.preventDefault(); openContextMenu(event, node.data.graphNode); }} onPaneContextMenu={(event) => { event.preventDefault(); openContextMenu(event); }} onPaneClick={() => setContextMenu(null)} proOptions={{ hideAttribution: true }} className="bg-transparent"><Background color="#cbd5e1" variant={BackgroundVariant.Dots} gap={20} size={1} /><Controls className="!bottom-4 !left-4 !z-30 !m-0 !overflow-hidden !rounded-xl !border-slate-300 !bg-white !fill-slate-700" /><MiniMap pannable zoomable nodeColor="#3b82f6" maskColor="rgba(241, 245, 249, 0.7)" className="!bottom-4 !right-4 !m-0 !rounded-lg !border !border-slate-300" /></ReactFlow>}
    {contextMenu && <div className="fixed z-40 min-w-44 overflow-hidden rounded-xl border border-white/10 bg-[#101a2c] p-1 shadow-2xl shadow-black/40" style={{ left: contextMenu.x, top: contextMenu.y }} onMouseDown={(event) => event.stopPropagation()}>
      {contextMenu.node && <button type="button" onClick={() => { onNodeContextMenu?.(contextMenu.node!); setContextMenu(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-cyan-100 hover:bg-cyan-300/10"><LocateFixed size={13} /> Inspect node</button>}
      <button type="button" onClick={() => { onCreateEntity?.(); setContextMenu(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-200 hover:bg-white/10"><Plus size={13} /> Create entity</button>
      <button type="button" onClick={() => { onAddRelationship?.(); setContextMenu(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-200 hover:bg-white/10"><GitBranch size={13} /> Add relationship</button>
      <button type="button" onClick={() => { void reactFlow?.fitView(fitViewOptions); setContextMenu(null); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-200 hover:bg-white/10"><LocateFixed size={13} /> Center view</button>
    </div>}
    {actionError && <div role="alert" className="absolute left-3 top-16 z-30 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700 shadow-lg">{actionError}</div>}
    <div className="absolute right-3 top-16 z-20 flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-md">
      <button type="button" onClick={() => { setSelectionMode((current) => !current); setSelectedNodeIds([]); }} aria-pressed={selectionMode} title="Select multiple entities" className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold ${selectionMode ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}><MousePointer2 size={14} /> {selectionMode ? 'Selecting' : 'Select'}</button>
      {selectionMode && <>
        <span className="px-1 text-xs text-slate-500">{selectedNodeIds.length} selected</span>
        <button type="button" disabled={selectedNodeIds.length !== 2} onClick={openRelationshipDialog} title="Create a relationship between two selected entities" className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-2.5 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Link2 size={14} /> Relate</button>
        <button type="button" disabled={selectedNodeIds.length === 0} onClick={() => void deleteSelectedNodes()} title="Delete selected entities" className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={14} /> Delete</button>
      </>}
    </div>
    {relationshipDraft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={() => !isSavingRelationship && setRelationshipDraft(null)}><form onSubmit={saveRelationship} className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><h2 className="text-base font-bold text-slate-900">Create relationship</h2><button type="button" onClick={() => setRelationshipDraft(null)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Close relationship form">×</button></div><label className="mt-4 block text-xs font-semibold text-slate-700">Source entity<select value={relationshipDraft.sourceId} onChange={(event) => setRelationshipDraft((draft) => draft ? { ...draft, sourceId: event.target.value } : draft)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900">{nodes.map((node) => <option key={node.id} value={node.id}>{String(node.properties.name ?? node.id)} · {node.type.label}</option>)}</select></label><label className="mt-3 block text-xs font-semibold text-slate-700">Target entity<select value={relationshipDraft.targetId} onChange={(event) => setRelationshipDraft((draft) => draft ? { ...draft, targetId: event.target.value } : draft)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900">{nodes.map((node) => <option key={node.id} value={node.id} disabled={node.id === relationshipDraft.sourceId}>{String(node.properties.name ?? node.id)} · {node.type.label}</option>)}</select></label><label className="mt-3 block text-xs font-semibold text-slate-700">Relationship name<input required value={relationshipDraft.relationship} onChange={(event) => setRelationshipDraft((draft) => draft ? { ...draft, relationship: event.target.value } : draft)} placeholder="e.g. PURCHASED" className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500" /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setRelationshipDraft(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Cancel</button><button type="submit" disabled={isSavingRelationship || !relationshipDraft.relationship.trim()} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Link2 size={13} /> {isSavingRelationship ? 'Creating...' : 'Create relationship'}</button></div></form></div>}
    {timeline}
  </section>;
}
