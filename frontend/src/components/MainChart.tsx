import { Panel, PlaceholderBody } from "./Panel";

// Placeholder for the selected-ticker chart (owned by fin-novp). It reads the
// shared selection set by the watchlist so the cross-panel wiring is visible
// until the real chart lands.
export function MainChart({ selected }: { selected?: string | null }) {
  return (
    <Panel title={selected ? `Chart · ${selected}` : "Chart"} className="min-h-0">
      <PlaceholderBody
        note={
          selected
            ? `${selected} selected — chart coming soon`
            : "Select a ticker to view its chart"
        }
      />
    </Panel>
  );
}
