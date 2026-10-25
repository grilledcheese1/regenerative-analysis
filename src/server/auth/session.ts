import "server-only";
import { cookies } from "next/headers";
import { authSecret, type PublicAccount } from "./accounts";
import { signSession, verifySession } from "./token";

const COOKIE = "nm_account";
const MAX_AGE = 60 * 60 * 24 * 30;

/** The signed-in demo account, from the signed `nm_account` cookie. Bad or expired → null. */
export async function currentAccount(): Promise<PublicAccount | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  let secret: string;
  try {
    secret = authSecret();
  } catch {
    return null;
  }
  const p = verifySession(token, secret);
  return p ? { accountId: p.accountId, email: p.email, name: p.name } : null;
}

/** Sets the session cookie. Throws AuthNotConfigured in production without AUTH_SECRET. */
export async function startSession(account: PublicAccount): Promise<void> {
  const token = signSession({ ...account, exp: Math.floor(Date.now() / 1000) + MAX_AGE }, authSecret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).set(COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}
