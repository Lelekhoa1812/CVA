import type { ReactNode } from "react";

export default function ResultBlock({
  loading,
  loadingLabel,
  text,
  warning,
  emptyTitle,
  emptyDescription,
  actions,
  notice,
  maxHeightClass,
}: {
  loading: boolean;
  loadingLabel: string;
  text: string;
  warning?: string;
  emptyTitle: string;
  emptyDescription: string;
  actions?: ReactNode;
  notice?: string;
  maxHeightClass: string;
}) {
  return (
    <div className="result-well min-w-0 rounded-[1.4rem] p-4">
      {loading ? (
        <p role="status" className="text-muted-foreground py-8 text-center text-sm leading-6">
          {loadingLabel}
        </p>
      ) : text ? (
        <div className="min-w-0 space-y-4">
          <p className="text-muted-foreground text-xs leading-6">Review the draft and check every claim before sending it.</p>
          {warning ? (
            <p
              role="status"
              className="break-words rounded-xl border border-[hsl(var(--warm)/0.45)] bg-[hsl(var(--warm)/0.14)] p-3 text-sm leading-6 text-foreground"
            >
              {warning}
            </p>
          ) : null}
          <div className={`text-foreground max-w-3xl overflow-auto whitespace-pre-wrap break-words text-sm leading-8 ${maxHeightClass}`}>
            {text}
          </div>
          {actions ? (
            <div role="group" aria-label="Draft actions" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {actions}
            </div>
          ) : null}
          {notice ? <p className="text-muted-foreground text-sm leading-6">{notice}</p> : null}
        </div>
      ) : (
        <div className="space-y-2 py-6 text-center sm:py-8">
          <p className="text-foreground font-medium">{emptyTitle}</p>
          <p className="text-muted-foreground text-sm leading-6">{emptyDescription}</p>
          {notice ? <p className="text-muted-foreground text-sm leading-6">{notice}</p> : null}
        </div>
      )}
    </div>
  );
}
