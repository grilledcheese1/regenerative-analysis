import "server-only";
import { sha256Hex } from "./hash";
import { ownedStore } from "./store";

export const newRequestId = () => "req_" + crypto.randomUUID().slice(0, 8);

/** The one error shape every route returns. Never include provider credentials or raw traces. */
export function apiError(
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  requestId: string,
  fieldErrors?: Record<string, string>,
): Response {
  return Response.json({ error: { code, message, retryable, requestId, ...(fieldErrors && { fieldErrors }) } }, { status });
}

interface StoredResponse {
  bodyHash: string;
  status: number;
  body: string;
}

const idempotency = ownedStore<StoredResponse>("idempotency", { maxPerOwner: 200 });

/**
 * Idempotency-Key handling for retryable mutations. Same key + same body replays the stored
 * response; same key + a different body is a 409. Only 2xx responses are stored.
 * `run` receives the parsed JSON body (null when the body isn't JSON).
 */
export async function withIdempotency(
  req: Request,
  owner: string,
  route: string,
  run: (body: unknown) => Promise<Response>,
): Promise<Response> {
  const raw = await req.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }

  const key = req.headers.get("idempotency-key");
  if (!key) return run(body);

  const id = `${route}:${key}`;
  const bodyHash = sha256Hex(raw);
  const prior = idempotency.get(owner, id);
  if (prior) {
    if (prior.bodyHash !== bodyHash) {
      return apiError(409, "idempotency_conflict", "This Idempotency-Key was already used with a different body", false, newRequestId());
    }
    return new Response(prior.body, {
      status: prior.status,
      headers: { "content-type": "application/json", "idempotent-replay": "true" },
    });
  }

  const res = await run(body);
  if (res.status >= 200 && res.status < 300) {
    idempotency.put(owner, id, { bodyHash, status: res.status, body: await res.clone().text() });
  }
  return res;
}
