import type { EvidenceFact, SourceKind } from "@/contracts";

const SOURCE_LABEL: Record<SourceKind, string> = {
  observed: "Observed",
  user_reported: "User reported",
  derived: "Derived",
  modeled: "Modeled",
  synthetic: "Synthetic",
};

export function SourceChip({ source }: { source: SourceKind }) {
  return <span className={`chip chip-${source}`}>{SOURCE_LABEL[source]}</span>;
}

/** One evidence list used everywhere: value, where it came from, and the formula if derived. */
export function EvidenceList({ facts, highlight = [] }: { facts: EvidenceFact[]; highlight?: string[] }) {
  return (
    <ul className="evidence-list">
      {facts.map((f) => (
        <li key={f.id} className={highlight.includes(f.id) ? "hl" : undefined}>
          <div className="ev-row">
            <span>{f.label}</span>
            <strong className="mono">{f.display}</strong>
          </div>
          <div className="ev-meta">
            <SourceChip source={f.source} />
            {f.formula && <span className="muted mono">{f.formula}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
