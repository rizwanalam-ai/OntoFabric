type PrivacyShieldBadgeProps = {
  redactedCount: number;
};

export function PrivacyShieldBadge({ redactedCount }: PrivacyShieldBadgeProps) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100" role="status" aria-live="polite">
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-emerald-200/40 text-[11px]" aria-hidden="true">&#x1F6E1;</span>
      <span><strong className="font-semibold">PHI/PII Shield Active</strong><span className="ml-2 text-emerald-200/75">{redactedCount} token{redactedCount === 1 ? '' : 's'} redacted</span></span>
    </div>
  );
}
