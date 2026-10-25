// The synthetic sample drives committed in public/samples/ (built by scripts/make-sample-drives.mjs).
// The import route only accepts sample=1 for these names; tests check the list matches the folder.

export const SAMPLE_DRIVES = [
  { file: "maria-commute-am.gpx", label: "Maria · morning commute" },
  { file: "maria-commute-pm.gpx", label: "Maria · evening commute" },
  { file: "devon-errand.gpx", label: "Devon · short errand" },
  { file: "kai-highway.gpx", label: "Kai · faster roads" },
  { file: "sparse-no-time.gpx", label: "Sparse, no timestamps" },
  { file: "gap-and-noise.gpx", label: "Gap and noisy timestamps" },
] as const;

export const isSampleFile = (name: string) => SAMPLE_DRIVES.some((s) => s.file === name);
