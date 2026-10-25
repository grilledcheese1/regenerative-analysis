import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionPayload {
  accountId: string;
  email: string;
  name: string;
  exp: number; // Unix seconds
}

const mac = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest();

/** `<base64url(JSON)>.<base64url(HMAC-SHA256)>` */
export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body, secret).toString("base64url")}`;
}

/** The payload when the signature matches and it hasn't expired; null for anything else. */
export function verifySession(token: string | undefined, secret: string, nowSec = Math.floor(Date.now() / 1000)): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const given = Buffer.from(sig, "base64url");
  const expected = mac(body, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof p.accountId !== "string" || typeof p.exp !== "number" || p.exp < nowSec) return null;
    return p;
  } catch {
    return null;
  }
}
