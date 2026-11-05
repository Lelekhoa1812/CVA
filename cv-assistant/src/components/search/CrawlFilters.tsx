import type { ReactNode } from "react";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  MAX_RESULTS_OPTIONS,
  POSTED_WITHIN_OPTIONS,
  WORKPLACE_MODE_OPTIONS,
  type MaxResultsPerSource,
  type SearchFilters,
} from "@/lib/search/types";
import { employmentLabels, postedLabels, workplaceLabels } from "@/components/search/labels";

type CrawlFiltersProps = {
  filters: SearchFilters;
  maxResultsPerSource: MaxResultsPerSource;
  onFiltersChange: (filters: SearchFilters) => void;
  onMaxResultsChange: (value: MaxResultsPerSource) => void;
};

function FilterField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="min-w-0 space-y-1.5">
      <span className="text-muted-foreground block text-xs font-medium">{label}</span>
      <select className="input-premium min-h-11 min-w-0" value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function FilterFields({ filters, maxResultsPerSource, onFiltersChange, onMaxResultsChange }: CrawlFiltersProps) {
  return (
    <>
      <FilterField
        label="Posted"
        value={filters.postedWithin}
        onChange={(value) =>
          onFiltersChange({ ...filters, postedWithin: value as SearchFilters["postedWithin"] })
        }
      >
        {POSTED_WITHIN_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {postedLabels[value]}
          </option>
        ))}
      </FilterField>
      <FilterField
        label="Workplace"
        value={filters.workplaceMode}
        onChange={(value) =>
          onFiltersChange({ ...filters, workplaceMode: value as SearchFilters["workplaceMode"] })
        }
      >
        {WORKPLACE_MODE_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {workplaceLabels[value]}
          </option>
        ))}
      </FilterField>
      <FilterField
        label="Type"
        value={filters.employmentType}
        onChange={(value) =>
          onFiltersChange({ ...filters, employmentType: value as SearchFilters["employmentType"] })
        }
      >
        {EMPLOYMENT_TYPE_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {employmentLabels[value]}
          </option>
        ))}
      </FilterField>
      <FilterField
        label="Max"
        value={String(maxResultsPerSource)}
        onChange={(value) => onMaxResultsChange(Number(value) as MaxResultsPerSource)}
      >
        {MAX_RESULTS_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {value} results
          </option>
        ))}
      </FilterField>
    </>
  );
}

export default function CrawlFilters(props: CrawlFiltersProps) {
  const active = [
    props.filters.postedWithin !== "any" ? postedLabels[props.filters.postedWithin] : null,
    props.filters.workplaceMode !== "any" ? workplaceLabels[props.filters.workplaceMode] : null,
    props.filters.employmentType !== "any" ? employmentLabels[props.filters.employmentType] : null,
    props.maxResultsPerSource !== 50 ? `${props.maxResultsPerSource} max` : null,
  ].filter(Boolean);

  return (
    <div className="min-w-0">
      <details className="surface-subtle rounded-2xl px-3 sm:hidden">
        <summary className="flex min-h-11 min-w-0 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
          <span>Filters</span>
          <span className="text-muted-foreground min-w-0 truncate text-xs font-normal">
            {active.length ? active.join(" · ") : "Any"}
          </span>
        </summary>
        <div className="grid min-w-0 gap-3 pb-3">
          <FilterFields {...props} />
        </div>
      </details>
      <div className="hidden min-w-0 gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-4">
        <FilterFields {...props} />
      </div>
    </div>
  );
}
