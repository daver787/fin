import { Panel, PlaceholderBody } from "./Panel";

// Placeholder for the selected-ticker chart (owned by fin-novp).
export function MainChart() {
  return (
    <Panel title="Chart" className="min-h-0">
      <PlaceholderBody note="Select a ticker to view its chart" />
    </Panel>
  );
}
