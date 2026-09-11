import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import { Boxes, Factory, PackageSearch, Truck } from 'lucide-react';

import type { SopPlanningSummary } from '@ontofabric/shared/types.js';

type SopPlanningPanelProps = {
  refreshKey?: number;
};

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001' });

const emptySummary: SopPlanningSummary = { demand: [], inventory: [], supplierRisks: [], capacity: [] };

export function SopPlanningPanel({ refreshKey = 0 }: SopPlanningPanelProps) {
  const [summary, setSummary] = useState<SopPlanningSummary>(emptySummary);
  const [error, setError] = useState('');

  useEffect(() => {
    void api.get<SopPlanningSummary>('/api/sop/summary')
      .then(({ data }) => { setSummary(data); setError(''); })
      .catch(() => setError('S&OP data is not available. Run the database seed command to load the planning example.'));
  }, [refreshKey]);

  const inventoryAlerts = summary.inventory.filter((item) => item.onHand < item.reorderPoint).length;
  const totalDemand = summary.demand.reduce((total, item) => total + item.quantity, 0);
  const longestLeadTime = summary.supplierRisks[0]?.leadTimeDays ?? 0;

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[#0c1525] p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">S&amp;OP cockpit</p><h3 className="mt-2 text-xl font-semibold text-white">Supply and operations pulse</h3><p className="mt-1 text-xs text-slate-500">Demand, inventory, supplier exposure, and manufacturing capacity in one operating view.</p></div>
        {error && <span className="text-xs text-amber-200">{error}</span>}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<PackageSearch size={16} />} label="Forecast demand" value={totalDemand.toLocaleString()} detail="units across periods" color="text-cyan-300" />
        <Metric icon={<Boxes size={16} />} label="Inventory alerts" value={String(inventoryAlerts)} detail="below reorder point" color="text-rose-300" />
        <Metric icon={<Truck size={16} />} label="Longest supplier lead" value={`${longestLeadTime}d`} detail="planning exposure" color="text-amber-300" />
        <Metric icon={<Factory size={16} />} label="Work centers" value={String(summary.capacity.length)} detail="available production paths" color="text-emerald-300" />
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <PlanningTable title="Inventory by facility" headers={['Product / facility', 'On hand', 'Reorder']} rows={summary.inventory.map((item) => [`${item.productId} · ${item.facilityId}`, item.onHand.toLocaleString(), item.reorderPoint.toLocaleString()])} alertRows={summary.inventory.map((item) => item.onHand < item.reorderPoint)} />
        <PlanningTable title="Supplier exposure" headers={['Supplier', 'Lead time', 'MOQ']} rows={summary.supplierRisks.slice(0, 5).map((item) => [item.supplierName, `${item.leadTimeDays}d`, item.minimumOrderQty.toLocaleString()])} alertRows={summary.supplierRisks.slice(0, 5).map((item) => item.leadTimeDays > 28)} />
        <PlanningTable title="Production capacity" headers={['Work center', 'Capacity', 'Unit cost']} rows={summary.capacity.map((item) => [item.workCenterName, item.capacity.toLocaleString(), `$${item.unitCost}`])} />
      </div>
    </section>
  );
}

function Metric({ icon, label, value, detail, color }: { icon: ReactNode; label: string; value: string; detail: string; color: string }) {
  return <div className="rounded-2xl border border-white/10 bg-[#101a2c] p-4"><div className={`flex items-center gap-2 text-xs ${color}`}>{icon}<span className="text-slate-500">{label}</span></div><p className="mt-3 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-[10px] text-slate-600">{detail}</p></div>;
}

function PlanningTable({ title, headers, rows, alertRows = [] }: { title: string; headers: string[]; rows: string[][]; alertRows?: boolean[] }) {
  return <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#101a2c]"><div className="border-b border-white/10 px-4 py-3 text-xs font-semibold text-slate-300">{title}</div><table className="w-full text-left text-[11px]"><thead><tr className="text-slate-600">{headers.map((header) => <th key={header} className="px-3 py-2 font-medium">{header}</th>)}</tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={headers.length} className="px-3 py-4 text-slate-600">No data yet</td></tr> : rows.map((row, index) => <tr key={`${title}-${index}`} className={`border-t border-white/5 ${alertRows[index] ? 'bg-rose-300/10 text-rose-100' : 'text-slate-300'}`}>{row.map((value, valueIndex) => <td key={`${title}-${index}-${valueIndex}`} className="px-3 py-2.5">{value}</td>)}</tr>)}</tbody></table></div>;
}
