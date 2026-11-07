"use client";

export default function AutoApplyError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page-shell">
      <div role="alert" className="surface-subtle mx-auto max-w-lg space-y-3 rounded-3xl p-6 text-center">
        <h1 className="text-foreground font-display text-2xl">Auto Apply hit a problem</h1>
        <p className="text-muted-foreground text-sm leading-6">Your applications are safe. Reload the workspace to try again.</p>
        {error.digest ? <p className="text-muted-foreground text-xs">Reference: {error.digest}</p> : null}
        <button type="button" className="button-primary min-h-11" onClick={reset}>Reload workspace</button>
      </div>
    </main>
  );
}
