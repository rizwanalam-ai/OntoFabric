import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addEdge, Background, Controls, MarkerType, ReactFlow, type Connection, type Edge, type Node, type NodeChange } from '@xyflow/react';
import { Bot, Boxes, Check, Database, GitBranch, Plus, Save, Trash2, WandSparkles } from 'lucide-react';
import axios from 'axios';
import { api } from '../api';

import type { DomainContext, EntityType, Primitive, RelationType } from '@ontofabric/shared/types.js';
import { EntityNodeComponent, type EntityNodeData } from './EntityNodeComponent';
import '@xyflow/react/dist/style.css';

type PropertyType = 'string' | 'number' | 'boolean' | 'date';
type DesignerNode = Node<EntityNodeData, 'entity'>;
type SchemaDesignerProps = { domain: DomainContext };

const nodeTypes = { entity: EntityNodeComponent };
const propertyTypes: PropertyType[] = ['string', 'number', 'boolean', 'date'];
const presetTemplates: Record<string, Array<[string, Array<[string, PropertyType]>]>> = {
  Product: [['Product', [['sku', 'string'], ['name', 'string'], ['price', 'number']]]],
  Supplier: [['Supplier', [['supplierId', 'string'], ['name', 'string']]]],
  Facility: [['Facility', [['facilityId', 'string'], ['name', 'string']]]],
  Customer: [['Customer', [['customerId', 'string'], ['name', 'string']]]],
  Order: [['Order', [['orderId', 'string'], ['total', 'number'], ['orderDate', 'date']]]]
};
const templateSets: Record<string, Array<[string, Array<[string, PropertyType]>]>> = {
  SCOR: [...presetTemplates.Product, ...presetTemplates.Supplier, ...presetTemplates.Facility],
  FIBO: [['FinancialAccount', [['accountId', 'string'], ['balance', 'number']]], ['Transaction', [['transactionId', 'string'], ['amount', 'number']]]],
  FHIR: [['Patient', [['patientId', 'string'], ['active', 'boolean']]], ['Encounter', [['encounterId', 'string'], ['encounterDate', 'date']]]]
};
const makeEntity = (label: string, fields: Array<[string, PropertyType]>): EntityType => ({ id: `ENTITY-${crypto.randomUUID()}`, label, attributes: Object.fromEntries(fields.map(([name, type]) => [name, type === 'number' ? 0 : type === 'boolean' ? false : ''])), attributeTypes: Object.fromEntries(fields), primaryKeys: fields.length ? [fields[0][0]] : [], requiredProperties: fields.length ? [fields[0][0]] : [] });

function Inspector({ entity, onChange, onDelete }: { entity: EntityType; onChange: (entity: EntityType) => void; onDelete: () => void }) {
  const properties = Object.entries(entity.attributes);
  const update = (patch: Partial<EntityType>) => onChange({ ...entity, ...patch });
  const addProperty = () => { const name = `property${properties.length + 1}`; update({ attributes: { ...entity.attributes, [name]: '' }, attributeTypes: { ...(entity.attributeTypes ?? {}), [name]: 'string' } }); };
  const updateProperty = (oldName: string, name: string, type: PropertyType, value: Primitive) => { const attributes = { ...entity.attributes }; const attributeTypes = { ...(entity.attributeTypes ?? {}) }; if (oldName !== name) { delete attributes[oldName]; delete attributeTypes[oldName]; } if (name) { attributes[name] = value; attributeTypes[name] = type; } update({ attributes, attributeTypes, primaryKeys: (entity.primaryKeys ?? []).map((key) => key === oldName ? name : key).filter(Boolean), requiredProperties: (entity.requiredProperties ?? []).map((key) => key === oldName ? name : key).filter(Boolean) }); };
  const toggleList = (key: 'primaryKeys' | 'requiredProperties', name: string) => { const values = new Set(entity[key] ?? []); values.has(name) ? values.delete(name) : values.add(name); update({ [key]: [...values] }); };
  return <aside className="flex w-[300px] shrink-0 flex-col border-l border-white/10 bg-[#0c1525] p-4"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Inspector</p><h3 className="mt-1 text-sm font-semibold text-white">{entity.label}</h3></div><button type="button" onClick={onDelete} className="rounded-lg p-2 text-slate-500 hover:bg-rose-300/10 hover:text-rose-300" aria-label="Delete selected entity"><Trash2 size={14} /></button></div><label className="mt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Node label<input value={entity.label} onChange={(event) => update({ label: event.target.value })} className="mt-2 w-full rounded-lg border border-white/10 bg-[#101a2c] px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/70" /></label><div className="mt-5 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Properties</p><button type="button" onClick={addProperty} className="flex items-center gap-1 text-[10px] font-bold text-cyan-200"><Plus size={12} /> Add</button></div><div className="mt-2 space-y-2 overflow-y-auto">{properties.map(([name, value]) => { const type = entity.attributeTypes?.[name] ?? 'string'; return <div key={name} className="rounded-lg border border-white/10 bg-[#101a2c] p-2"><div className="flex gap-1.5"><input value={name} onChange={(event) => updateProperty(name, event.target.value, type, value)} className="min-w-0 flex-1 rounded border border-white/10 bg-[#0a1221] px-2 py-1.5 text-[10px] text-slate-200" aria-label="Property name" /><select value={type} onChange={(event) => updateProperty(name, name, event.target.value as PropertyType, value)} className="w-[78px] rounded border border-white/10 bg-[#0a1221] px-1 text-[10px] text-slate-300">{propertyTypes.map((item) => <option key={item}>{item}</option>)}</select><button type="button" onClick={() => updateProperty(name, '', type, value)} className="text-slate-500 hover:text-rose-300" aria-label={`Remove ${name}`}><Trash2 size={12} /></button></div><div className="mt-2 flex gap-3 text-[10px] text-slate-400"><label><input type="checkbox" checked={entity.primaryKeys?.includes(name) ?? false} onChange={() => toggleList('primaryKeys', name)} /> PK</label><label><input type="checkbox" checked={entity.requiredProperties?.includes(name) ?? false} onChange={() => toggleList('requiredProperties', name)} /> Required</label></div></div>; })}</div></aside>;
}

export function SchemaDesigner({ domain }: SchemaDesignerProps) {
  const [entities, setEntities] = useState<EntityType[]>([]);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [relationshipName, setRelationshipName] = useState('RELATED_TO');
  const [cardinality, setCardinality] = useState('1:N');
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState('');
  const selectedEntity = entities.find((entity) => entity.id === selectedNodeId);
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);
  const selectedEdgeRef = useRef<string | null>(null);
  useEffect(() => {
    const match = String(selectedEdge?.label ?? '').match(/\((1:N|M:N|1:1)\)$/);
    selectedEdgeRef.current = selectedEdge?.id ?? null;
    setCardinality(match?.[1] ?? '1:N');
  }, [selectedEdge?.id]);
  useEffect(() => {
    if (!selectedEdge || selectedEdgeRef.current !== selectedEdge.id) return;
    const currentCardinality = String(selectedEdge.label ?? '').match(/\((1:N|M:N|1:1)\)$/)?.[1];
    if (currentCardinality === cardinality) return;
    const relationshipName = String(selectedEdge.label ?? '').replace(/ \([^)]*\)$/, '');
    setEdges((current) => current.map((edge) => edge.id === selectedEdge.id ? { ...edge, label: `${relationshipName} (${cardinality})` } : edge));
  }, [cardinality]);
  const changeEntity = useCallback((entity: EntityType) => setEntities((current) => current.map((item) => item.id === entity.id ? entity : item)), []);
  const deleteEntity = useCallback((id: string) => { setEntities((current) => current.filter((entity) => entity.id !== id)); setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id)); setSelectedNodeId(null); }, []);
  const addEntities = (templates: Array<[string, Array<[string, PropertyType]>]>) => { const newEntities = templates.map(([label, fields]) => makeEntity(label, fields)); setEntities((current) => [...current, ...newEntities]); setPositions((current) => ({ ...current, ...Object.fromEntries(newEntities.map((entity, index) => [entity.id, { x: 80 + ((Object.keys(current).length + index) % 3) * 320, y: 80 + Math.floor((Object.keys(current).length + index) / 3) * 250 }])) })); };
  const nodes = useMemo<DesignerNode[]>(() => entities.map((entity) => ({ id: entity.id, type: 'entity', position: positions[entity.id] ?? { x: 80, y: 80 }, measured: dimensions[entity.id], data: { entity, onSelect: () => { setSelectedNodeId(entity.id); setSelectedEdgeId(null); } } })), [entities, positions, dimensions]);
  const onNodesChange = useCallback((changes: NodeChange[]) => { setPositions((current) => { const next = { ...current }; changes.forEach((change) => { if (change.type === 'position' && change.position) next[change.id] = change.position; }); return next; }); setDimensions((current) => { const next = { ...current }; changes.forEach((change) => { if (change.type === 'dimensions' && change.dimensions) next[change.id] = change.dimensions; }); return next; }); }, []);
  const onConnect = useCallback((connection: Connection) => { if (connection.source && connection.target && connection.source !== connection.target) setPendingConnection(connection); }, []);
  const confirmConnection = () => { if (!pendingConnection?.source || !pendingConnection.target || !relationshipName.trim()) return; setEdges((current) => addEdge({ id: `REL-${crypto.randomUUID()}`, source: pendingConnection.source!, target: pendingConnection.target!, type: 'default', label: `${relationshipName.trim()} (${cardinality})`, markerEnd: { type: MarkerType.ArrowClosed } }, current)); setPendingConnection(null); };
  const autoLayout = () => setPositions(Object.fromEntries(entities.map((entity, index) => [entity.id, { x: 80 + (index % 3) * 320, y: 80 + Math.floor(index / 3) * 250 }])));
  const validate = () => { const problems = entities.filter((entity) => !entity.label.trim() || Object.keys(entity.attributes).some((key) => !key.trim())); setStatus(problems.length ? `${problems.length} entity type(s) need attention.` : 'Schema is valid.'); };
  const save = async () => { setStatus('Saving schema...'); try { const relationTypes: RelationType[] = edges.map((edge) => ({ id: edge.id, sourceTypeId: edge.source, targetTypeId: edge.target, relationName: String(edge.label).replace(/ \([^)]*\)$/, '') })); await api.post('/api/schema/save', { domain, nodeTypes: entities, relationTypes }); setStatus('Schema saved with Neo4j constraints and indexes.'); } catch (error) { setStatus(axios.isAxiosError(error) ? error.response?.data?.message ?? error.response?.data?.error ?? 'Schema save failed.' : 'Schema save failed.'); } };
  const generate = async () => { if (!prompt.trim()) return; setStatus('Generating schema...'); try { const { data } = await api.post<{ nodeTypes: EntityType[] }>('/api/schema/generate-from-prompt', { domain, prompt }); addEntities(data.nodeTypes.map((entity) => [entity.label, Object.entries(entity.attributeTypes ?? {}).map(([name, type]) => [name, type] as [string, PropertyType])])); setStatus(`Added ${data.nodeTypes.length} generated entity type(s).`); } catch (error) { setStatus(axios.isAxiosError(error) ? error.response?.data?.message ?? 'Schema generation failed.' : 'Schema generation failed.'); } };
  const onDrop = (event: React.DragEvent) => { event.preventDefault(); const preset = event.dataTransfer.getData('application/ontofabric-entity'); if (preset && presetTemplates[preset]) addEntities(presetTemplates[preset]); };
  useEffect(() => {
    const canvas = document.querySelector('.react-flow');
    if (!canvas) return;
    const handleDrop = (event: Event) => {
      const dropEvent = event as DragEvent;
      const preset = dropEvent.dataTransfer?.getData('application/ontofabric-entity');
      if (!preset || !presetTemplates[preset]) return;
      dropEvent.preventDefault();
      dropEvent.stopPropagation();
      addEntities(presetTemplates[preset]);
    };
    const handleDragOver = (event: Event) => {
      const dragEvent = event as DragEvent;
      if (dragEvent.dataTransfer?.types.includes('application/ontofabric-entity')) {
        dragEvent.preventDefault();
        dragEvent.stopPropagation();
        dragEvent.dataTransfer.dropEffect = 'copy';
      }
    };
    canvas.addEventListener('drop', handleDrop);
    canvas.addEventListener('dragover', handleDragOver);
    return () => {
      canvas.removeEventListener('drop', handleDrop);
      canvas.removeEventListener('dragover', handleDragOver);
    };
  }, [entities.length]);
  return <section className="flex h-[calc(100vh-112px)] min-h-[680px] min-w-0 flex-1 flex-col gap-3 p-3 md:p-4"><div className="flex items-center gap-3 rounded-xl border border-fuchsia-300/20 bg-fuchsia-300/[0.06] px-3 py-2"><Bot size={16} className="shrink-0 text-fuchsia-300" /><input value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void generate(); }} placeholder="Describe your domain schema in plain text..." className="min-w-0 flex-1 bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-500" /><button type="button" onClick={() => void generate()} className="flex items-center gap-1 rounded-lg bg-fuchsia-300 px-3 py-1.5 text-[10px] font-bold text-[#190d25]"><WandSparkles size={12} /> Generate</button></div><div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0a1221]"><aside className="w-[210px] shrink-0 border-r border-white/10 bg-[#0c1525] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Palette</p><button type="button" onClick={() => addEntities([['New Entity Type', []]])} className="mt-3 flex w-full items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-bold text-cyan-100"><Plus size={14} /> Add Custom Entity</button><div className="mt-4 space-y-2">{Object.keys(presetTemplates).map((name) => <button key={name} type="button" draggable onDragStart={(event) => event.dataTransfer.setData('application/ontofabric-entity', name)} onClick={() => addEntities(presetTemplates[name])} className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-[#101a2c] px-3 py-2 text-left text-xs text-slate-200 hover:border-cyan-300/40"><Boxes size={13} className="text-cyan-300" />{name}</button>)}</div><p className="mt-6 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Industry templates</p><div className="mt-2 grid gap-1.5">{['SCOR', 'FIBO', 'FHIR'].map((name) => <button key={name} type="button" onClick={() => addEntities(templateSets[name])} className="rounded-lg border border-white/10 px-2 py-1.5 text-left text-[11px] text-slate-300 hover:bg-white/5"><Database size={11} className="mr-1 inline text-amber-300" />Load {name}</button>)}</div></aside><main className="relative min-w-0 flex-1" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}><ReactFlow className="!h-full !w-full" nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onConnect={onConnect} onNodeClick={(_, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(null); }} onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); }} fitView nodesConnectable nodesDraggable panOnDrag zoomOnScroll proOptions={{ hideAttribution: true }}><Background color="#24354b" gap={28} size={1} /><Controls className="!rounded-xl !border-white/10 !bg-[#101a2c] !fill-slate-300" /></ReactFlow><div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/10 bg-[#101a2c]/95 p-1.5 shadow-xl"><button type="button" onClick={autoLayout} className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-[10px] font-bold text-slate-200 hover:bg-white/10"><GitBranch size={12} /> Auto Layout</button><button type="button" onClick={validate} className="flex items-center gap-1 rounded-lg bg-emerald-300 px-2.5 py-2 text-[10px] font-bold text-[#06150e]"><Check size={12} /> Validate Schema</button><button type="button" onClick={() => void save()} className="flex items-center gap-1 rounded-lg bg-cyan-300 px-2.5 py-2 text-[10px] font-bold text-[#06111d]"><Save size={12} /> Save</button></div></main>{selectedEntity ? <Inspector entity={selectedEntity} onChange={changeEntity} onDelete={() => deleteEntity(selectedEntity.id)} /> : selectedEdge ? <aside className="w-[300px] shrink-0 border-l border-white/10 bg-[#0c1525] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">Relationship inspector</p><h3 className="mt-2 text-sm font-semibold text-white">{String(selectedEdge.label)}</h3><label className="mt-5 block text-xs text-slate-400">Relationship Name<input value={String(selectedEdge.label).replace(/ \([^)]*\)$/, '')} onChange={(event) => setEdges((current) => current.map((edge) => edge.id === selectedEdge.id ? { ...edge, label: `${event.target.value} (${cardinality})` } : edge))} className="mt-2 w-full rounded-lg border border-white/10 bg-[#101a2c] px-3 py-2 text-xs text-white" /></label><label className="mt-4 block text-xs text-slate-400">Cardinality<select value={cardinality} onChange={(event) => setCardinality(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#101a2c] px-3 py-2 text-xs text-white"><option>1:N</option><option>M:N</option><option>1:1</option></select></label></aside> : <aside className="w-[300px] shrink-0 border-l border-white/10 bg-[#0c1525] p-5"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Inspector</p><p className="mt-3 text-xs leading-5 text-slate-400">Select an entity or relationship on the canvas to edit its properties.</p></aside>}</div>{status && <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300" role="status">{status}</p>}{pendingConnection && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"><div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#101a2c] p-5"><h3 className="text-sm font-semibold text-white">Define relationship</h3><input value={relationshipName} onChange={(event) => setRelationshipName(event.target.value)} className="mt-4 w-full rounded-lg border border-white/10 bg-[#0a1221] px-3 py-2 text-xs text-white" placeholder="Relationship Name" /><select value={cardinality} onChange={(event) => setCardinality(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#0a1221] px-3 py-2 text-xs text-white"><option>1:N</option><option>M:N</option><option>1:1</option></select><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setPendingConnection(null)} className="rounded-lg px-3 py-2 text-xs text-slate-400">Cancel</button><button type="button" onClick={confirmConnection} className="rounded-lg bg-cyan-300 px-3 py-2 text-xs font-bold text-[#06111d]">Create relationship</button></div></div></div>}</section>;
}