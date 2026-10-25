import "server-only";
import { cookies } from "next/headers";

const COOKIE = "nm_sid";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Demo owner id from the httpOnly "nm_sid" cookie, created on first use. Every owner-scoped
 * store keys records by this id. Only call from route handlers, where cookies can be set.
 */
export async function ownerId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing && UUID.test(existing)) return existing;
  const id = crypto.randomUUID();
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
  return id;
}
