# Deposit: US ACH → USDC on Polygon

A minimal, runnable example of the Borderless deposit (onramp) flow in TypeScript. The end user pays USD via ACH; USDC lands in their Polygon wallet.

## What this covers

- OAuth 2.0 access-token fetching with caching + refresh.
- Idempotency-key generation per mutating call.
- Quote fetching (estimate-only).
- Deposit creation.
- Polling the transaction until payment instructions populate.
- Status polling until the deposit completes.

For the webhook-driven version of status tracking, see `../webhooks/`.

## Prerequisites

- Node 20+.
- A Borderless sandbox client ID and secret.
- An identity that has passed compliance for `{country: US, asset: USDC_POLYGON, fiat: USD, paymentMethod: ACH, type: Deposit}`. Run `../compliance-personal/` to produce one, then set `BORDERLESS_IDENTITY_ID` in `.env`.
- An account linked to that identity with `USDC_POLYGON` added. Run `../account-setup/` to produce one, then set `BORDERLESS_ACCOUNT_ID` in `.env`.

## Setup

```bash
cp .env.example .env
# fill in BORDERLESS_CLIENT_ID, BORDERLESS_CLIENT_SECRET, BORDERLESS_ACCOUNT_ID
npm install
npm run deposit
```

## Files

- `src/auth.ts` — access-token cache + refresh.
- `src/client.ts` — thin HTTP wrapper with idempotency-key injection.
- `src/deposit.ts` — end-to-end deposit orchestration.
- `src/index.ts` — entrypoint.

## The flow

1. Fetch / refresh access token.
2. `GET /deposits/quotes` with the corridor + amount → estimate.
3. `POST /deposits` with idempotency key → returns transaction with `instructions` (or `null` if KYC still pending).
4. If `instructions` is `null`, poll `GET /transactions/{id}` until populated.
5. Display the payment instructions to the originator (out-of-band: they wire the ACH).
6. Poll `GET /transactions/{id}` until `status === 'Completed'` (or use webhooks — see the webhook example).

## Hard rules reflected in this code

- Decimal amounts never go through `Number`. Uses `decimal.js`.
- Access token is cached with `expiresIn` — not fetched per request.
- Every `POST`/`PUT` carries a persisted `idempotency-key` so retries are safe.
- Sandbox base URL is hardcoded in `src/client.ts` and `src/auth.ts` — this example is sandbox-only.
- Secrets come from env only.
- No PII or credentials in logs.

## What's deliberately simplified

- Idempotency keys are stored in an in-memory Map. In production, persist them in your database keyed by the logical operation (e.g., "deposit order #12345") so retries across process restarts reuse the same key.
- Polling uses a fixed back-off. In production, prefer webhooks.
- Error handling is minimal — this is meant to be readable, not production-grade.
