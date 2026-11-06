# Sandbox to production — migration checklist

Endpoints, sequencing, and field shapes are identical between sandbox and production. What changes is **what the system does with what you send** — compliance is real, documents are reviewed, funds actually move, and lenient sandbox behaviors disappear. Most production surprises are a mismatch between expectations baked in during sandbox testing and the stricter production reality.

This doc is a punch list. Walk it before flipping any switch.

## What changes

| Aspect | Sandbox | Production |
|---|---|---|
| **Base URL** | `https://sandbox-api.borderless.xyz/v1` | `https://api.borderless.xyz/v1` (confirm with Borderless) |
| **Credentials** | Sandbox `clientId` / `clientSecret` | Production `clientId` / `clientSecret` (separately issued) |
| **Compliance** | Most PFIs auto-approve in seconds (Bridge / Walapay style) or are PreApproved | Real review. Hours to days for KYB. RFIs (requests for information) are common. |
| **Documents** | Placeholder 200×200 white JPEGs accepted | Actual legible documents required |
| **UBOs** | `ultimateBeneficialOwners: []` works for many sandbox PFIs | Real UBOs required, each as a `personalIdentityId` |
| **Wallet funding** | PFI provides simulated funding tooling | You fund your own wallets; the PFI does not |
| **Transaction finality** | Status transitions are simulated | Real fund movement, real fees, real reconciliation |
| **Limits** | Lenient | Per-transaction and per-day limits enforced |
| **Bank slugs** | Sandbox PFI's slugs | Production PFI's slugs — **always re-discover**, do not migrate sandbox values |
| **PFI routing** | Whatever's wired up for sandbox | May differ. The same corridor can route through a different PFI in production. |

## Migration checklist

### Credentials and environment

- [ ] Production `clientId` / `clientSecret` issued and stored (separate secret manager entry — don't overwrite sandbox).
- [ ] `BORDERLESS_BASE_URL` points to the production base URL.
- [ ] **Guardrail:** code refuses to start if production credentials are paired with the sandbox base URL or vice versa. Both silently "work" until something breaks in confusing ways.
- [ ] Webhook signing public key fetched from production (it is **different** from sandbox). Cache it like you did sandbox; do not assume the keys carry across.

### Identity and compliance

- [ ] Identities created with real legal names, real addresses, valid local-format tax IDs. (Argentina CUIT mod-11, US EIN, etc. — formats are PFI-validated in production.)
- [ ] All "soft" enrichment fields populated up front: `email`, `phone`, full `address`, `sourceOfFunds`, `businessType`, `description`, `website`, `dateOfIncorporation`, `businessIndustryCode` (NAICS or local equivalent), `accountPurpose`. Different production PFIs require different subsets — set them all so you don't have to re-PATCH later.
- [ ] `ultimateBeneficialOwners` populated with real personal identities (created via `POST /identities/personal`). Each UBO entry has `attestedOwnershipStructureAt` set to a real `YYYY-MM-DD`.
- [ ] Real document images uploaded. Formation, ownership docs, ID front (and back, for `DriverLicense`), proof of address, source-of-funds — whatever the corridor's `requirements` lists.
- [ ] Built timeline expectations into the product. Compliance does **not** auto-approve in production. Plan for hours-to-days; surface a "verification in progress" UX rather than blocking on a synchronous wait.
- [ ] Listening for `IdentityComplianceCheck_Updated` and `IdentityComplianceCheck_Completed` webhooks; not relying on polling alone for production timeline communication.

### Wallets and funding

- [ ] Production wallet addresses registered on accounts (sandbox addresses are not portable).
- [ ] Wallets funded with real USDC / USDT on the chains you'll actually use.
- [ ] `fromAddress` declared on each account asset matches the wallet you'll actually broadcast from. **Mismatches lose funds with no refund.**
- [ ] Onchain guard / pre-broadcast check (asset+chain, amount, fromAddress, toAddress) is wired up — not just in the example, but in the production code path.

### Discovery and corridors

- [ ] Re-run `/withdrawals/options`, `/withdrawals/institutions`, `/deposits/options` against production. Available corridors and PFI routing **may differ** from sandbox.
- [ ] **Bank slugs from sandbox are invalid.** Discover at runtime, every time. Do not migrate the slug values.
- [ ] If your code branched on `pfiName` in sandbox, re-verify each branch against production routing — the same corridor may name a different PFI.
- [ ] Confirm any per-corridor caps you depend on (e.g., NGN ≈ $3,164 per transaction). Production limits are real.

### Payment instructions

- [ ] Production-grade `details` per corridor (real bank details, not test fixtures).
- [ ] `localRoutingCode` (BSB / transit / IFSC) and `bankCode` (JP) carry the real value.
- [ ] Invoice-required corridors (IN, GH, CN, BR ≥ 50,000 BRL) carry a real, legible invoice in `documents` on the withdrawal call.

### Webhooks

- [ ] Production webhook URL registered (`POST /notifications/webhooks/settings`). Sandbox URLs are not migrated automatically.
- [ ] Production public key cached and used for verification.
- [ ] Endpoint returns 2xx fast (ack, then enqueue). Anything slower risks Borderless's auto-disable when retries exhaust.
- [ ] Alert on `enabled: false` flipping. Monitor `GET /notifications/webhooks/settings` on a schedule.
- [ ] Reconciliation path tested — if a delivery gap happens, polling `GET /transactions` and `GET /identities/{id}/compliance-checks` fills it. See `cookbook/reconciliation.md`.

### Idempotency

- [ ] Idempotency keys are persisted before the request fires, so retries across process restarts reuse the same key.
- [ ] Keys are scoped per logical operation, not per process. "Retry the same withdrawal" must use the original key.

### Error handling and resilience

- [ ] 401 → re-authenticate path tested. Token lifetime is ~23 hours; some long-running batches will hit it.
- [ ] Transient 5xx → exponential backoff with a cap. Not infinite.
- [ ] `Failed` transactions are observed (logging, alert, dashboard surface) — not silently retried. Read `failureReason.details[].pfiErrorMessage` and act on it.
- [ ] Tainted-PI handling: on retry after a PI-related failure, create a fresh PI — do not reuse the failed one.

### PII and secrets

- [ ] No `clientSecret`, `accessToken`, `imageFront`, `imageBack`, `taxId`, `dateOfBirth`, or full identity payloads in any logger output.
- [ ] Secrets read from a secret manager, not env files committed anywhere.
- [ ] Webhook payload bodies redacted before logging (they carry transaction detail and counter-party identity references).

### Operational

- [ ] On-call / alerting wired for: 401 storms, webhook auto-disable, 5xx spike, `Failed` transaction rate above baseline.
- [ ] Per-corridor dashboards or queries exist — failure patterns are usually corridor-specific, not global.
- [ ] Reconciliation job runs on a schedule. Don't rely solely on webhooks for the source of truth.

## What does NOT change

To save you re-checking these:

- API endpoint paths and HTTP methods are identical.
- Field names, required headers, idempotency rules — identical.
- The four-layer model (Identity → Compliance → Account → Transaction) is identical.
- Discovery-first pattern is even more important — production routing is more variable across orgs.
- `amount` is still a decimal string in source-asset major units.

## Common production surprises

1. **Compliance takes real time.** A flow that was "create identity → submit transaction" in 30 seconds in sandbox becomes "create identity → wait for KYB → maybe RFI → submit transaction" over days. Build the UX accordingly.
2. **Not every sandbox corridor is provisioned in production.** Run `/borderless-coverage` against production after credentials land.
3. **Provider routing may have moved.** A corridor that ran through PFI A in sandbox can run through PFI B in production. Re-verify any PFI-specific code paths.
4. **Documents are reviewed by humans.** Placeholder images that passed sandbox will be rejected. Surface a real document upload UI.
5. **Transaction limits get hit.** A test pattern of "send 1,000,000 USDC" that worked in sandbox will fail per-corridor caps in production. Sanity-check expected volumes against the limits in `/withdrawals/quotes`'s `limits.transaction`.

## Related

- Discovery pattern: see Step 0 in `borderless-withdrawal-flow` and `borderless-deposit-flow` skills.
- Webhook auto-disable recovery: `cookbook/webhook-replay.md`.
- Reconciling a webhook gap: `cookbook/reconciliation.md`.
- Coverage inventory (run against production once credentialed): `/borderless-coverage`.
- Pre-merge audit before going live: `borderless-integration-reviewer` agent and `/borderless-lint`.
