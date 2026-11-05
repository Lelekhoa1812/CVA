type MobileSearchBarProps = {
  isSearching: boolean;
  canSearch: boolean;
  onCancel: () => void;
  onReset: () => void;
};

export default function MobileSearchBar({ isSearching, canSearch, onCancel, onReset }: MobileSearchBarProps) {
  return (
    <div className="glass-panel fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex gap-2 rounded-full p-2 sm:hidden">
      <button
        className="button-primary min-h-11 min-w-0 flex-1 disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        form="job-search-form"
        disabled={!canSearch}
      >
        {isSearching ? "Searching…" : "Search"}
      </button>
      {isSearching ? (
        <button className="button-secondary min-h-11 shrink-0 px-4" type="button" onClick={onCancel}>
          Cancel
        </button>
      ) : (
        <button className="button-secondary min-h-11 shrink-0 px-4" type="button" onClick={onReset}>
          Reset
        </button>
      )}
    </div>
  );
}
