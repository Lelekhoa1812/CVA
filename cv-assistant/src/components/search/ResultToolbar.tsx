import type { ReactNode } from "react";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  POSTED_WITHIN_OPTIONS,
  WORKPLACE_MODE_OPTIONS,
  type EmploymentType,
  type PostedWithin,
  type WorkplaceMode,
} from "@/lib/search/types";
import {
  MATCH_FILTER_OPTIONS,
  PLATFORM_FILTER_OPTIONS,
  type MatchFilter,
  type PlatformFilter,
  type ResultFilters,
  employmentLabels,
  matchLabels,
  platformLabels,
  postedLabels,
  workplaceLabels,
} from "@/components/search/labels";

type ResultToolbarProps = {
  filters: ResultFilters;
  onChange: (filters: ResultFilters) => void;
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

function FilterFields({ filters, onChange }: ResultToolbarProps) {
  return (
    <>
      <FilterField
        label="Match"
        value={filters.match}
        onChange={(value) => onChange({ ...filters, match: value as MatchFilter })}
      >
        {MATCH_FILTER_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {matchLabels[value]}
          </option>
        ))}
      </FilterField>
      <FilterField
        label="Platform"
        value={filters.platform}
        onChange={(value) => onChange({ ...filters, platform: value as PlatformFilter })}
      >
        {PLATFORM_FILTER_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {platformLabels[value]}
          </option>
        ))}
      </FilterField>
      <FilterField
        label="Posted"
        value={filters.postedWithin}
        onChange={(value) => onChange({ ...filters, postedWithin: value as PostedWithin })}
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
        onChange={(value) => onChange({ ...filters, workplaceMode: value as WorkplaceMode })}
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
        onChange={(value) => onChange({ ...filters, employmentType: value as EmploymentType })}
      >
        {EMPLOYMENT_TYPE_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {employmentLabels[value]}
          </option>
        ))}
      </FilterField>
    </>
  );
}

export default function ResultToolbar(props: ResultToolbarProps) {
  return (
    <div className="min-w-0">
      <details className="surface-subtle rounded-2xl px-3 sm:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
          Refine
        </summary>
        <div className="grid min-w-0 gap-3 pb-3">
          <FilterFields {...props} />
        </div>
      </details>
      <div className="hidden min-w-0 gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-5">
        <FilterFields {...props} />
      </div>
    </div>
  );
}
