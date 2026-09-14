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
    <label className="flex min-w-0 items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] px-2 py-2 text-xs text-slate-300 sm:px-3">
      <span className="hidden font-semibold uppercase tracking-[0.14em] text-cyan-200/80 md:inline">Domain</span>
      <select
        aria-label="Active domain context"
        value={domain}
        onChange={(event) => onDomainChange(event.target.value as DomainContext)}
        className="max-w-[145px] cursor-pointer truncate bg-transparent font-semibold text-cyan-100 outline-none sm:max-w-[190px]"
      >
        {domainOptions.map((option) => <option key={option.value} value={option.value} className="bg-[#0a1221] text-slate-100">{option.label}</option>)}
      </select>
    </label>
  );
}