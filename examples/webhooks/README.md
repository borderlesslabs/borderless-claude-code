# Webhooks: signed event handler

A minimal, runnable Express app that receives Borderless webhook events, verifies the `x-signature` header against raw request bytes, dedupes on event `id`, and routes by `event_type`.

## What this covers

- Raw-body capture via `express.raw({ type: 'application/json' })` so signature verification sees the exact bytes Borderless signed.
- RSA-SHA256 signature verification against the organization's public key.
- Event dedupe via an in-memory Map keyed by event `id`. Swap for a unique database constraint in production.
- Event-type routing: `Transaction_Created` / `Transaction_Updated` → transaction handler, `IdentityComplianceCheck_*` → compliance handler, `VirtualAccount_*` → virtual-account handler.
- 401 on missing / invalid signature, 200 on dedupe hit, 200 after handler success, 500 on handler error so Borderless retries.
- No full payloads in logs. IDs and event types only.

## Prerequisites

- Node 20+.
- A Borderless sandbox organization.
- A registered webhook endpoint pointing at a public URL that forwards to your local app. For local dev, use a tunnel like ngrok or Cloudflare Tunnel:
  ```bash
  ngrok http 3000
  # Then register the ngrok URL at POST /v1/notifications/webhooks/settings
  ```
- The organization's webhook public key, fetched once from `GET /v1/notifications/webhooks/settings/public-key`. Stored as `BORDERLESS_WEBHOOK_PUBLIC_KEY` in `.env`.

## Setup

```bash
cp .env.example .env
# fill in BORDERLESS_WEBHOOK_PUBLIC_KEY (PEM, newlines preserved)
npm install
npm run dev
```

The server listens on `$PORT` (default 3000) at `POST /webhooks/borderless`.

## Files

- `src/verify.ts` — raw-body signature verification.
- `src/dedupe.ts` — in-memory event-id dedupe.
- `src/handlers.ts` — per-event-type routing.
- `src/server.ts` — Express app wiring the three together.
- `src/index.ts` — entry point that reads env and starts the server.

## Hard rules reflected in this code

- Signature is verified **before** parsing JSON. The raw body Buffer is what's signed.
- Verification failure returns 401 and never reaches the handler.
- Dedupe happens on event `id`, not on any payload hash.
- Handlers receive an already-verified, already-deduped event — they can assume both.
- Handler errors surface as 500 so Borderless retries. Silent swallows would break at-least-once delivery.
- No full event payloads in logs. Ever.

## What's deliberately simplified

- Dedupe uses an in-memory `Map`. This resets on process restart and doesn't scale across replicas. In production, insert the event `id` into a Postgres / MySQL / Redis store with a unique constraint, process in the same transaction, and rely on the constraint violation to detect retries.
- Handlers are stubs that log `id`, `event_type`, and `operation_type` (for transactions). Replace with your business logic — updating internal ledgers, dispatching user notifications, reconciling payment state, etc.
- No async queue. Heavy work inline will delay the 200 response; if your handler takes more than ~5s, enqueue the event id and ack immediately, then process in a worker.

## Testing locally without a tunnel

Use the `/borderless-test-webhook` slash command to generate a signed payload and `curl` it at your local endpoint. That command walks you through generating a local test key pair so you can verify the handler without a real Borderless webhook delivery.
