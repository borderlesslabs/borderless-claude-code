# Compliance: Personal identity + KYC

A minimal, runnable example of the Borderless personal compliance flow in TypeScript. Creates a personal identity, discovers the compliance slug for a corridor, checks requirements, uploads placeholder documents, enforces ToS acceptance if the PFI requires it, starts the compliance check, and polls to a terminal state.

This is the **prerequisite** for `../deposit-us-ach-to-usdc/` and `../withdrawal-usdc-to-us-ach/`. Run this first; the identity ID it prints is what you'll set as `BORDERLESS_IDENTITY_ID` in those examples.

## What this covers

- OAuth 2.0 access-token fetching with caching + refresh.
- Idempotency-key generation per logical operation.
- `POST /identities/personal` with a sandbox-valid body.
- `GET /identities/{id}/compliance-checks` with corridor query params to discover the slug.
- `GET /identities/{id}/compliance-checks/{slug}/requirements` to enumerate required fields and documents.
- `PUT /identities/{id}/documents` with a generated 200×200 grayscale PNG (pure-Node; no image deps).
- ToS enforcement: if `metadata.tosLink` is present and not yet accepted, print the link, try to open it in the default browser, then poll `metadata.hasAcceptedTos` for up to 5 minutes.
- `POST /identities/{id}/compliance-checks/{slug}` to start the check.
- Polling `GET /identities/{id}/compliance-checks/{slug}` until status is terminal (`Completed` / `Rejected`), with a 2-minute timeout.

## Prerequisites

- Node 20+.
- A Borderless sandbox client ID and secret.

## Setup

```bash
cp .env.example .env
# fill in BORDERLESS_CLIENT_ID, BORDERLESS_CLIENT_SECRET
npm install
npm run compliance
```

On success, the example prints the created identity ID and the compliance slug. Add the identity ID to your `.env` as `BORDERLESS_IDENTITY_ID` so you can reuse it — re-runs with `BORDERLESS_IDENTITY_ID` set skip identity creation.

## Files

- `src/auth.ts` — access-token cache + refresh.
- `src/client.ts` — thin HTTP wrapper with idempotency-key injection.
- `src/identity.ts` — creates the personal identity (or reuses an existing one from env).
- `src/documents.ts` — uploads the placeholder PNG if the requirements call listed a document.
- `src/placeholder-png.ts` — generates a valid 200×200 grayscale PNG using Node's zlib and a minimal PNG writer. No `pngjs` / `sharp` dependency.
- `src/tos.ts` — polls for ToS acceptance, attempting to open the link in the customer's default browser.
- `src/compliance.ts` — orchestrates the full compliance flow.
- `src/index.ts` — entrypoint with the corridor constant (`FORK HERE`).

## The flow

1. Fetch / refresh access token.
2. Create a personal identity (or reuse the one in `BORDERLESS_IDENTITY_ID`).
3. `GET /compliance-checks?country=…&asset=…&fiat=…&paymentMethod=…&type=Deposit` → slug.
4. `GET /compliance-checks/{slug}/requirements` → list of missing fields and required documents.
5. If required documents are non-empty, generate a 200×200 placeholder PNG and `PUT /documents`.
6. If `metadata.tosLink` is present and `hasAcceptedTos` is false, print the link, try to open it in the browser, and poll for acceptance (up to 5 minutes).
7. `POST /compliance-checks/{slug}` to start the check.
8. Poll `GET /compliance-checks/{slug}` until status is terminal or the 2-minute timeout hits.

## Hard rules reflected in this code

- Every mutating call carries a persisted `idempotency-key`. Re-runs reuse the same key per logical operation.
- Documents meet the 200×200 minimum. The placeholder is valid PNG bytes (sandbox doesn't OCR, but production will reject malformed images).
- ToS acceptance is enforced, not optional. If the PFI requires it and the customer doesn't accept within 5 minutes, the example exits cleanly with a resume instruction.
- Status polling stops on terminal state or timeout — never hangs forever.
- No PII in logs. Identity body is not printed post-creation; only the ID.
- Secrets come from env only.

## What's deliberately simplified

- The identity body uses realistic placeholder values (address in SF, example email, example DOB). Override `FIRST_NAME` / `LAST_NAME` in `.env` if you want the identity findable under your real name in the dashboard.
- Idempotency keys are an in-memory Map. Production persists them in a DB keyed by your own logical operation ID.
- Document upload uses one generated PNG for both `imageFront` and `imageBack`. For real KYC, these are distinct photos of the actual ID.
- The compliance flow hardcodes document `type: Passport` with placeholder dates. Requirements may indicate other accepted types — adapt based on what `/requirements` returns if you need to exercise a different document.

## Common errors

- **`missingFields` returned by `/requirements`** — the identity lacks a field the PFI requires for this corridor. Extend the identity body in `src/identity.ts` and re-run.
- **ToS acceptance times out** — you have 5 minutes from the browser open. Accept, then re-run with `BORDERLESS_IDENTITY_ID` set to resume.
- **Compliance `Rejected`** — sandbox rarely rejects on happy path. Check the `rejectionReasons` field in the final poll response; it's printed verbatim.

## Next

Once you have `BORDERLESS_IDENTITY_ID` from this example, continue to `../account-setup/` to create an account and add the corridor asset, then `../deposit-us-ach-to-usdc/` or `../withdrawal-usdc-to-us-ach/`.
