import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import dagre from 'dagre';
import {
  Background,
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
  type Node,
  type NodeProps,
  type ReactFlowInstance
} from '@xyflow/react';
import { Expand, Fullscreen, GitBranch, LocateFixed, Minimize2, Search, Waypoints, ZoomIn, ZoomOut } from 'lucide-react';
import '@xyflow/react/dist/style.css';

import type { GraphEdge, GraphNode } from '@ontofabric/shared/types.js';

type LayoutMode = 'force' | 'hierarchical';
type ExplorerNodeData = {
  graphNode?: GraphNode;
  clusterMembers?: GraphNode[];
  highlighted: boolean;
  dimmed: boolean;
  toggleCluster?: () => void;
};

type GraphExplorerProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick: (node: GraphNode) => void;
  timeline?: ReactNode;
  highlightedNodeIds?: string[];
  onNodeContextMenu?: (node: GraphNode) => void;
};

const sourceStyles: Record<GraphNode['sourceSystem'], { accent: string; tint: string; label: string }> = {
  ERP: { accent: '#65d39b', tint: 'rgba(101, 211, 155, 0.16)', label: 'ERP' },
  CRM: { accent: '#68a8ff', tint: 'rgba(104, 168, 255, 0.16)', label: 'CRM' },
  EXCEL: { accent: '#f4bd62', tint: 'rgba(244, 189, 98, 0.16)', label: 'EXCEL' },
  PDF: { accent: '#f38ba8', tint: 'rgba(243, 139, 168, 0.16)', label: 'PDF' },
  SME_INPUT: { accent: '#d69cff', tint: 'rgba(214, 156, 255, 0.16)', label: 'SME INPUT' },
  SOP: { accent: '#8bd5ca', tint: 'rgba(139, 213, 202, 0.16)', label: 'S&OP' }
};

const domainStyles: Record<GraphNode['domain'], { accent: string; tint: string; label: string }> = {
  HEALTHCARE: { accent: '#10B981', tint: 'rgba(16, 185, 129, 0.16)', label: 'Healthcare' },
  FINANCE: { accent: '#3B82F6', tint: 'rgba(59, 130, 246, 0.16)', label: 'Finance' },
  SUPPLY_CHAIN: { accent: '#F59E0B', tint: 'rgba(245, 158, 11, 0.16)', label: 'Supply Chain' },
  HR_ORG: { accent: '#8B5CF6', tint: 'rgba(139, 92, 246, 0.16)', label: 'HR' },
  CUSTOM: { accent: '#94A3B8', tint: 'rgba(148, 163, 184, 0.16)', label: 'Custom' }
};

function OntologyNode({ data }: NodeProps<Node<ExplorerNodeData>>) {
  const graphNode = data.graphNode;
  const members = data.clusterMembers;
  const sourceStyle = sourceStyles[graphNode?.sourceSystem ?? members?.[0]?.sourceSystem ?? 'SME_INPUT'];
  const domainStyle = domainStyles[graphNode?.domain ?? members?.[0]?.domain ?? 'CUSTOM'];
  const label = graphNode?.type.label ?? members?.[0]?.type.label ?? 'Group';

  return (
    <div className="min-w-[190px] max-w-[235px] rounded-2xl border bg-[#101a2c]/95 px-4 py-3 shadow-2xl shadow-black/30 transition-transform duration-200 hover:-translate-y-1" style={{ borderColor: data.highlighted ? '#f5f06a' : `${domainStyle.accent}cc`, opacity: data.dimmed ? 0.25 : 1, boxShadow: data.highlighted ? '0 0 0 3px rgba(245, 240, 106, 0.24), 0 14px 38px rgba(0, 0, 0, 0.24)' : `0 14px 38px rgba(0, 0, 0, 0.24), 0 0 0 1px ${domainStyle.accent}30` }}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-2 !border-[#101a2c]" style={{ background: domainStyle.accent }} />
      <div className="mb-3 flex items-start justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: domainStyle.accent }}>{label}</span><span className="rounded-full px-2 py-1 text-[9px] font-bold tracking-[0.12em]" style={{ color: sourceStyle.accent, backgroundColor: sourceStyle.tint }}>{members ? `${members.length} grouped` : sourceStyle.label}</span></div>
      <p className="truncate text-sm font-semibold text-slate-100">{graphNode ? String(graphNode.properties.name ?? graphNode.id) : `${label} cluster`}</p>
      <p className="mt-1 truncate font-mono text-[10px] text-slate-500">{graphNode?.id ?? members?.map((member) => member.id).join(', ')}</p>
      {members && <button type="button" onClick={data.toggleCluster} className="mt-3 flex items-center gap-1 text-[10px] font-bold text-cyan-200 hover:text-white"><Expand size={12} /> Expand group</button>}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-2 !border-[#101a2c]" style={{ background: domainStyle.accent }} />
    </div>
  );
}

function RelationshipEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, label }: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return <><BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: '#71829e', strokeWidth: 1.6 }} /><EdgeLabelRenderer><div className="nodrag nopan pointer-events-none absolute z-10 rounded-full border border-cyan-100/20 bg-[#0b1220]/80 px-2 py-1 font-mono text-[10px] font-semibold text-cyan-50 shadow-lg backdrop-blur-sm" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{label}</div></EdgeLabelRenderer></>;
}

const nodeTypes = { ontology: OntologyNode };
const edgeTypes = { relationship: RelationshipEdge };
const nodeWidth = 220;
const nodeHeight = 120;
const fitViewOptions = { padding: 0.3, duration: 300 };

const layoutNodes = (nodes: Node<ExplorerNodeData>[], edges: Edge[], layout: LayoutMode): Node<ExplorerNodeData>[] => {
  if (layout === 'force') {
    const radius = Math.max(360, Math.sqrt(Math.max(1, nodes.length)) * 190);
    return nodes.map((node, index) => {
      const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
      return { ...node, position: { x: Math.cos(angle) * radius + 420, y: Math.sin(angle) * radius + 300 } };
    });
  }
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'LR', nodesep: 115, ranksep: 210, marginx: 80, marginy: 80 });
  nodes.forEach((node) => graph.setNode(node.id, { width: nodeWidth, height: nodeHeight }));
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);
  return nodes.map((node) => { const position = graph.node(node.id); return { ...node, position: { x: position.x - nodeWidth / 2, y: position.y - nodeHeight / 2 } }; });
};

export function GraphExplorer({ nodes, edges, onNodeClick, timeline, highlightedNodeIds = [], onNodeContextMenu }: GraphExplorerProps) {
  const canvasRef = useRef<HTMLElement>(null);
  const [contextMenu, setContextMenu] = useState<{ node: GraphNode; x: number; y: number } | null>(null);
  const [layout, setLayout] = useState<LayoutMode>('force');
  const [search, setSearch] = useState('');
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reactFlow, setReactFlow] = useState<ReactFlowInstance<Node<ExplorerNodeData>, Edge> | null>(null);
  const connectedCounts = useMemo(() => { const counts = new Map<string, number>(); edges.forEach((edge) => { counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1); counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1); }); return counts; }, [edges]);

  const flowModel = useMemo(() => {
    const grouped = new Map<string, GraphNode[]>();
    nodes.forEach((node) => { if ((connectedCounts.get(node.id) ?? 0) > 5) grouped.set(node.type.id, [...(grouped.get(node.type.id) ?? []), node]); });
    const clusterByNode = new Map<string, string>();
    const clusters = [...grouped.entries()].filter(([, members]) => members.length > 1);
    clusters.forEach(([typeId, members]) => members.forEach((member) => clusterByNode.set(member.id, `cluster-${typeId}`)));
    const visibleNodes: Node<ExplorerNodeData>[] = [];
    const matchesSearch = (node: GraphNode) => `${node.id} ${node.type.label} ${Object.values(node.properties).join(' ')}`.toLowerCase().includes(search.toLowerCase());
    nodes.forEach((graphNode) => { const clusterId = clusterByNode.get(graphNode.id); if (clusterId && !expandedClusters.has(clusterId)) return; visibleNodes.push({ id: graphNode.id, type: 'ontology', position: { x: 0, y: 0 }, data: { graphNode, highlighted: highlightedNodeIds.includes(graphNode.id), dimmed: Boolean(search) && !matchesSearch(graphNode) } }); });
    clusters.forEach(([typeId, members]) => { const clusterId = `cluster-${typeId}`; if (expandedClusters.has(clusterId)) return; visibleNodes.push({ id: clusterId, type: 'ontology', position: { x: 0, y: 0 }, data: { clusterMembers: members, highlighted: members.some((member) => highlightedNodeIds.includes(member.id)), dimmed: Boolean(search) && !members.some(matchesSearch), toggleCluster: () => setExpandedClusters((current) => new Set(current).add(clusterId)) } }); });
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    const visibleEdges: Edge[] = edges.flatMap((edge) => { const sourceCluster = clusterByNode.get(edge.source); const targetCluster = clusterByNode.get(edge.target); const source = sourceCluster && !expandedClusters.has(sourceCluster) ? sourceCluster : edge.source; const target = targetCluster && !expandedClusters.has(targetCluster) ? targetCluster : edge.target; if (source === target || !visibleIds.has(source) || !visibleIds.has(target)) return []; return [{ id: edge.id, source, target, type: 'relationship', label: edge.relationship, markerEnd: { type: MarkerType.ArrowClosed, color: '#9aaac1' } }]; });
    return { nodes: layoutNodes(visibleNodes, visibleEdges, layout), edges: visibleEdges };
  }, [connectedCounts, edges, expandedClusters, highlightedNodeIds, layout, nodes, search]);

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

  return <section ref={canvasRef} className={`${isFullscreen ? 'fixed inset-4 z-50 h-[calc(100vh-2rem)] w-[calc(100vw-2rem)]' : 'relative h-full min-h-[680px] min-w-0 flex-1'} overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0a1221] shadow-2xl shadow-black/20`}>
    {isFullscreen && <div className="fixed inset-0 -z-10 bg-[#030711]/90 backdrop-blur-sm" />}
    <div className="absolute left-3 right-3 top-3 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[#101a2c]/95 p-2 shadow-xl shadow-black/20 backdrop-blur-md"><div className="flex items-center gap-2 px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300"><Waypoints size={14} /> Explorer</div><button type="button" onClick={() => setLayout('force')} className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs ${layout === 'force' ? 'bg-cyan-300 text-[#06111d]' : 'text-slate-400 hover:bg-white/10'}`}><GitBranch size={13} /> Force</button><button type="button" onClick={() => setLayout('hierarchical')} className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs ${layout === 'hierarchical' ? 'bg-cyan-300 text-[#06111d]' : 'text-slate-400 hover:bg-white/10'}`}><GitBranch size={13} /> Dagre</button><div className="relative min-w-[180px] flex-1 md:max-w-xs"><Search size={13} className="absolute left-3 top-2.5 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter nodes" className="w-full rounded-lg border border-white/10 bg-[#0a1221] py-2 pl-8 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-300/60" /></div><div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#0a1221]/70 p-1"><button type="button" onClick={() => void reactFlow?.zoomIn({ duration: 250 })} aria-label="Zoom In" title="Zoom In" className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white"><ZoomIn size={13} /><span className="hidden lg:inline">Zoom In</span></button><button type="button" onClick={() => void reactFlow?.zoomOut({ duration: 250 })} aria-label="Zoom Out" title="Zoom Out" className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white"><ZoomOut size={13} /><span className="hidden lg:inline">Zoom Out</span></button><button type="button" onClick={() => reactFlow?.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 })} aria-label="Reset View" title="Reset View" className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white"><LocateFixed size={13} /><span className="hidden lg:inline">Reset View</span></button><button type="button" onClick={() => void reactFlow?.fitView(fitViewOptions)} aria-label="Center" title="Center" className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white"><LocateFixed size={13} /><span className="hidden lg:inline">Center</span></button></div><button type="button" onClick={() => setIsFullscreen((current) => !current)} aria-label={isFullscreen ? 'Exit fullscreen graph' : 'Open fullscreen graph'} title={isFullscreen ? 'Exit fullscreen graph' : 'Open fullscreen graph'} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white">{isFullscreen ? <Minimize2 size={15} /> : <Fullscreen size={15} />}</button></div>
  <div className="pointer-events-none absolute bottom-5 left-6 z-10"><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">Knowledge graph</p><p className="mt-1 text-xs text-slate-500">{nodes.length} entities · {edges.length} relationships</p></div>
  <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 flex max-w-[calc(100%-12rem)] -translate-x-1/2 flex-wrap justify-center gap-1.5 rounded-xl border border-white/10 bg-[#101a2c]/90 p-2 shadow-xl backdrop-blur-md">{(['HEALTHCARE', 'FINANCE', 'SUPPLY_CHAIN', 'HR_ORG'] as const).map((domain) => <span key={domain} className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-semibold text-slate-200" style={{ backgroundColor: domainStyles[domain].tint }}><span className="h-2 w-2 rounded-full" style={{ backgroundColor: domainStyles[domain].accent }} />{domainStyles[domain].label}</span>)}</div>
  {nodes.length === 0 ? <div className="flex h-full min-h-[680px] items-center justify-center text-sm text-slate-500">No graph records found in Neo4j.</div> : <ReactFlow nodes={flowModel.nodes} edges={flowModel.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView fitViewOptions={fitViewOptions} onInit={setReactFlow} nodesDraggable nodesConnectable={false} panOnDrag zoomOnScroll onNodeClick={(_, node) => node.data.graphNode && onNodeClick(node.data.graphNode)} onNodeContextMenu={(event, node) => { event.preventDefault(); if (node.data.graphNode) setContextMenu({ node: node.data.graphNode, x: event.clientX, y: event.clientY }); }} onPaneClick={() => setContextMenu(null)} proOptions={{ hideAttribution: true }} className="bg-[radial-gradient(circle_at_50%_45%,rgba(21,54,82,0.26),transparent_48%)]"><Background color="#24354b" gap={28} size={1} /><Controls className="!bottom-5 !left-5 !z-30 !m-0 !overflow-hidden !rounded-xl !border-white/10 !bg-[#101a2c] !fill-slate-300" /><MiniMap pannable zoomable nodeColor={(node) => domainStyles[(node.data as ExplorerNodeData | undefined)?.graphNode?.domain ?? 'CUSTOM'].accent} maskColor="rgba(4, 9, 18, 0.75)" className="!bottom-5 !right-5 !m-0 !rounded-xl !border-white/10 !bg-[#101a2c]" /></ReactFlow>}
    {contextMenu && <div className="fixed z-40" style={{ left: contextMenu.x, top: contextMenu.y }}><button type="button" onClick={() => { onNodeContextMenu?.(contextMenu.node); setContextMenu(null); }} className="rounded-xl border border-cyan-300/20 bg-[#101a2c] px-3 py-2 text-xs font-semibold text-cyan-100 shadow-2xl shadow-black/40 hover:bg-cyan-300/10">View Provenance &amp; Lineage</button></div>}
    {timeline}
  </section>;
}
