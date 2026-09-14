import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import { Boxes, Factory, PackageSearch, Truck } from 'lucide-react';

import type { DomainContext, SopPlanningSummary } from '@ontofabric/shared/types.js';

type SopPlanningPanelProps = {
  domain: DomainContext;
  refreshKey?: number;
};

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3001' });

const emptySummary: SopPlanningSummary = { demand: [], inventory: [], supplierRisks: [], capacity: [] };

export function SopPlanningPanel({ domain, refreshKey = 0 }: SopPlanningPanelProps) {
  const [summary, setSummary] = useState<SopPlanningSummary>(emptySummary);
  const [error, setError] = useState('');

  useEffect(() => {
    if (domain !== 'SUPPLY_CHAIN') {
      setSummary(emptySummary);
      setError('This cockpit is scoped to SUPPLY_CHAIN. Select Supply Chain to view S&OP metrics.');
      return;
    }
    void api.get<SopPlanningSummary>('/api/sop/summary')
      .then(({ data }) => { setSummary(data); setError(''); })
      .catch(() => setError('S&OP data is not available. Run the database seed command to load the planning example.'));
  }, [domain, refreshKey]);

  const inventoryAlerts = summary.inventory.filter((item) => item.onHand < item.reorderPoint).length;
  const totalDemand = summary.demand.reduce((total, item) => total + item.quantity, 0);
  const longestLeadTime = summary.supplierRisks[0]?.leadTimeDays ?? 0;

  return (
    <section className="rounded-[1.75rem] border border-white/15 bg-[#0c1525] p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300">S&amp;OP cockpit</p><h3 className="mt-2 text-xl font-semibold text-white">Supply and operations pulse</h3><p className="mt-1 text-xs text-slate-300">Demand, inventory, supplier exposure, and manufacturing capacity in one operating view.</p></div>
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
        <PlanningTable title="Supplier exposure" headers={['Supplier', 'Lead time', 'MOQ']} rows={summary.supplierRisks.map((item) => [item.supplierName, `${item.leadTimeDays}d`, item.minimumOrderQty.toLocaleString()])} alertRows={summary.supplierRisks.map((item) => item.leadTimeDays > 28)} />
        <PlanningTable title="Production capacity" headers={['Work center', 'Capacity', 'Unit cost']} rows={summary.capacity.map((item) => [item.workCenterName, item.capacity.toLocaleString(), `$${item.unitCost}`])} />
      </div>
    </section>
  );
}

function Metric({ icon, label, value, detail, color }: { icon: ReactNode; label: string; value: string; detail: string; color: string }) {
  return <div className="rounded-2xl border border-white/15 bg-[#101a2c] p-4"><div className={`flex items-center gap-2 text-xs ${color}`}>{icon}<span className="text-slate-300">{label}</span></div><p className="mt-3 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div>;
}

function PlanningTable({ title, headers, rows, alertRows = [] }: { title: string; headers: string[]; rows: string[][]; alertRows?: boolean[] }) {
  const pageSize = 5;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  useEffect(() => setPage(0), [rows.length]);

  return <div className="overflow-hidden rounded-2xl border border-white/15 bg-[#101a2c]"><div className="border-b border-white/15 px-4 py-3 text-xs font-semibold text-slate-200">{title}</div><div className="max-h-64 overflow-y-auto"><table className="w-full text-left text-[11px]"><thead className="sticky top-0 z-10 bg-[#17243a] text-slate-200"><tr>{headers.map((header) => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}</tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={headers.length} className="px-3 py-4 text-slate-400">No data yet</td></tr> : visibleRows.map((row, index) => { const rowIndex = currentPage * pageSize + index; return <tr key={`${title}-${rowIndex}`} className={`border-t border-white/10 ${alertRows[rowIndex] ? 'bg-rose-300/10 text-rose-100' : 'text-slate-200'}`}>{row.map((value, valueIndex) => <td key={`${title}-${rowIndex}-${valueIndex}`} className="px-3 py-2.5">{value}</td>)}</tr>; })}</tbody></table></div><footer className="flex items-center justify-between border-t border-white/15 px-3 py-2 text-[10px] text-slate-300"><span>{rows.length === 0 ? '0 items' : `${currentPage * pageSize + 1}-${Math.min((currentPage + 1) * pageSize, rows.length)} of ${rows.length}`}</span><div className="flex items-center gap-1"><button type="button" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={currentPage === 0} className="rounded-md px-2 py-1 text-slate-300 hover:bg-white/10 disabled:opacity-30">Previous</button><span className="px-1 text-slate-400">Page {currentPage + 1} / {pageCount}</span><button type="button" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={currentPage >= pageCount - 1} className="rounded-md px-2 py-1 text-slate-300 hover:bg-white/10 disabled:opacity-30">Next</button></div></footer></div>;
}
