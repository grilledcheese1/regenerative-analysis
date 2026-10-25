"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DrivingProfile, ImportPreview, TripRecord, TripSummary } from "@/contracts";
import { METERS_PER_MILE } from "@/domain/driving/constants";
import { SAMPLE_DRIVES } from "@/domain/driving/samples";
import { supportsLine } from "@/domain/driving/supports";
import { SourceChip } from "../Evidence";
import styles from "./ImportDrive.module.css";
import TripPreview from "./TripPreview";
import WeeklyForm from "./WeeklyForm";

export interface ImportDriveProps {
  personaId: string;
  vehicleLabel: string;
  /** Called with a confirmed driving profile, or null to revert to the persona's estimate. */
  onProfile: (p: DrivingProfile | null) => void;
}

interface ApiError {
  error: { code: string; message: string; retryable: boolean };
}
interface Failure {
  message: string;
  retry?: () => void;
}

const DATE = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
const when = (iso: string | null) => (iso ? DATE.format(new Date(iso)) : "time not recorded");
const miles = (m: number) => `${(m / METERS_PER_MILE).toFixed(1)} mi`;
function duration(s: TripSummary["durationS"]) {
  if (!s.known) return "unknown";
  const m = Math.floor(s.value / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min ${Math.round(s.value % 60)} s`;
}
// Breaks come from long gaps and from excluded duplicate-time points; the findings say which.
const segmentsLine = (breaks: number[]) =>
  breaks.length ? `${breaks.length + 1} pieces, split at ${breaks.length} ${breaks.length === 1 ? "gap" : "gaps"}` : "1 continuous segment";

/** Drive import card at the top of the Drives tab: upload or sample → honest preview → confirm → profile. */
export default function ImportDrive({ personaId, vehicleLabel, onProfile }: ImportDriveProps) {
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [driving, setDriving] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const sampleMenu = useRef<HTMLDetailsElement>(null);

  const loadTrips = useCallback(async () => {
    try {
      const res = await fetch(`/api/drives?vehicleId=${encodeURIComponent(personaId)}`);
      if (res.ok) setTrips(((await res.json()) as { trips: TripRecord[] }).trips);
    } catch {
      // the list stays as it was; uploads report their own errors
    }
  }, [personaId]);

  useEffect(() => {
    // Fetch this owner's confirmed trips; the setState calls happen after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTrips();
  }, [loadTrips]);

  // The error renders with role="alert", which announces it; the polite region is for progress only.
  const fail = (message: string, retry?: () => void) => {
    setFailure({ message, retry });
    setAnnounce("");
  };

  async function upload(file: File, sample: boolean) {
    setBusy(`Reading ${file.name}…`);
    setFailure(null);
    setPreview(null);
    setDriving(false);
    const retry = () => void upload(file, sample);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("vehicleId", personaId);
      if (sample) form.set("sample", "1");
      const res = await fetch("/api/imports", { method: "POST", body: form });
      const body = (await res.json()) as { preview: ImportPreview } | ApiError;
      if ("error" in body) {
        if (res.status === 413) fail("Files up to 4 MiB are accepted.");
        else fail(body.error.message, body.error.retryable || res.status >= 500 ? retry : undefined);
        return;
      }
      const p = body.preview;
      setPreview(p);
      if (p.duplicateOf && p.state === "confirmed") {
        setSelected(p.tripIds?.[0] ?? null);
        setAnnounce(`Already imported on ${when(p.createdAt)}.`);
      } else setAnnounce(`Preview ready for ${p.filename}.`);
    } catch {
      fail("Couldn't reach the server.", retry);
    } finally {
      setBusy(null);
    }
  }

  async function trySample(file: string) {
    if (sampleMenu.current) sampleMenu.current.open = false;
    setBusy(`Loading ${file}…`);
    try {
      const res = await fetch(`/samples/${file}`);
      if (!res.ok) throw new Error();
      await upload(new File([await res.blob()], file, { type: "application/gpx+xml" }), true);
    } catch {
      setBusy(null);
      fail(`Couldn't load the sample ${file}.`, () => void trySample(file));
    }
  }

  async function confirm(p: ImportPreview) {
    setBusy("Confirming…");
    setFailure(null);
    try {
      const res = await fetch(`/api/imports/${p.importId}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": `confirm-${p.importId}` },
        body: JSON.stringify({ driverConfirmed: true, vehicleId: personaId }),
      });
      const body = (await res.json()) as { tripIds: string[] } | ApiError;
      if ("error" in body) {
        fail(body.error.message, body.error.retryable ? () => void confirm(p) : undefined);
        return;
      }
      await loadTrips();
      setSelected(body.tripIds[0] ?? null);
      setPreview(null);
      setAnnounce(`Trip confirmed and assigned to ${vehicleLabel}.`);
    } catch {
      fail("Couldn't reach the server.", () => void confirm(p));
    } finally {
      setBusy(null);
    }
  }

  async function cancel(p: ImportPreview) {
    setBusy("Cancelling…");
    try {
      const res = await fetch(`/api/imports/${p.importId}`, { method: "DELETE" });
      if (!res.ok) {
        fail(((await res.json()) as ApiError).error.message);
        return;
      }
      setPreview(null);
      setAnnounce("Import cancelled.");
    } catch {
      fail("Couldn't reach the server.", () => void cancel(p));
    } finally {
      setBusy(null);
    }
  }

  const items = [...trips.map((t) => t.source), ...(preview ? [preview.source] : [])];
  const allSamples = items.length > 0 && items.every((s) => s.kind === "sample");

  return (
    <section className="section" aria-labelledby="your-drives">
      <div className="section-head">
        <span className="label">Drives</span>
        <h2 id="your-drives">Your drives</h2>
        <span className="tag">{allSamples ? "Sample trips · synthetic" : "Imported trips · observed"}</span>
      </div>

      <div className="card">
        <div className={styles.actions}>
          <label className="btn primary as-label" htmlFor={`import-${personaId}`}>
            Import a drive
          </label>
          <input
            id={`import-${personaId}`}
            className={styles.file}
            type="file"
            accept=".gpx,.csv"
            disabled={!!busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f, false);
            }}
          />
          <details ref={sampleMenu} className={styles.samples}>
            <summary className="btn">Try a sample drive</summary>
            <ul>
              {SAMPLE_DRIVES.map((s) => (
                <li key={s.file}>
                  <button className="linkish" disabled={!!busy} onClick={() => void trySample(s.file)}>
                    {s.file}
                  </button>{" "}
                  <span className="muted small">{s.label}</span>
                </li>
              ))}
            </ul>
          </details>
          <button className="btn" disabled aria-describedby={`vehicle-records-${personaId}`} title="Needs a verified Toyota or insurer data format">
            Supported vehicle records (planned integration)
          </button>
        </div>
        <p id={`vehicle-records-${personaId}`} className="muted small">
          GPX, or CSV with the header <span className={`mono ${styles.header}`}>timestamp,latitude,longitude,speedMps,horizontalAccuracyMeters,altitudeMeters</span>. Vehicle
          records need a verified Toyota or insurer data format and aren&apos;t connected.
        </p>

        <div aria-live="polite" className={styles.live}>
          {announce}
        </div>
        {busy && <p className="muted">{busy}</p>}
        {failure && (
          <p className={`notice ${styles.error}`} role="alert">
            {failure.message}{" "}
            {failure.retry && (
              <button className="linkish" onClick={failure.retry}>
                Retry
              </button>
            )}
          </p>
        )}

        {preview && (
          <div className={styles.previewCard} data-testid="import-preview">
            {preview.duplicateOf && preview.state === "confirmed" ? (
              <p className="notice">Already imported on {when(preview.createdAt)}. The trip is selected below.</p>
            ) : (
              <>
                <div className={styles.previewGrid}>
                  <TripPreview geometry={preview.previewGeometry} segmentBreaks={preview.segmentBreaks} label={`Route of ${preview.filename}`} />
                  <div>
                    <p className={styles.supports}>{supportsLine(preview.quality)}</p>
                    <dl className={styles.facts}>
                      <dt>Date</dt>
                      <dd>{when(preview.summary.startAt)}</dd>
                      <dt>Distance</dt>
                      <dd className="mono">{miles(preview.summary.distanceMeters)}</dd>
                      <dt>Duration</dt>
                      <dd className="mono">{duration(preview.summary.durationS)}</dd>
                      <dt>Samples used</dt>
                      <dd className="mono">
                        {preview.summary.usedSampleCount.toLocaleString()} / {preview.summary.originalSampleCount.toLocaleString()}
                      </dd>
                      <dt>Segments</dt>
                      <dd>{segmentsLine(preview.segmentBreaks)}</dd>
                      <dt>Source</dt>
                      <dd>
                        <SourceChip source={preview.source.mode} /> <span className="muted small">{preview.filename}</span>
                      </dd>
                      {preview.summary.cityShare.known && (
                        <>
                          <dt>City driving</dt>
                          <dd>
                            <span className="mono">{Math.round(preview.summary.cityShare.value * 100)}%</span> <SourceChip source="modeled" />
                          </dd>
                        </>
                      )}
                    </dl>
                    {preview.summary.sharpDecelEvents.known && (
                      <p className="small" data-testid="decel-events">
                        {preview.summary.sharpDecelEvents.value} sharp deceleration{preview.summary.sharpDecelEvents.value === 1 ? "" : "s"} observed in this
                        recording
                      </p>
                    )}
                  </div>
                </div>
                {preview.quality.findings.length > 0 && (
                  <ul className={styles.findings}>
                    {preview.quality.findings.map((f) => (
                      <li key={f.code}>{f.message}</li>
                    ))}
                  </ul>
                )}

                {preview.state === "preview_ready" && (
                  <div className={styles.confirmRow}>
                    {!preview.quality.routeAvailable && <p className="notice">Not enough usable points to save this as a trip.</p>}
                    <label className="check">
                      <input type="checkbox" checked={driving} onChange={(e) => setDriving(e.target.checked)} /> I was driving (not a passenger)
                    </label>
                    <p className="small">Assign to {vehicleLabel}</p>
                    <div className={styles.actions}>
                      <button className="btn primary" disabled={!driving || !preview.quality.routeAvailable || !!busy} onClick={() => void confirm(preview)}>
                        Confirm
                      </button>
                      <button className="btn" disabled={!!busy} onClick={() => void cancel(preview)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {trips.length > 0 && (
          <>
            <h3 className={styles.h3}>Confirmed trips</h3>
            <ul className={styles.trips} aria-label="Confirmed trips">
              {trips.map((t) => (
                <li key={t.tripId} className={t.tripId === selected ? styles.selected : undefined} aria-current={t.tripId === selected || undefined}>
                  <span>{when(t.summary.startAt)}</span>
                  <strong className="mono">{miles(t.summary.distanceMeters)}</strong>
                  <SourceChip source={t.source.mode} />
                  <span className="muted small">{supportsLine(t.quality)}</span>
                </li>
              ))}
            </ul>
            <WeeklyForm
              vehicleId={personaId}
              trips={trips}
              onUse={(p) => {
                onProfile(p);
                setAnnounce(p.monthlyMiles.known ? `Comparison now uses ${p.monthlyMiles.value} miles a month.` : "Comparison updated.");
              }}
              onRevert={() => {
                onProfile(null);
                setAnnounce("Comparison reverted to the persona estimate.");
              }}
            />
          </>
        )}
      </div>
    </section>
  );
}
