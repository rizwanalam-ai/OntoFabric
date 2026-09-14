import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { KeyRound } from 'lucide-react';

import type { EntityType } from '@ontofabric/shared/types.js';

export type EntityNodeData = {
  entity: EntityType;
  onSelect: () => void;
};

export function EntityNodeComponent({ data }: NodeProps<Node<EntityNodeData, 'entity'>>) {
  const { entity, onSelect } = data;
  const primaryKeys = new Set(entity.primaryKeys ?? []);
  return (
    <div className="w-[250px] rounded-xl border border-cyan-300/30 bg-[#101a2c] p-3 shadow-xl shadow-black/30" onClick={onSelect}>
      <Handle type="target" position={Position.Left} isConnectable={true} className="!z-20 !h-3 !w-3 !border-2 !border-[#101a2c] !bg-cyan-300" />
      <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
        <strong className="truncate text-sm text-white">{entity.label || 'Untitled entity'}</strong>
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-cyan-300">Entity</span>
      </div>
      <div className="mt-2 space-y-1">
        {Object.entries(entity.attributes).length === 0 ? <p className="text-[10px] text-slate-500">No properties defined</p> : Object.entries(entity.attributes).map(([name]) => <div key={name} className="flex items-center gap-1.5 text-[10px] text-slate-300"><span className="truncate">{name}</span>{primaryKeys.has(name) && <KeyRound size={10} className="shrink-0 text-amber-300" />}{entity.requiredProperties?.includes(name) && <span className="text-rose-300">*</span>}</div>)}
      </div>
      <Handle type="source" position={Position.Right} isConnectable={true} className="!z-20 !h-3 !w-3 !border-2 !border-[#101a2c] !bg-cyan-300" />
    </div>
  );
}