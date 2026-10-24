// fetch with a timeout, retries and exponential backoff. No dependencies.
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchOpts {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number; // extra attempts after the first
  backoffMs?: number;
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const { method = "GET", headers, body, timeoutMs = 30000, retries = 3, backoffMs = 2000 } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers, body, signal: ctl.signal });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`HTTP ${res.status} ${res.statusText} ${text.slice(0, 200)}`.trim());
        // Client errors other than rate limiting will not get better by retrying.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) throw Object.assign(err, { fatal: true });
        throw err;
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      if ((err as { fatal?: boolean }).fatal || attempt === retries) break;
      await sleep(backoffMs * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
