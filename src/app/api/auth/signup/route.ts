import { z } from "zod";
import { AuthNotConfigured, createAccount, toPublic } from "@/server/auth/accounts";
import { startSession } from "@/server/auth/session";
import { apiError, newRequestId } from "@/server/http";
import { fieldErrors } from "@/server/records";

const Body = z.object({
  name: z.string().trim().min(1, "Enter your name").max(60, "Use 60 characters or fewer"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").max(200, "Use 200 characters or fewer"),
});

/** Creates a demo account and signs it in. */
export async function POST(request: Request) {
  const requestId = newRequestId();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid_request", "Check the highlighted fields", false, requestId, fieldErrors(parsed.error.issues));
  try {
    const created = await createAccount(parsed.data);
    if (created === "email_taken") return apiError(409, "email_taken", "An account with this email already exists", false, requestId, { email: "Already registered" });
    const account = toPublic(created);
    await startSession(account);
    return Response.json({ requestId, account }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthNotConfigured) return apiError(500, "auth_not_configured", "Sign-up isn't configured on this server (AUTH_SECRET)", false, requestId);
    throw e;
  }
}
