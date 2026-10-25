import { z } from "zod";
import { accountCount, AuthNotConfigured, findAccountByEmail, toPublic } from "@/server/auth/accounts";
import { verifyPassword } from "@/server/auth/password";
import { startSession } from "@/server/auth/session";
import { apiError, newRequestId } from "@/server/http";

const Body = z.object({ email: z.string().max(320), password: z.string().max(200) });
const MESSAGE = "Email or password is incorrect";
const RESET_HINT = "Accounts reset when the demo server restarts. Create it again.";

/** Signs in to a demo account. Unknown email and wrong password get the same answer. */
export async function POST(request: Request) {
  const requestId = newRequestId();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, "invalid_request", "Expected { email, password }", false, requestId);
  const record = findAccountByEmail(parsed.data.email);
  const ok = record ? await verifyPassword(parsed.data.password, record.passwordHash) : false;
  if (!record || !ok) {
    const hint = accountCount() === 0 ? RESET_HINT : undefined;
    return Response.json({ error: { code: "invalid_credentials", message: MESSAGE, retryable: false, requestId, ...(hint && { hint }) } }, { status: 401 });
  }
  try {
    const account = toPublic(record);
    await startSession(account);
    return Response.json({ requestId, account });
  } catch (e) {
    if (e instanceof AuthNotConfigured) return apiError(500, "auth_not_configured", "Sign-in isn't configured on this server (AUTH_SECRET)", false, requestId);
    throw e;
  }
}
