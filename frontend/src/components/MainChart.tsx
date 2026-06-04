import { Panel, PlaceholderBody } from "./Panel";

// Placeholder for the selected-ticker chart (owned by fin-novp). The watchlist
// (fin-4u3q) drives the shared `selected` ticker; the full chart lands later.
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
