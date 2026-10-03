import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, ArrowUpRight, Boxes, Database, Network, RefreshCw } from 'lucide-react';
import type { DomainContext, GraphEdge, GraphNode } from '@ontofabric/shared/types.js';
import { api } from '../api';

type DomainFilter = 'ALL' | DomainContext;
type SyncAuditRecord = {
  id: string;
  sourceType: string;
  sourceReference: string;
  tableName?: string;
  fileName?: string;
  entityLabel?: string;
  domain: string;
  rowCount: number;
  nodeCount: number;
  edgeCount: number;
  status: 'SUCCEEDED' | 'FAILED';
  startedAt: string;
  completedAt: string;
  errorMessage?: string;
};

type BusinessCockpitProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onRefresh: () => Promise<void>;
  onOpenExplorer: () => void;
};

const domainOptions: Array<{ value: DomainContext; label: string }> = [
  { value: 'SUPPLY_CHAIN', label: 'Supply Chain' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'HEALTHCARE', label: 'Healthcare' },
  { value: 'HR_ORG', label: 'HR & Organization' },
  { value: 'CUSTOM', label: 'Custom' }
];

const domainName = (domain: string): string => domainOptions.find((option) => option.value === domain)?.label ?? domain.split('_').join(' ');

export function BusinessCockpit({ nodes, edges, onRefresh, onOpenExplorer }: BusinessCockpitProps) {
  const [domainFilter, setDomainFilter] = useState<DomainFilter>('ALL');
  const [auditRecords, setAuditRecords] = useState<SyncAuditRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadAudit = async () => {
    setAuditLoading(true);
    setAuditError('');
    try {
      const { data } = await api.get<{ days: number; records: SyncAuditRecord[] }>('/api/audit/syncs', { params: { limit: 100, days: 30 } });
      setAuditRecords(data.records);
      setLastUpdated(new Date());
    } catch {
      setAuditError('Sync activity is unavailable.');
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    void loadAudit();
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
      await loadAudit();
    } finally {
      setRefreshing(false);
    }
  };

  const visibleNodes = domainFilter === 'ALL' ? nodes : nodes.filter((node) => node.domain === domainFilter);
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
  const connectedNodeIds = new Set(visibleEdges.flatMap((edge) => [edge.source, edge.target]));
  const domainAudits = domainFilter === 'ALL' ? auditRecords : auditRecords.filter((record) => record.domain === domainFilter);
  const successfulSyncs = domainAudits.filter((record) => record.status === 'SUCCEEDED').length;
  const syncRate = domainAudits.length > 0 ? `${Math.round((successfulSyncs / domainAudits.length) * 100)}%` : '—';

  const entityTypes = new Map<string, { label: string; domain: string; count: number }>();
  const sourceSystems = new Map<string, number>();
  visibleNodes.forEach((node) => {
    const label = node.type.label || 'Unclassified';
    const domain = node.domain || 'CUSTOM';
    const key = `${domain}:${label}`;
    const current = entityTypes.get(key);
    entityTypes.set(key, { label, domain, count: (current?.count ?? 0) + 1 });
    const source = node.sourceSystem || 'Unknown';
    sourceSystems.set(source, (sourceSystems.get(source) ?? 0) + 1);
  });

  const coverageRows = [...entityTypes.values()].sort((left, right) => right.count - left.count).slice(0, 8);
  const recentAudits = [...domainAudits].sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt)).slice(0, 8);
  const latestAuditBySource = new Map<string, SyncAuditRecord>();
  [...domainAudits].sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt)).forEach((record) => {
    if (!latestAuditBySource.has(record.sourceType)) latestAuditBySource.set(record.sourceType, record);
  });
  const sourceRows = [...sourceSystems.entries()].sort((left, right) => right[1] - left[1]);
  const syncRateDetail = domainAudits.length > 0
    ? `${successfulSyncs} of ${domainAudits.length} syncs succeeded in the last 30 days`
    : 'No syncs recorded in the last 30 days';

  return (
    <section className="min-w-0 flex-1 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#d7e1e8] pb-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#3b82f6]">Business cockpit</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Business activity across the mesh</h2>
          <p className="mt-1 text-xs text-slate-600">Graph coverage and data-source health across business domains.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[10px] font-semibold text-slate-600" htmlFor="cockpit-domain-filter">
            Domain
            <select id="cockpit-domain-filter" value={domainFilter} onChange={(event) => setDomainFilter(event.target.value as DomainFilter)} className="mt-1 block min-w-40 rounded-lg border border-[#d7e1e8] bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-blue-400">
              <option value="ALL">All domains</option>
              {domainOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh business cockpit" title="Refresh" className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#d7e1e8] bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      {auditError && <p className="mt-4 text-xs text-rose-700" role="status">{auditError}</p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Boxes size={16} />} label="Entities" value={visibleNodes.length.toLocaleString()} detail={domainFilter === 'ALL' ? 'across all domains' : domainName(domainFilter)} color="text-blue-700" />
        <Metric icon={<Network size={16} />} label="Relationships" value={visibleEdges.length.toLocaleString()} detail="within the selected scope" color="text-teal-700" />
        <Metric icon={<Activity size={16} />} label="Connected entities" value={visibleNodes.length > 0 ? `${Math.round((connectedNodeIds.size / visibleNodes.length) * 100)}%` : '—'} detail={`${connectedNodeIds.size.toLocaleString()} of ${visibleNodes.length.toLocaleString()} entities linked`} color="text-emerald-700" />
        <Metric icon={<Database size={16} />} label="Sync success rate" value={auditLoading ? '…' : syncRate} detail={syncRateDetail} color={domainAudits.some((record) => record.status === 'FAILED') ? 'text-amber-700' : 'text-sky-700'} />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <CockpitTable title="Entity coverage" headers={['Entity type', 'Domain', 'Entities']} rows={coverageRows.map((row) => [row.label, domainName(row.domain), row.count.toLocaleString()])} emptyMessage="No entities in this domain yet." />
        <CockpitTable title="Source systems" headers={['Source', 'Entities', 'Latest sync']} rows={sourceRows.map(([source, count]) => {
          const latest = latestAuditBySource.get(source);
          return [source, count.toLocaleString(), latest ? <SyncStatus status={latest.status} /> : 'No sync history'];
        })} emptyMessage="No source-system data is available for this scope." />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-[#d7e1e8] bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-[#d7e1e8] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Recent sync activity</h3>
            <p className="mt-1 text-[10px] text-slate-500">Last 30 days{lastUpdated ? ` · refreshed ${lastUpdated.toLocaleTimeString()}` : ''}</p>
          </div>
          {domainAudits.some((record) => record.status === 'FAILED') && <span className="text-[10px] font-semibold text-amber-800">{domainAudits.filter((record) => record.status === 'FAILED').length} failed</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[680px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-600">
              <tr><th className="px-4 py-3">Source</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Result</th><th className="px-4 py-3">Records</th><th className="px-4 py-3">Completed</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentAudits.map((record) => <tr key={record.id} className="text-slate-700">
                <td className="whitespace-nowrap px-4 py-3 font-semibold">{record.sourceType}</td>
                <td className="max-w-64 truncate px-4 py-3" title={record.errorMessage ?? record.sourceReference}>{record.entityLabel ?? record.tableName ?? record.fileName ?? record.sourceReference}</td>
                <td className="px-4 py-3"><SyncStatus status={record.status} /></td>
                <td className="px-4 py-3 font-mono">{record.nodeCount.toLocaleString()}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(record.completedAt).toLocaleString()}</td>
              </tr>)}
              {recentAudits.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">{auditLoading ? 'Loading sync activity…' : 'No sync runs recorded for this scope.'}</td></tr>}
            </tbody>
          </table>
        </div>
        {visibleNodes.length === 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
          <span>No graph entities match the selected scope.</span>
          <button type="button" onClick={onOpenExplorer} className="flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-900">Open Explorer <ArrowUpRight size={13} /></button>
        </div>}
      </div>
    </section>
  );
}

function Metric({ icon, label, value, detail, color }: { icon: ReactNode; label: string; value: string; detail: string; color: string }) {
  return <div className="rounded-xl border border-[#d7e1e8] bg-white p-4">
    <div className={`flex items-center gap-2 text-xs ${color}`}>{icon}<span className="text-slate-700">{label}</span></div>
    <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
    <p className="mt-1 text-[10px] text-slate-500">{detail}</p>
  </div>;
}

function CockpitTable({ title, headers, rows, emptyMessage }: { title: string; headers: string[]; rows: ReactNode[][]; emptyMessage: string }) {
  return <section className="overflow-hidden rounded-xl border border-[#d7e1e8] bg-white">
    <h3 className="border-b border-[#d7e1e8] px-4 py-3 text-sm font-semibold text-slate-800">{title}</h3>
    <div className="overflow-x-auto">
      <table className="min-w-[380px] w-full text-left text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase text-slate-600"><tr>{headers.map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, rowIndex) => <tr key={`${title}-${rowIndex}`} className="text-slate-700">{row.map((value, valueIndex) => <td key={`${title}-${rowIndex}-${valueIndex}`} className="px-4 py-3">{value}</td>)}</tr>)}
          {rows.length === 0 && <tr><td colSpan={headers.length} className="px-4 py-8 text-center text-xs text-slate-500">{emptyMessage}</td></tr>}
        </tbody>
      </table>
    </div>
  </section>;
}

function SyncStatus({ status }: { status: SyncAuditRecord['status'] }) {
  return <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-semibold ${status === 'SUCCEEDED' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
    {status === 'SUCCEEDED' ? 'Succeeded' : 'Failed'}
  </span>;
}