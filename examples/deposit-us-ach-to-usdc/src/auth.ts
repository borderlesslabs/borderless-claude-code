// src/auth.ts
// Caches the Borderless M2M access token in memory, refreshes before expiry.

type TokenState = {
  accessToken: string;
  expiresAt: number; // epoch ms
};

let cached: TokenState | null = null;
const REFRESH_SKEW_MS = 60_000; // refresh 60s before expiry

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresAt - REFRESH_SKEW_MS > now) {
    return cached.accessToken;
  }
  cached = await fetchNewToken();
  return cached.accessToken;
}

/** Force-refresh. Call this on a 401 from a downstream request. */
export async function refreshAccessToken(): Promise<string> {
  cached = await fetchNewToken();
  return cached.accessToken;
}

async function fetchNewToken(): Promise<TokenState> {
  // Sandbox-only testing tool. URL hardcoded by design — do not point at production.
  const baseUrl = 'https://sandbox-api.borderless.xyz/v1';
  const clientId = requireEnv('BORDERLESS_CLIENT_ID');
  const clientSecret = requireEnv('BORDERLESS_CLIENT_SECRET');

  const res = await fetch(`${baseUrl}/auth/m2m/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });

  if (!res.ok) {
    // Do not log the body — it can't leak the secret but be defensive.
    throw new Error(`Auth failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { accessToken: string; expiresIn: number };
  return {
    accessToken: data.accessToken,
    expiresAt: Date.now() + data.expiresIn * 1000,
  };
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
