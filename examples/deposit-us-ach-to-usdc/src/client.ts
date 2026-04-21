// src/client.ts
// Thin HTTP wrapper around the Borderless API. Injects bearer token and
// idempotency-key on mutating calls. Refreshes the token on 401.

import { randomUUID } from 'node:crypto';
import { getAccessToken, refreshAccessToken } from './auth.js';

// Sandbox-only testing tool. URL hardcoded by design — do not point at production.
const baseUrl = 'https://sandbox-api.borderless.xyz/v1';

// Idempotency keys are persisted per logical operation so retries reuse the
// same key. In production this would be a DB table keyed by your own operation
// id (e.g., "deposit:order-12345"). An in-memory Map is fine for a single-
// process example.
const idempotencyKeys = new Map<string, string>();

export function idempotencyKeyFor(operation: string): string {
  let key = idempotencyKeys.get(operation);
  if (!key) {
    key = randomUUID();
    idempotencyKeys.set(operation, key);
  }
  return key;
}

type RequestOpts = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Logical operation name for idempotency-key reuse. Required on mutating calls. */
  operation?: string;
  query?: Record<string, string | number | undefined>;
};

export async function borderless<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const mutating = method !== 'GET';

  if (mutating && !opts.operation) {
    throw new Error(`borderless(): mutating ${method} ${path} requires an 'operation' name for idempotency`);
  }

  const url = buildUrl(path, opts.query);
  return doRequest<T>(url, method, opts, /* retriedOn401 */ false);
}

async function doRequest<T>(
  url: string,
  method: string,
  opts: RequestOpts,
  retriedOn401: boolean,
): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (opts.operation) {
    headers['idempotency-key'] = idempotencyKeyFor(opts.operation);
  }

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  if (res.status === 401 && !retriedOn401) {
    await refreshAccessToken();
    return doRequest<T>(url, method, opts, true);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Borderless ${method} ${url} → ${res.status}: ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const u = new URL(baseUrl + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}
