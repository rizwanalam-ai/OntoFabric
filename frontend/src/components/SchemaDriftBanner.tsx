export type SchemaDriftResult = {
  healedMappings: Record<string, string>;
  unmappedKeys: string[];
  missingProperties: string[];
  schemaUpdated: boolean;
};

type SchemaDriftBannerProps = {
  result: SchemaDriftResult;
  onDismiss: () => void;
};

export function SchemaDriftBanner({ result, onDismiss }: SchemaDriftBannerProps) {
  const hasUnresolved = result.unmappedKeys.length > 0;
  return (
    <div className={`rounded-xl border px-3 py-3 text-xs ${hasUnresolved ? 'border-amber-300/30 bg-amber-300/10 text-amber-100' : 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'}`} role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{hasUnresolved ? 'Schema drift detected' : 'Schema drift auto-healed'}</p>
          <p className="mt-1 text-[11px] opacity-80">{Object.keys(result.healedMappings).length} mapping{Object.keys(result.healedMappings).length === 1 ? '' : 's'} healed{hasUnresolved ? `, ${result.unmappedKeys.length} key${result.unmappedKeys.length === 1 ? '' : 's'} need review` : '.'}</p>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss schema drift notice" className="text-lg leading-none opacity-70 hover:opacity-100">&times;</button>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer font-semibold underline decoration-current/30 underline-offset-2">Review Auto-Healed Schema</summary>
        <div className="mt-2 space-y-2 border-t border-current/15 pt-2 text-[11px]">
          {Object.keys(result.healedMappings).length > 0 && <div><span className="font-semibold">Auto-healed:</span> {Object.entries(result.healedMappings).map(([incoming, target]) => <span key={incoming} className="mr-2 inline-block rounded bg-black/15 px-1.5 py-0.5 font-mono">{incoming} &rarr; {target}</span>)}</div>}
          {hasUnresolved && <div><span className="font-semibold">Unmapped:</span> {result.unmappedKeys.join(', ')}</div>}
          {result.missingProperties.length > 0 && <div><span className="font-semibold">Missing:</span> {result.missingProperties.join(', ')}</div>}
        </div>
      </details>
    </div>
  );
}
