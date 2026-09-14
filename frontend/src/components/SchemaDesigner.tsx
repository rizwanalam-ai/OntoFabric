import { useCallback, useMemo, useState } from 'react';
import { addEdge, Background, Controls, Handle, MarkerType, Position, ReactFlow, type Connection, type Edge, type Node, type NodeChange, type NodeProps } from '@xyflow/react';
import { GripVertical, Plus, Save, Trash2 } from 'lucide-react';
import axios from 'axios';

import type { DomainContext, EntityType, Primitive, RelationType } from '@ontofabric/shared/types.js';
import '@xyflow/react/dist/style.css';

type PropertyType = 'string' | 'number' | 'boolean' | 'date';
type DesignerNodeData = {
  entity: EntityType;
  onChange: (entity: EntityType) => void;
  onDelete: () => void;
};
type DesignerNode = Node<DesignerNodeData, 'entity'>;

type SchemaDesignerProps = {
  domain: DomainContext;
};

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001' });

const starterEntities: Record<DomainContext, Array<{ label: string; properties: Array<[string, PropertyType]> }>> = {
  SUPPLY_CHAIN: [{ label: 'Product', properties: [['sku', 'string'], ['quantity', 'number']] }, { label: 'Supplier', properties: [['name', 'string'], ['active', 'boolean']] }],
  FINANCE: [{ label: 'Invoice', properties: [['invoiceNumber', 'string'], ['amount', 'number']] }, { label: 'LegalEntity', properties: [['name', 'string'], ['incorporatedOn', 'date']] }],
  HEALTHCARE: [{ label: 'Patient', properties: [['patientReference', 'string'], ['active', 'boolean']] }, { label: 'Encounter', properties: [['encounterReference', 'string'], ['encounterDate', 'date']] }],
  HR_ORG: [{ label: 'Employee', properties: [['employeeNumber', 'string'], ['active', 'boolean']] }, { label: 'Department', properties: [['name', 'string'], ['headcount', 'number']] }],
  CUSTOM: [{ label: 'Customer', properties: [['customerId', 'string'], ['status', 'string']] }, { label: 'Product', properties: [['sku', 'string'], ['price', 'number']] }]
};

const makeEntity = (label: string, properties: Array<[string, PropertyType]>, id = `ENTITY-${crypto.randomUUID()}`): EntityType => ({
  id,
  label,
  attributes: Object.fromEntries(properties.map(([name, type]) => [name, type === 'number' ? 0 : type === 'boolean' ? false : ''])),
  attributeTypes: Object.fromEntries(properties)
});

function EntityCard({ data }: NodeProps<DesignerNode>) {
  const { entity, onChange, onDelete } = data;
  const updateEntity = (update: Partial<EntityType>) => onChange({ ...entity, ...update });
  const updateProperty = (oldName: string, name: string, type: PropertyType, value: Primitive) => {
    const attributes = { ...entity.attributes };
    const attributeTypes = { ...(entity.attributeTypes ?? {}) };
    if (oldName !== name) {
      delete attributes[oldName];
      delete attributeTypes[oldName];
    }
    if (name) {
      attributes[name] = value;
      attributeTypes[name] = type;
    }
    updateEntity({ attributes, attributeTypes });
  };
  const addProperty = () => {
    const name = `property${Object.keys(entity.attributes).length + 1}`;
    updateProperty('', name, 'string', '');
  };

  return <div className="w-[300px] rounded-2xl border border-cyan-300/30 bg-[#101a2c] p-4 shadow-2xl shadow-black/30">
    <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-[#101a2c] !bg-cyan-300" />
    <div className="flex items-center gap-2"><GripVertical size={14} className="text-slate-600" /><input value={entity.label} onChange={(event) => updateEntity({ label: event.target.value })} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0a1221] px-2.5 py-2 text-sm font-semibold text-white outline-none focus:border-cyan-300/70" aria-label="Entity label" /><button type="button" onClick={onDelete} aria-label="Delete entity type" className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-300/10 hover:text-rose-300"><Trash2 size={14} /></button></div>
    <div className="mt-4 space-y-2">{Object.entries(entity.attributes).map(([name, value]) => {
      const type = entity.attributeTypes?.[name] ?? 'string';
      return <div key={name} className="flex items-center gap-1.5"><input value={name} onChange={(event) => updateProperty(name, event.target.value, type, value)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#0a1221] px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-cyan-300/60" aria-label="Property name" /><select value={type} onChange={(event) => updateProperty(name, name, event.target.value as PropertyType, value)} className="w-[92px] rounded-lg border border-white/10 bg-[#0a1221] px-1.5 py-1.5 text-[11px] text-slate-300 outline-none"><option value="string">String</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="date">Date</option></select><input value={String(value ?? '')} type={type === 'number' ? 'number' : type === 'date' ? 'date' : type === 'boolean' ? 'checkbox' : 'text'} checked={type === 'boolean' ? Boolean(value) : undefined} onChange={(event) => updateProperty(name, name, type, type === 'number' ? Number(event.target.value) : type === 'boolean' ? event.target.checked : event.target.value)} className="w-[72px] rounded-lg border border-white/10 bg-[#0a1221] px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-cyan-300/60" aria-label="Property value" /></div>;
    })}</div>
    <button type="button" onClick={addProperty} className="mt-3 flex items-center gap-1 text-[11px] font-bold text-cyan-200 hover:text-white"><Plus size={13} /> Add Property</button>
    <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-[#101a2c] !bg-cyan-300" />
  </div>;
}

const nodeTypes = { entity: EntityCard };

export function SchemaDesigner({ domain }: SchemaDesignerProps) {
  const [entities, setEntities] = useState<EntityType[]>(() => starterEntities[domain].map(({ label, properties }, index) => makeEntity(label, properties, `STARTER-${domain}-${index}`)));
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => Object.fromEntries(starterEntities[domain].map((_, index) => [`STARTER-${domain}-${index}`, { x: 180 + index * 380, y: 160 }])));
  const [edges, setEdges] = useState<Edge[]>([]);
  const [relationName, setRelationName] = useState('RELATED_TO');
  const [status, setStatus] = useState('');

  const changeEntity = useCallback((entity: EntityType) => setEntities((current) => current.map((item) => item.id === entity.id ? entity : item)), []);
  const deleteEntity = useCallback((id: string) => {
    setEntities((current) => current.filter((entity) => entity.id !== id));
    setEdges((current) => current.filter((edge) => edge.source !== id && edge.target !== id));
  }, []);
  const addEntity = useCallback((position?: { x: number; y: number }) => {
    const id = `ENTITY-${crypto.randomUUID()}`;
    setEntities((current) => [...current, { id, label: 'New Entity Type', attributes: {}, attributeTypes: {} }]);
    setPositions((current) => ({ ...current, [id]: position ?? { x: 120 + Object.keys(current).length * 40, y: 120 + Object.keys(current).length * 30 } }));
  }, []);
  const nodes = useMemo<DesignerNode[]>(() => entities.map((entity) => ({ id: entity.id, type: 'entity', position: positions[entity.id] ?? { x: 100, y: 100 }, data: { entity, onChange: changeEntity, onDelete: () => deleteEntity(entity.id) } })), [changeEntity, deleteEntity, entities, positions]);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setPositions((current) => {
      const next = { ...current };
      changes.forEach((change) => { if (change.type === 'position' && change.position) next[change.id] = change.position; });
      return next;
    });
  }, []);
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    setEdges((current) => addEdge({ ...connection, id: `REL-${crypto.randomUUID()}`, type: 'default', label: relationName, markerEnd: { type: MarkerType.ArrowClosed }, animated: false }, current));
  }, [relationName]);
  const saveSchema = async () => {
    setStatus('Saving schema...');
    try {
      const relationTypes: RelationType[] = edges.map((edge) => ({ id: edge.id, sourceTypeId: edge.source, targetTypeId: edge.target, relationName: String(edge.label ?? relationName) }));
      await api.post('/api/schema/custom', { domain, nodeTypes: entities, relationTypes });
      setStatus(`Saved ${entities.length} node type${entities.length === 1 ? '' : 's'} and ${relationTypes.length} relationship${relationTypes.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setStatus(axios.isAxiosError(error) ? error.response?.data?.message ?? error.response?.data?.error ?? 'Schema save failed.' : 'Schema save failed.');
    }
  };
  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    addEntity({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
  };

  return <section className="flex h-[calc(100vh-112px)] min-h-[680px] min-w-0 flex-1 flex-col gap-3 p-3 md:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-fuchsia-300">Design mode</p><h2 className="mt-1 text-2xl font-semibold text-white">Build the {domain} ontology</h2></div><div className="flex items-center gap-2"><input value={relationName} onChange={(event) => setRelationName(event.target.value)} className="w-36 rounded-xl border border-white/10 bg-[#101a2c] px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-300/70" placeholder="Relationship name" aria-label="New relationship name" /><button type="button" draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', 'entity')} onClick={() => addEntity()} className="flex items-center gap-2 rounded-xl border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-300/20"><Plus size={14} /> New Entity Type</button><button type="button" onClick={() => void saveSchema()} className="flex items-center gap-2 rounded-xl bg-cyan-300 px-3 py-2 text-xs font-bold text-[#06111d] hover:bg-cyan-200"><Save size={14} /> Save Schema</button></div></div>
    {status && <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300" role="status">{status}</p>}
    <div className="relative h-[600px] min-h-[600px] flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0a1221]" onDrop={onDrop} onDragOver={(event) => event.preventDefault()}><ReactFlow className="!h-[600px] !w-full" style={{ height: 600, width: '100%' }} nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onConnect={onConnect} fitView nodesConnectable nodesDraggable panOnDrag zoomOnScroll proOptions={{ hideAttribution: true }}><Background color="#24354b" gap={28} size={1} /><Controls className="!rounded-xl !border-white/10 !bg-[#101a2c] !fill-slate-300" /></ReactFlow>{nodes.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="pointer-events-auto max-w-sm rounded-2xl border border-cyan-300/20 bg-[#101a2c]/95 p-6 text-center shadow-2xl"><p className="text-sm font-semibold text-white">Your canvas is empty</p><p className="mt-2 text-xs leading-5 text-slate-400">Add an entity type above or drag the button onto the canvas to start designing.</p><button type="button" onClick={() => addEntity()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-3 py-2 text-xs font-bold text-[#06111d] hover:bg-cyan-200"><Plus size={14} /> Add first entity</button></div></div>}</div>
  </section>;
}