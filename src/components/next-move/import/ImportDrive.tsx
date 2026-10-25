"use client";

import type { DrivingProfile } from "@/contracts";

export interface ImportDriveProps {
  personaId: string;
  vehicleLabel: string;
  /** Called with a confirmed driving profile, or null to revert to the persona's estimate. */
  onProfile: (p: DrivingProfile | null) => void;
}

/**
 * Drive import card, already mounted at the top of the Drives tab.
 * STUB: renders nothing until the drive-imports stream implements it (docs/workstreams/1-drive-imports.md).
 */
export default function ImportDrive(props: ImportDriveProps) {
  void props;
  return null;
}
