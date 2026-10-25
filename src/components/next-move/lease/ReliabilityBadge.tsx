import type { ReliabilityInfo } from "@/contracts";
import { niceDate } from "@/domain/format";
import { SourceChip } from "../Evidence";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** NHTSA recall and complaint counts for this car's model year. */
export default function ReliabilityBadge({ r }: { r: ReliabilityInfo }) {
  if (r.recalls === null || r.complaints === null) return <p className="reliability muted small">No NHTSA data for this model year.</p>;
  return (
    <p className="reliability small">
      NHTSA: {plural(r.recalls, "recall")} · {plural(r.complaints, "complaint")} <SourceChip source="observed" />{" "}
      <span className="muted">model year, as of {niceDate(r.retrievedAt)}</span>
    </p>
  );
}
