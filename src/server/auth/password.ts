import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_BYTES = 64;

/** Salted scrypt hash, stored as `scrypt$<salt>$<hash>` (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_BYTES);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/** Constant-time check; false for anything that isn't a hash this module made. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  if (expected.length !== KEY_BYTES) return false;
  const key = await scryptAsync(password, Buffer.from(saltB64, "base64url"), KEY_BYTES);
  return timingSafeEqual(key, expected);
}
