import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  ClipboardCheck,
  CornerDownLeft,
  Database,
  GitBranch,
  Layers,
  LayoutDashboard,
  Network,
  PencilRuler,
  PlusCircle,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Tag,
  X
} from 'lucide-react';
import type { GraphEdge, GraphNode } from '@ontofabric/shared/types.js';

export type WorkspaceView = 'explorer' | 'approvals' | 'cockpit' | 'designer' | 'data-sources';

export type SearchCategory = 'all' | 'nodes' | 'edges' | 'views' | 'actions';

export interface WorkspaceSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onSelectNode: (node: GraphNode) => void;
  onHighlightNodes: (nodeIds: string[]) => void;
  onNavigateView: (view: WorkspaceView) => void;
  onOpenAssistant: () => void;
  onOpenSourceSync: () => void;
  onOpenAiSettings: () => void;
  onRefreshGraph: () => void;
  onCreateEntity: () => void;
  onCreateRelationship: () => void;
}

interface ResultItem {
  id: string;
  category: 'nodes' | 'edges' | 'views' | 'actions';
  title: string;
  subtitle: string;
  badge?: string;
  badgeType?: 'entity' | 'relation' | 'view' | 'action';
  sourceSystem?: string;
  matchedProperty?: string;
  onSelect: () => void;
}

const getEntityBadgeStyle = (label: string): string => {
  const normalized = label.toLowerCase();
  if (normalized.includes('product')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (normalized.includes('customer')) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (normalized.includes('component')) return 'bg-sky-50 text-sky-700 border-sky-200';
  if (normalized.includes('facility') || normalized.includes('workcenter')) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (normalized.includes('supplier')) return 'bg-purple-50 text-purple-700 border-purple-200';
  if (normalized.includes('order') || normalized.includes('demand')) return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-blue-50 text-blue-700 border-blue-200';
};

export function WorkspaceSearchModal({
  isOpen,
  onClose,
  nodes,
  edges,
  onSelectNode,
  onHighlightNodes,
  onNavigateView,
  onOpenAssistant,
  onOpenSourceSync,
  onOpenAiSettings,
  onRefreshGraph,
  onCreateEntity,
  onCreateRelationship
}: WorkspaceSearchModalProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveCategory('all');
      setSelectedIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Distinct entity types in current workspace
  const entityTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    nodes.forEach((node) => {
      const label = node.type.label;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [nodes]);

  // Static Views List
  const viewsList = useMemo(() => [
    {
      id: 'view-explorer',
      title: 'Ontology Explorer',
      description: 'Interactive topological graph view with Force & Dagre clustering',
      view: 'explorer' as WorkspaceView,
      icon: Network
    },
    {
      id: 'view-designer',
      title: 'Schema Designer',
      description: 'Define entity schemas, properties, relations, and strict validation rules',
      view: 'designer' as WorkspaceView,
      icon: PencilRuler
    },
    {
      id: 'view-approvals',
      title: 'Approvals & SME Match Queue',
      description: 'Human-in-the-loop deduplication and resolution triage',
      view: 'approvals' as WorkspaceView,
      icon: ClipboardCheck
    },
    {
      id: 'view-cockpit',
      title: 'Business Cockpit',
      description: 'Executive KPI analytics, domain coverage, and graph health indicators',
      view: 'cockpit' as WorkspaceView,
      icon: LayoutDashboard
    },
    {
      id: 'view-data-sources',
      title: 'Data Sources Admin',
      description: 'PostgreSQL, Snowflake, Databricks, and file connectors configuration',
      view: 'data-sources' as WorkspaceView,
      icon: Database
    }
  ], []);

  // Static Actions List
  const actionsList = useMemo(() => [
    {
      id: 'action-assistant',
      title: 'Open AI Assistant (AIDA)',
      description: 'Chat with AI grounded directly on your enterprise ontology graph',
      icon: Sparkles,
      handler: onOpenAssistant
    },
    {
      id: 'action-create-entity',
      title: 'Create New Entity',
      description: 'Define and add a new entity node into the ontology graph',
      icon: PlusCircle,
      handler: () => {
        onNavigateView('explorer');
        onOpenSourceSync();
        onCreateEntity();
      }
    },
    {
      id: 'action-create-relationship',
      title: 'Create New Relationship',
      description: 'Link two entities together with an ontology relationship edge',
      icon: GitBranch,
      handler: () => {
        onNavigateView('explorer');
        onOpenSourceSync();
        onCreateRelationship();
      }
    },
    {
      id: 'action-source-sync',
      title: 'Open Source Sync & Ingestion',
      description: 'Connect databases, ingest CSV/Excel/PDF files, or trigger SME match runs',
      icon: ArrowLeftRight,
      handler: () => {
        onNavigateView('explorer');
        onOpenSourceSync();
      }
    },
    {
      id: 'action-ai-settings',
      title: 'Workspace & AI Provider Settings',
      description: 'Configure OpenAI, Gemini, or DeepSeek API credentials and models',
      icon: Settings2,
      handler: onOpenAiSettings
    },
    {
      id: 'action-refresh',
      title: 'Refresh Graph Data',
      description: 'Fetch the latest entities and relationships snapshot from Neo4j',
      icon: RefreshCw,
      handler: onRefreshGraph
    }
  ], [onCreateEntity, onCreateRelationship, onNavigateView, onOpenAiSettings, onOpenAssistant, onOpenSourceSync, onRefreshGraph]);

  // Compute matched items
  const results = useMemo<ResultItem[]>(() => {
    const q = query.trim().toLowerCase();
    const items: ResultItem[] = [];

    // Views
    if (activeCategory === 'all' || activeCategory === 'views') {
      viewsList.forEach((viewItem) => {
        if (!q || viewItem.title.toLowerCase().includes(q) || viewItem.description.toLowerCase().includes(q) || viewItem.view.includes(q)) {
          items.push({
            id: viewItem.id,
            category: 'views',
            title: viewItem.title,
            subtitle: viewItem.description,
            badge: 'Workspace View',
            badgeType: 'view',
            onSelect: () => {
              onNavigateView(viewItem.view);
              onClose();
            }
          });
        }
      });
    }

    // Actions
    if (activeCategory === 'all' || activeCategory === 'actions') {
      actionsList.forEach((actionItem) => {
        if (!q || actionItem.title.toLowerCase().includes(q) || actionItem.description.toLowerCase().includes(q)) {
          items.push({
            id: actionItem.id,
            category: 'actions',
            title: actionItem.title,
            subtitle: actionItem.description,
            badge: 'Command',
            badgeType: 'action',
            onSelect: () => {
              actionItem.handler();
              onClose();
            }
          });
        }
      });
    }

    // Nodes (Entities)
    if (activeCategory === 'all' || activeCategory === 'nodes') {
      // If no query and category is 'all', only show a small sample of recent/first nodes so view isn't flooded
      const maxNodes = !q && activeCategory === 'all' ? 8 : 100;
      let matchedCount = 0;

      for (const node of nodes) {
        if (matchedCount >= maxNodes) break;

        const nodeName = String(node.properties.name ?? node.properties.title ?? node.properties.label ?? node.id);
        const label = node.type.label;
        const id = node.id;
        const domain = node.domain;
        const sourceSystem = node.sourceSystem;

        let matchedProperty: string | undefined;
        let isMatch = !q;

        if (q) {
          if (id.toLowerCase().includes(q) || nodeName.toLowerCase().includes(q) || label.toLowerCase().includes(q) || domain.toLowerCase().includes(q) || sourceSystem.toLowerCase().includes(q)) {
            isMatch = true;
          } else {
            for (const [key, val] of Object.entries(node.properties)) {
              if (val !== null && val !== undefined && String(val).toLowerCase().includes(q)) {
                isMatch = true;
                matchedProperty = `${key}: "${String(val)}"`;
                break;
              }
            }
          }
        }

        if (isMatch) {
          matchedCount++;
          items.push({
            id: `node-${node.id}`,
            category: 'nodes',
            title: nodeName,
            subtitle: `ID: ${node.id} · Domain: ${domain}`,
            badge: label,
            badgeType: 'entity',
            sourceSystem,
            matchedProperty,
            onSelect: () => {
              onNavigateView('explorer');
              onSelectNode(node);
              onHighlightNodes([node.id]);
              onClose();
            }
          });
        }
      }
    }

    // Edges (Relationships)
    if (activeCategory === 'all' || activeCategory === 'edges') {
      const maxEdges = !q && activeCategory === 'all' ? 5 : 50;
      let matchedCount = 0;

      for (const edge of edges) {
        if (matchedCount >= maxEdges) break;

        const rel = edge.relationship;
        const source = edge.source;
        const target = edge.target;

        const isMatch = !q ||
          rel.toLowerCase().includes(q) ||
          source.toLowerCase().includes(q) ||
          target.toLowerCase().includes(q);

        if (isMatch) {
          matchedCount++;
          items.push({
            id: `edge-${edge.id}`,
            category: 'edges',
            title: `${source} → ${rel} → ${target}`,
            subtitle: `Relationship ID: ${edge.id}`,
            badge: rel,
            badgeType: 'relation',
            onSelect: () => {
              onNavigateView('explorer');
              onHighlightNodes([edge.source, edge.target]);
              const sourceNode = nodes.find((n) => n.id === edge.source);
              if (sourceNode) onSelectNode(sourceNode);
              onClose();
            }
          });
        }
      }
    }

    return items;
  }, [query, activeCategory, viewsList, actionsList, nodes, edges, onNavigateView, onClose, onSelectNode, onHighlightNodes]);

  // Keep selected index in bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeCategory]);

  // Scroll active item into view
  useEffect(() => {
    if (!resultsContainerRef.current) return;
    const selectedEl = resultsContainerRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        results[selectedIndex].onSelect();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  const countNodes = nodes.length;
  const countEdges = edges.length;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-[#051326]/60 p-3 pt-12 backdrop-blur-md sm:pt-20"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Workspace Search"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/30 transition-all"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5">
          <Search size={20} className="text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search entities, relations, views, or commands (e.g. 'Product', 'PROD-101', 'Explorer')..."
            className="flex-1 bg-transparent text-sm font-medium text-slate-800 placeholder-slate-400 outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Clear search query"
            >
              <X size={16} />
            </button>
          ) : (
            <kbd className="hidden rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 sm:inline-block">
              ESC
            </kbd>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close search"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filter Category Tabs */}
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs font-semibold sm:px-5">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={`rounded-lg px-2.5 py-1 transition ${
              activeCategory === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-800'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('nodes')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition ${
              activeCategory === 'nodes'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-800'
            }`}
          >
            <Layers size={13} />
            Entities
            <span className={`text-[10px] ${activeCategory === 'nodes' ? 'text-blue-100' : 'text-slate-400'}`}>
              ({countNodes})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('edges')}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition ${
              activeCategory === 'edges'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-800'
            }`}
          >
            <GitBranch size={13} />
            Relationships
            <span className={`text-[10px] ${activeCategory === 'edges' ? 'text-blue-100' : 'text-slate-400'}`}>
              ({countEdges})
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('views')}
            className={`rounded-lg px-2.5 py-1 transition ${
              activeCategory === 'views'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-800'
            }`}
          >
            Views
          </button>
          <button
            type="button"
            onClick={() => setActiveCategory('actions')}
            className={`rounded-lg px-2.5 py-1 transition ${
              activeCategory === 'actions'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-800'
            }`}
          >
            Commands
          </button>
        </div>

        {/* Quick Filter Entity Types Chips (When query is empty or in 'nodes' mode) */}
        {!query && entityTypeCounts.length > 0 && (
          <div className="border-b border-slate-100 bg-slate-50/40 px-4 py-2 sm:px-5">
            <div className="flex items-center gap-2 overflow-x-auto text-[11px] text-slate-500 no-scrollbar">
              <span className="flex items-center gap-1 font-semibold text-slate-400">
                <Tag size={12} /> Types:
              </span>
              {entityTypeCounts.slice(0, 8).map(([label, count]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setQuery(label);
                    setActiveCategory('nodes');
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  <span>{label}</span>
                  <span className="text-[9px] text-slate-400">({count})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search Results List */}
        <div ref={resultsContainerRef} className="flex-1 overflow-y-auto p-2 sm:p-3">
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Search size={22} />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-700">No matching workspace items</h3>
              <p className="mt-1 max-w-xs text-xs text-slate-400">
                We couldn&apos;t find any entities, relationships, or commands matching &ldquo;{query}&rdquo;.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {results.map((item, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <div
                    key={item.id}
                    data-index={index}
                    onClick={item.onSelect}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`group flex cursor-pointer items-center justify-between rounded-xl px-3.5 py-2.5 transition ${
                      isSelected
                        ? 'border border-blue-200 bg-blue-50/70 shadow-sm'
                        : 'border border-transparent hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {/* Icon */}
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${
                          item.category === 'views'
                            ? 'bg-blue-100 text-blue-700'
                            : item.category === 'actions'
                            ? 'bg-amber-100 text-amber-700'
                            : item.category === 'edges'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {item.category === 'views' && <Network size={16} />}
                        {item.category === 'actions' && <Sparkles size={16} />}
                        {item.category === 'edges' && <GitBranch size={16} />}
                        {item.category === 'nodes' && <Layers size={16} />}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-xs font-semibold text-slate-800">
                            {item.title}
                          </p>

                          {item.badge && (
                            <span
                              className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                                item.badgeType === 'entity'
                                  ? getEntityBadgeStyle(item.badge)
                                  : item.badgeType === 'relation'
                                  ? 'border-purple-200 bg-purple-50 text-purple-700'
                                  : item.badgeType === 'view'
                                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                                  : 'border-amber-200 bg-amber-50 text-amber-700'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}

                          {item.sourceSystem && (
                            <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.2 text-[9px] font-mono font-medium text-slate-600">
                              {item.sourceSystem}
                            </span>
                          )}
                        </div>

                        <p className="mt-0.5 truncate text-[11px] text-slate-500">
                          {item.subtitle}
                        </p>

                        {item.matchedProperty && (
                          <p className="mt-0.5 truncate font-mono text-[10px] text-blue-600">
                            Match: {item.matchedProperty}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Arrow / Jump indicator */}
                    <div
                      className={`ml-2 shrink-0 rounded-lg p-1.5 transition ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-300 group-hover:text-slate-500'
                      }`}
                    >
                      <ArrowRight size={14} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex flex-wrap items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-[11px] text-slate-500 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] shadow-2xs">
                ↑
              </kbd>
              <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] shadow-2xs">
                ↓
              </kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] shadow-2xs">
                <CornerDownLeft size={10} className="mr-0.5 inline" /> Enter
              </kbd>
              <span>Open</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] shadow-2xs">
                Esc
              </kbd>
              <span>Close</span>
            </span>
          </div>

          <span className="font-medium text-slate-400">
            {results.length} result{results.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>
  );
}
