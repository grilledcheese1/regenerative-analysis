import { z } from "zod";
import { CONSENT_VERSION, type ConsentPurpose, type ConsentRecord, type ConsentState } from "@/contracts";
import { apiError, newRequestId } from "@/server/http";
import { consents, fieldErrors } from "@/server/records";
import { ownerId } from "@/server/session";

const PURPOSES: ConsentPurpose[] = ["driving_analysis", "banking_analysis", "insurer_sharing"];
const Body = z.object({ purpose: z.enum(["driving_analysis", "banking_analysis", "insurer_sharing"]), granted: z.boolean() });

function state(owner: string, requestId: string): ConsentState {
  const history = consents.list(owner); // newest first
  const effective = Object.fromEntries(
    PURPOSES.map((p) => {
      const latest = history.find((r) => r.purpose === p);
      return [p, latest ? { granted: latest.granted, version: latest.version, at: latest.at } : null];
    }),
  ) as ConsentState["effective"];
  return { requestId, effective, history };
}

export async function GET() {
  const owner = await ownerId();
  return Response.json(state(owner, newRequestId()));
}

/** Appends a purpose-specific consent record. Revoking stops future use; it doesn't erase data. */
export async function PUT(request: Request) {
  const owner = await ownerId();
  const requestId = newRequestId();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, "invalid_request", "Expected { purpose, granted }", false, requestId, fieldErrors(parsed.error.issues));
  }
  const { purpose, granted } = parsed.data;
  if (purpose === "insurer_sharing" && granted) {
    return apiError(403, "purpose_not_available", "Planned integration. No insurer receives data from this demo", false, requestId);
  }
  const at = new Date().toISOString();
  const record: ConsentRecord = { purpose, granted, version: CONSENT_VERSION, at, source: "settings_screen" };
  consents.put(owner, `${purpose}:${at}:${crypto.randomUUID().slice(0, 8)}`, record);
  return Response.json({
    ...state(owner, requestId),
    note: granted ? undefined : "Future use stops now. Data already here stays until you delete it.",
  });
}
