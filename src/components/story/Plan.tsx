"use client";

import { useState } from "react";
import type { CompareRequest, Comparison } from "@/contracts";
import { NEXT_ACTION_LABEL } from "@/domain/recommendations/recommend";
import { EvidenceList } from "../next-move/Evidence";
import AiExplanation from "../next-move/explain/AiExplanation";
import DealerList from "../next-move/market/DealerList";
import { ACTION_STEPS } from "../next-move/screens";
import { StaggerItem, StaggerList } from "./motion";
import StorySection from "./StorySection";

/** Slide 5. The recommendation, why, and one concrete next step. */
export default function Plan({ comparison, compareRequest }: { comparison: Comparison; compareRequest: CompareRequest }) {
  const r = comparison.recommendation;
  const step = ACTION_STEPS[r.nextAction];
  const [highlight, setHighlight] = useState<string[]>([]);
  const facts = comparison.evidence.filter((e) => r.evidenceIds.includes(e.id));

  return (
    <StorySection id="plan" kicker="Your next move" title={r.headline}>
      <p className="plan__status"><span className={`status status-${r.status}`}>{r.status.replaceAll("_", " ")}</span> {NEXT_ACTION_LABEL[r.nextAction]}</p>
      <StaggerList as="ul" className="plan__why" inView>
        {r.explanation.map((l) => (
          <StaggerItem as="li" key={l}>{l}</StaggerItem>
        ))}
      </StaggerList>
      {r.missingInputs.length > 0 && <p className="plan__note">Still needed: {r.missingInputs.map((m) => m.replaceAll("_", " ")).join(", ")}</p>}
      <ol className="actions">
        {step.checklist.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      {step.href ? (
        <a className="actionrow actionrow--main" href={step.href} target="_blank" rel="noreferrer">
          {step.cta} <span className="actionrow__arrow" aria-hidden="true">↗</span>
        </a>
      ) : (
        <p className="actionrow actionrow--main">{step.cta}</p>
      )}
      <p className="muted small">{step.href ? "Opens the official self-service page. Nothing is requested or submitted for you." : "A preparation checklist. Nothing is submitted on your behalf."}</p>
      {(r.nextAction === "compare_confirmed_offers" || r.nextAction === "request_buyout_quote") && <DealerList near="Austin, TX" />}
      <AiExplanation request={compareRequest} recommendation={r} evidence={comparison.evidence} onCite={setHighlight} />
      <details className="m-facts">
        <summary>Facts behind this</summary>
        <EvidenceList facts={facts} highlight={highlight} />
      </details>
      <p className="m-disclaimer">Based on simulated data and estimates. Not a Toyota offer, quote or credit decision.</p>
    </StorySection>
  );
}
