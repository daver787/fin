// Shared dashboard panel chrome. Region components wrap their content in <Panel>
// so the layout stays visually consistent; downstream issues fill in the body.

interface PanelProps {
  title: string;
  /** Optional right-aligned header content (counts, controls, etc.). */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function Panel({ title, action, className, children }: PanelProps) {
  return (
    <section className={`panel ${className ?? ""}`}>
      <div className="panel-header">
        <span>{title}</span>
        {action}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

/** Placeholder body for regions not yet implemented by their owning issue. */
export function PlaceholderBody({ note }: { note: string }) {
  return (
    <div className="flex h-full min-h-[60px] items-center justify-center text-center text-xs text-text-faint">
      {note}
    </div>
  );
}
