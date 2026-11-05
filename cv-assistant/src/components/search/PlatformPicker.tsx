import { SEARCH_SOURCES, SOURCE_LABELS, type SearchSource } from "@/lib/search/types";
import { cn } from "@/lib/utils";

type PlatformPickerProps = {
  selectedSources: SearchSource[];
  allSelected: boolean;
  onToggleAll: (checked: boolean) => void;
  onToggleSource: (source: SearchSource, checked: boolean) => void;
};

function chipClass(selected: boolean) {
  return cn(
    "inline-flex min-h-11 max-w-full items-center rounded-full border px-3 text-sm font-medium",
    selected
      ? "border-[hsl(var(--primary)/0.45)] bg-[hsl(var(--primary)/0.12)] text-foreground"
      : "border-border bg-[hsl(var(--surface-1)/0.72)] text-muted-foreground",
  );
}

export default function PlatformPicker({
  selectedSources,
  allSelected,
  onToggleAll,
  onToggleSource,
}: PlatformPickerProps) {
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      <button
        className={chipClass(allSelected)}
        type="button"
        aria-pressed={allSelected}
        onClick={() => onToggleAll(!allSelected)}
      >
        All
      </button>
      {SEARCH_SOURCES.map((source) => {
        const selected = selectedSources.includes(source);
        return (
          <button
            key={source}
            className={chipClass(selected)}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggleSource(source, !selected)}
          >
            {SOURCE_LABELS[source]}
          </button>
        );
      })}
    </div>
  );
}
