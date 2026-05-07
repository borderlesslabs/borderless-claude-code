# Borderless — Claude Code workspace context

This file gives Claude Code the context it needs to help you build correctly against the [Borderless](https://borderless.xyz) stablecoin payments API.

> **What Borderless does:** Stablecoin payments orchestration. A single API gateway to local on-ramp and off-ramp partners (PFIs) across 50+ countries. Borderless is **never in the flow of funds** — funds move directly between clients and regulated PFIs.

You're working inside the `borderless-claude-code` toolbox repo. It contains skills, commands, and runnable TypeScript examples for the four core flows. If you're starting from scratch, run `/borderless-onboard`. If you've already onboarded and want these tools inside your own app, run `/borderless-install-into <path>`.

---

## API essentials

### Base URLs

- **Sandbox:** `https://sandbox-api.borderless.xyz/v1`
- **Production:** `https://api.borderless.xyz/v1` *(confirm with Borderless during onboarding)*

**Rule:** Never hardcode base URLs. Read from `BORDERLESS_BASE_URL`. Default to sandbox in development.

### Authentication — OAuth 2.0 client credentials

All endpoints require a bearer token obtained via `POST /auth/m2m/token` with `clientId` + `clientSecret`. Tokens expire in `expiresIn` seconds (typically ~86400, i.e. ~24 hours; observed sandbox value is 86399). Always read `expiresIn` from the response — don't hardcode the lifetime. **Cache the token and refresh before expiry** — do not call `/auth/m2m/token` on every request.

```
POST /auth/m2m/token
Body: { "clientId": "...", "clientSecret": "..." }
Response: { "accessToken": "...", "tokenType": "Bearer", "expiresIn": 86399, "piiAccess": "all" }
```

**Never** log, commit, or print `clientSecret` or `accessToken`. Read them from env vars: `BORDERLESS_CLIENT_ID`, `BORDERLESS_CLIENT_SECRET`.

### Idempotency

Most `POST` / `PUT` endpoints that create or mutate resources accept an `idempotency-key` header. **Always send one** — generate a UUID v4 per logical operation and persist it alongside the request so retries reuse the same key.

Endpoints that require idempotency keys (non-exhaustive):

- `POST /identities/personal`, `POST /identities/business`
- `PUT /identities/{id}/documents`
- `POST /identities/{identityId}/compliance-checks/{slug}`
- `POST /accounts`, `POST /accounts/{id}/assets`
- `POST /deposits`, `POST /withdrawals`
- `POST /identities/{id}/payment-instructions`

### Pagination

List endpoints use cursor-based pagination with `startingAfter` and `limit`. Do **not** assume offset-based pagination.

---

## The Borderless mental model

Every payment runs through the same four-layer stack:

```
Identity  →  Compliance Check  →  Account  →  Transaction
(who)       (cleared by PFI)      (where)    (deposit / withdrawal)
```

1. **Identity** — a `Personal` or `Business` entity. Created once, reused forever. Holds PII and documents.
2. **Compliance Check** — a KYC/KYB process tied to a specific `{PFI, country, asset, fiat, paymentMethod, type}` combination, identified by a `slug`. The same identity can have multiple compliance checks for different corridors.
3. **Account** — the funds-holding structure tied to an identity. Typically a stablecoin wallet (Fireblocks, Utila, Dfns, Standalone, etc.) or a PFI-held fiat balance. The `POST /accounts` body is a `oneOf` over infra-specific create DTOs: `AccountStandaloneCreateDto` (you control the wallet, just declare addresses), `AccountUtilaCreateDto` (Utila vault + walletId), `AccountDfnsCreateDto`, `AccountWeb3ProviderCreateDto` (other Web3 providers), and `AccountPfiCreateDto` (PFI-held). Sub-accounts go to `POST /accounts/subaccounts`; PFI accounts to `POST /accounts/pfi`.
4. **Transaction** — `TransactionType` enum is `Deposit` (fiat → stablecoin), `Withdrawal` (stablecoin → fiat), or `Exchange` (asset-to-asset swap inside a PFI account, via `POST /exchanges`).

**Withdrawals also require a Payment Instruction** (bank account details) created against the identity *before* the transaction.

---

## Hard rules — do not violate

1. **Never put Borderless in the flow of funds.** Funds move client ↔ PFI directly. Your code should never assume Borderless custodies anything.
2. **Never mix sandbox and production credentials.** Gate by env. Sandbox keys against production base URLs (or vice versa) silently fail in confusing ways.
3. **Always send an `idempotency-key`** on mutating POST/PUT requests. Persist it so retries are safe across process restarts.
4. **Always verify webhook signatures** using the `x-signature` header and the organization's public key (RSA-SHA256), against the **raw request bytes** — not re-serialized JSON. Unverified webhooks must be rejected with 401.
5. **Dedupe webhooks on event `id`.** Retries are expected. In-memory for dev, unique database constraint in production.
6. **Quotes are estimates, not guarantees.** Never display a quote as a final amount without a "subject to change" caveat. Never use a quote as the settlement amount in internal accounting.
7. **Withdrawals: `fromAddress`, `amount`, `toAddress`, and asset+chain must all match** the PFI's `withdrawalOnchainInstruction` before broadcasting. Lost stablecoins are not refundable.
8. **Respect the ToS flow.** Some PFIs require the end user to accept a terms-of-service link (`metadata.tosLink`) before compliance can start. Check `metadata.hasAcceptedTos` before initiating.
9. **PII handling.** Identity documents contain sensitive PII. Do not log full payloads. Redact `taxId`, `imageFront`, `imageBack`, `dateOfBirth`, and address fields at log boundaries.
10. **Amounts are decimal strings, never `Number` / `float`.** Use `decimal.js` in TS, `Decimal` in Python, `shopspring/decimal` in Go.

---

## Common failure modes

- **401 Unauthorized** after ~24 hours — access token expired. Refresh it. (Tokens last roughly a day; the exact value is in `expiresIn`.)
- **`instructions: null`** on deposit creation — KYC/KYB is still pending at the PFI. Fetch instructions later via `GET /transactions/{id}` or a webhook; do not retry the deposit.
- **Compliance check stuck in `NotStarted`** — check `requiredExtras.acceptTermsOfService` and `missingFields` via `GET /identities/{id}/compliance-checks/{slug}/requirements`.
- **Withdrawal sitting open** — the PFI hasn't received stablecoins at the returned `toAddress`, or the `fromAddress` doesn't match, or the chain is wrong.
- **Webhook marked `enabled: false`** — delivery exhausted its retry budget. Your endpoint returned non-200 or errored. Re-enable via `PATCH /notifications/webhooks/settings/{id}`. See `cookbook/webhook-replay.md`.
- **`Validation error from PFI` with no detail on retry** — the previous attempt tainted the payment instruction on the PFI side. Create a fresh PI and resubmit. See `cookbook/error-catalog.md`.

For a full message → cause → fix table (sync 4xx and async PFI failures), see `cookbook/error-catalog.md`.

---

## Skills and commands in this workspace

Claude auto-loads skills based on what you're doing. You can also invoke them manually:

**Skills** (`.claude/skills/`):
- `borderless-compliance-flow` — identity creation, requirements discovery, document upload, starting a compliance check.
- `borderless-deposit-flow` — end-to-end on-ramp (fiat → stablecoin).
- `borderless-withdrawal-flow` — end-to-end off-ramp including payment instructions and per-corridor `details` requirements.
- `borderless-virtual-account-flow` — dedicated, named bank accounts that auto-convert any incoming fiat to stablecoin (recurring deposits, payroll funding, treasury).
- `borderless-exchange-flow` — internal asset/fiat conversion inside a PFI account (`POST /exchanges`).
- `borderless-webhook-verifier` — signature-verifying handlers in TS, Python, and Go.

**Commands** (`.claude/commands/`):
- `/borderless-onboard` — zero-to-first-transaction sandbox walkthrough. Start here.
- `/borderless-install-into <path>` — copy this toolbox into your own project.
- `/borderless-scaffold` — generate auth + client modules in the current project.
- `/borderless-lint` — audit the current project for Borderless anti-patterns.
- `/borderless-coverage` — list the corridors currently configured on your Borderless org (countries, fiats, payment methods, assets).
- `/borderless-test-webhook` — emit a signed test webhook payload for local testing.

**Agent** (`.claude/agents/`):
- `borderless-integration-reviewer` — invoke for PR review or pre-merge audits.

**Runnable examples** (`examples/`) — run in order; each prints the env-var values the next step needs:

1. `compliance-personal/` — create a personal identity and run a compliance check for a corridor. **Prerequisite for deposits and withdrawals.** Outputs `BORDERLESS_IDENTITY_ID`.
2. `account-setup/` — create a Standalone account for that identity and attach the corridor asset. Outputs `BORDERLESS_ACCOUNT_ID` and `BORDERLESS_FROM_ADDRESS`.
3. `deposit-us-ach-to-usdc/` — US ACH → USDC on Polygon.
4. `withdrawal-usdc-to-us-ach/` — USDC on Polygon → US ACH. Includes `src/onchain-guard.ts` enforcing the `fromAddress`/`amount`/`toAddress`/asset+chain match before broadcast.
5. `webhooks/` — Express handler with raw-body signature verification, event-id dedupe, and event-type routing.

Each example is a standalone TypeScript project. The `FORK HERE` comment on the corridor constant shows what to change for your configured PFI.

---

## When generating code in this repo

- Match the voice of the existing skills: direct, rule-framed, "Common pitfalls" sections, no hedging.
- Reuse existing patterns — the `auth.ts` caching shape, the `client.ts` idempotency-key injection, the in-memory dedupe Map — rather than inventing new ones.
- When unsure of an API shape, fetch the relevant `.md` page from `docs.borderless.xyz` rather than guessing. Every docs page has a `.md` variant; `/llms.txt` is the index.
- Assume the user has sandbox credentials and is working against `https://sandbox-api.borderless.xyz/v1`. Never suggest production URLs or endpoints unless explicitly asked.
- Every mutating request gets a UUID v4 `idempotency-key`. Every webhook handler verifies signatures against raw bytes and dedupes on event `id`.

---

## Docs

- **Full docs:** https://docs.borderless.xyz
- **LLMs.txt index:** https://docs.borderless.xyz/llms.txt
- **LLMs-full.txt:** https://docs.borderless.xyz/llms-full.txt
- **Any individual page:** append `.md` to the URL for Markdown.
- **Quick start (mirrors `/borderless-onboard`):** https://docs.borderless.xyz/docs/quick-start-guide.md
- **Webhooks:** https://docs.borderless.xyz/docs/webhooks.md
- **Support:** support@borderless.xyz

## Cookbook

- `cookbook/amount-handling.md` — decimal types, never floats.
- `cookbook/error-catalog.md` — sync + async error message → cause → fix.
- `cookbook/reconciliation.md` — recovering after a webhook gap.
- `cookbook/sandbox-to-production.md` — checklist before flipping to production.
- `cookbook/testing-compliance-locally.md` — running compliance flows in dev.
- `cookbook/webhook-replay.md` — re-enabling an auto-disabled webhook.
