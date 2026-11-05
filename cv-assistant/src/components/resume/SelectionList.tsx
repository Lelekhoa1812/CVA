import { cn } from "@/lib/utils";

type SelectionItem = {
  index: number;
  title: string;
  summary?: string;
};

type SelectionListProps = {
  title: string;
  items: SelectionItem[];
  selected: number[];
  disabled?: boolean;
  emptyLabel: string;
  onToggle: (index: number) => void;
};

function CheckMark() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SelectionList({ title, items, selected, disabled = false, emptyLabel, onToggle }: SelectionListProps) {
  return (
    <div className="min-w-0 space-y-3">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="max-h-80 space-y-2 overflow-auto pr-1">
          {items.map((item) => {
            const isSelected = selected.includes(item.index);
            return (
              <button
                key={item.index}
                type="button"
                aria-pressed={isSelected}
                disabled={disabled}
                onClick={() => onToggle(item.index)}
                className={cn(
                  "flex w-full min-w-0 items-start gap-3 rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60",
                  isSelected ? "border-primary/50 bg-primary/10" : "border-border hover:bg-muted/60",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                    isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                  )}
                >
                  {isSelected ? <CheckMark /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block break-words font-medium text-foreground">{item.title}</span>
                  {item.summary ? (
                    <span className="mt-1 block whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.summary}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
