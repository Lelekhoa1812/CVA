type AdvancedTraceView = {
  roleFocus?: string;
  missingCriticalRequirements?: string[];
  supplementalEvidenceTitles?: string[];
  uncoveredRequirements?: string[];
  reviewerNotes?: string[];
  finalEvidenceCount?: number;
  coverageSummary?: string[];
};

export default function TracePanel({ trace, title }: { trace: AdvancedTraceView | null; title: string }) {
  if (!trace) return null;

  const supplemental = trace.supplementalEvidenceTitles || [];
  const gaps = trace.missingCriticalRequirements || [];
  const uncovered = trace.uncoveredRequirements || [];
  const reviewerNotes = trace.reviewerNotes || [];
  const coverage = trace.coverageSummary || [];
  const gapItems = [...gaps, ...uncovered, ...reviewerNotes];

  return (
    <div className="min-w-0 space-y-4 rounded-[1.4rem] border border-primary/25 bg-primary/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-foreground break-words text-sm font-semibold">{title}</p>
          {trace.roleFocus ? <p className="text-muted-foreground mt-1 break-words text-xs leading-6">{trace.roleFocus}</p> : null}
        </div>
        <span className="metric-chip shrink-0">{trace.finalEvidenceCount || 0} evidence</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="surface-subtle min-w-0 rounded-2xl p-3">
          <p className="text-muted-foreground text-[11px] uppercase tracking-[0.18em]">Added evidence</p>
          {supplemental.length ? (
            <ul className="text-muted-foreground mt-2 space-y-1 text-xs leading-6">
              {supplemental.slice(0, 4).map((item, index) => (
                <li key={`${item}-${index}`} className="break-words">• {item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-2 text-xs leading-6">No extra evidence was needed.</p>
          )}
        </div>

        <div className="surface-subtle min-w-0 rounded-2xl p-3">
          <p className="text-muted-foreground text-[11px] uppercase tracking-[0.18em]">Gap review</p>
          {gapItems.length ? (
            <ul className="text-muted-foreground mt-2 space-y-1 text-xs leading-6">
              {gapItems.slice(0, 4).map((item, index) => (
                <li key={`${item}-${index}`} className="break-words">• {item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-2 text-xs leading-6">No critical unsupported gap remained.</p>
          )}
        </div>
      </div>

      {coverage.length ? (
        <div className="flex flex-wrap gap-2">
          {coverage.slice(0, 6).map((item, index) => (
            <span key={`${item}-${index}`} className="metric-chip max-w-full whitespace-normal break-words bg-[hsl(var(--surface-1)/0.7)]">
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
