import type { DomainContext } from '@ontofabric/shared/types.js';

type DomainSelectorProps = {
  domain: DomainContext;
  onDomainChange: (domain: DomainContext) => void;
};

const domainOptions: Array<{ value: DomainContext; label: string }> = [
  { value: 'SUPPLY_CHAIN', label: 'Supply Chain (SCOR)' },
  { value: 'FINANCE', label: 'Finance (FIBO)' },
  { value: 'HEALTHCARE', label: 'Healthcare (FHIR)' },
  { value: 'HR_ORG', label: 'HR & Workforce' },
  { value: 'CUSTOM', label: 'Custom Enterprise Mix' }
];

export function DomainSelector({ domain, onDomainChange }: DomainSelectorProps) {
  return (
    <label className="flex min-w-0 items-center gap-2 rounded-xl border border-cyan-200/40 bg-cyan-300/15 px-2.5 py-2 text-xs text-cyan-50 shadow-lg shadow-cyan-950/20 sm:px-3">
      <span className="hidden font-bold uppercase tracking-[0.14em] text-cyan-100 md:inline">Domain:</span>
      <select
        aria-label="Active domain context"
        value={domain}
        onChange={(event) => onDomainChange(event.target.value as DomainContext)}
        className="max-w-[155px] cursor-pointer truncate bg-transparent font-bold text-white outline-none sm:max-w-[210px]"
      >
        {domainOptions.map((option) => <option key={option.value} value={option.value} className="bg-[#0a1221] text-slate-100">{option.label}</option>)}
      </select>
    </label>
  );
}