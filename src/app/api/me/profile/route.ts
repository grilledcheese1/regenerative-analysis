import { z } from "zod";
import { validateAnswers } from "@/domain/onboarding/validate";
import { currentAccount } from "@/server/auth/session";
import { apiError, newRequestId } from "@/server/http";
import { AnswersSchema, BankingSchema } from "@/server/onboarding/schema";
import { loadProfile, saveProfile } from "@/server/profiles";
import { fieldErrors } from "@/server/records";

const Body = z.object({ answers: AnswersSchema, banking: BankingSchema });

/** The signed-in account's onboarding profile. 404 means "not onboarded here": the browser re-sends its copy. */
export async function GET() {
  const requestId = newRequestId();
  const account = await currentAccount();
  if (!account) return apiError(401, "signed_out", "Sign in first", false, requestId);
  const stored = loadProfile(account.accountId);
  if (!stored) return apiError(404, "no_profile", "No profile on this server yet", false, requestId);
  return Response.json({ requestId, profile: stored.profile });
}

export async function PUT(request: Request) {
  const requestId = newRequestId();
  const account = await currentAccount();
  if (!account) return apiError(401, "signed_out", "Sign in first", false, requestId);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid_request", "Check your answers", false, requestId, fieldErrors(parsed.error.issues));
  const errors = validateAnswers(parsed.data.answers);
  if (Object.keys(errors).length) return apiError(400, "invalid_request", "Check your answers", false, requestId, errors);
  const stored = saveProfile(account.accountId, parsed.data.answers, parsed.data.banking);
  return Response.json({ requestId, profile: stored.profile });
}
