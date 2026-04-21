# Prompt: build a complete Borderless integration

Copy the prompt below into a Claude Code session running in your project's repo. Fill in the placeholders. The skills and CLAUDE.md from `/borderless-install-into` should already be present.

---

Build me a complete Borderless integration in this project. Stack: **{Next.js / FastAPI / Rails / Django / Express / NestJS / Go / other}**.

## Scope

- **Flows:** {deposits / withdrawals / both}
- **Corridor(s):** {e.g., US ACH → USDC on Polygon, BR PIX → USDC on Base, NG Mobile Money → USDT on Tron}
- **PFI(s):** {e.g., Bridge, Bitso, Yellowcard — or "whichever the org has configured"}
- **Expected volume:** {e.g., ~100 transactions/day, ~$50k/day average volume}
- **Database:** {Postgres / MySQL / MongoDB / Prisma / Drizzle / SQLAlchemy / ActiveRecord}
- **Webhook host:** {public URL where webhooks will land, e.g., https://api.myapp.com/webhooks/borderless}

## Requirements

1. **Scaffold the Borderless client.** Auth module with token caching + refresh. HTTP client with `idempotency-key` injection. Decimal-typed amount helpers. Reuse my existing HTTP and decimal libraries — don't add new dependencies if alternatives are already in the project.

2. **Identity and compliance.** A service that creates a Personal or Business identity, discovers the compliance slug for my corridor, checks requirements, uploads documents, respects the ToS flow (`metadata.tosLink` / `metadata.hasAcceptedTos`), and starts the compliance check. Persist `identityId` and `slug` before starting the check.

3. **{Flow — deposit/withdrawal}.** A service that creates the transaction, handles the `instructions: null` / `withdrawalOnchainInstruction` response shape, and persists Borderless transaction IDs in my DB before any out-of-band action (fiat send for deposits, stablecoin send for withdrawals).

4. **Webhook handler.** Public endpoint at `{my webhook URL}` that:
   - Captures raw body bytes before any JSON parsing.
   - Verifies `x-signature` against `BORDERLESS_WEBHOOK_PUBLIC_KEY` (RSA-SHA256).
   - Rejects unverified requests with 401.
   - Dedupes on event `id` via a unique constraint in my DB.
   - Routes by `event_type` / `operation_type`.
   - Returns 200 fast; heavy work goes to a background job.

5. **Reconciliation job.** A scheduled task that walks `GET /transactions` with cursor pagination and matches against my internal ledger by `reference` (primary) or transaction `id`. Reports mismatches. See `cookbook/reconciliation.md`.

6. **Env + secrets.** `.env.example` with `BORDERLESS_BASE_URL`, `BORDERLESS_CLIENT_ID`, `BORDERLESS_CLIENT_SECRET`, `BORDERLESS_WEBHOOK_PUBLIC_KEY`. Gated so sandbox credentials can't accidentally hit production URLs.

## Hard rules (from CLAUDE.md)

Every bit of generated code must comply:

- Decimal strings, never floats, for any amount / fee / rate field.
- UUID v4 `idempotency-key` on every mutating POST / PUT, persisted per logical operation.
- Webhook signatures verified against raw bytes.
- No secrets or PII in logs.
- Base URLs from env.
- For withdrawals: `fromAddress`, `amount`, `toAddress`, asset+chain all match the PFI's `withdrawalOnchainInstruction` before broadcasting.

## What to deliver

- All new files, diffed against my current tree.
- A `README` snippet for my repo's contributing guide explaining how to run locally and test.
- An acceptance test I can run that exercises the happy path end-to-end against sandbox: auth → identity → compliance → account → transaction → webhook receipt.

Before generating code, summarize the file structure you'll create and the exact dependency versions you'll add. I'll confirm before you write anything.

When in doubt about API shape, fetch the relevant `.md` page from `docs.borderless.xyz` rather than guessing. After generation, run `/borderless-lint` on the result and fix anything it flags.
