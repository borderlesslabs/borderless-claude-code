# Error catalog — message → cause → fix

A working catalog of errors you'll see integrating Borderless. Two halves: **synchronous** (4xx / 5xx returned by the API call itself) and **asynchronous** (transaction or compliance check accepts, then transitions to `Failed` / `Rejected` with a `pfiErrorMessage`).

The async ones are the dangerous ones — your call returns 200, you assume success, and the failure surfaces minutes later via webhook or polling. Always check status before acting.

---

## Synchronous errors

### Authentication

| Status / Message | Cause | Fix |
|---|---|---|
| `401 Unauthorized` | Token expired (~23 hours after issue) or never issued | Re-authenticate via `POST /auth/m2m/token`. Read `expiresIn` from the response — don't hardcode the lifetime. |
| `401 Invalid credentials` | Wrong `clientId` / `clientSecret`, or sandbox creds against the production base URL (or vice versa) | Verify which environment the credentials were issued for. Sandbox and production are separate. |

### Identity creation / update

| Status / Message | Cause | Fix |
|---|---|---|
| `404 Not Found` on `POST /identities` | The bare path doesn't exist | Use `POST /identities/business` or `POST /identities/personal`. |
| `404 Not Found` on `PATCH /identities/{id}` | The bare PATCH path doesn't exist | Use `PATCH /identities/business/{id}` or `PATCH /identities/personal/{id}`. |
| `422 street1 is required` (or unknown-field 422 on `addressLine1`) | Wrong address-line field name | First address line is `street1`. |
| `422 ownershipPercentage is required when hasOwnership is true` | UBO object incomplete — and **PATCH is atomic**, so the whole update was discarded, including unrelated fields in the same body | Add `ownershipPercentage`, re-send the full PATCH, and confirm the response is the updated entity (has an `id`), not an error body. |
| `422 citizenship should not exist` | `citizenship` sent on a business identity | It belongs on the *personal* identity: `PATCH /identities/personal/{id}`. (The field is `citizenship`, not `nationality`.) |
| `Invalid subdivision code` | `address.state` is free text | Use ISO 3166-2 subdivision codes — including outside the US (e.g. Singapore: `01`–`05`). |
| `GET /identities/{id}/documents` returns `[]` despite uploads | Wrong read path — documents don't surface on the sub-route | Read them from the identity object: `GET /identities/{id}` → `.documents`. |

### Quotes

| Status / Message | Cause | Fix |
|---|---|---|
| `422 amount should not exist` + `one of fromAmount or toAmount should be specified` | Used `amount` on a quotes endpoint | Quotes use `fromAmount` (source) **or** `toAmount` (destination). Transactions use `amount`. They are not interchangeable. |
| `400 No suitable service for the given payload` | Corridor not active for your org, or wrong `paymentMethod` for the corridor | Confirm with `/withdrawals/options` (off-ramp) or `/deposits/options` (on-ramp). A corridor that appears in `options` but errors here is provisioned in name only. |

### Payment instructions (off-ramp)

| Status / Message | Cause | Fix |
|---|---|---|
| `422 {field} should not exist` (any `details` field) | The PI `details` object is a strict per-corridor shape (a `oneOf`) — a field that belongs to one corridor's shape is rejected on another | Send only the fields the corridor's shape defines. IBAN-only shapes reject `bankName` / `accountHolderName` / `bankAccountNumber`; key-only shapes (BR/PIX `identifierValue`, CO/Bre-B `brebKey`) reject bank fields and `address`; mobile-money shapes reject `bankAccountNumber` and `address`. Look the shape up in `data/corridors.json` and confirm against the live `institutions` response. |
| `422 iban should not exist` | Used the `iban` field on a corridor that doesn't accept it | Most corridors carry the IBAN in `bankAccountNumber`. The `iban` field is only valid on a few (AE/NPSS, EG/BankTransfer, PK/IBFT, and the Gulf/Levant BankTransfer/MADA rails). |
| `422 bankName should not exist` (BR/PIX, AE/NPSS, PK/IBFT) | Included disallowed fields | PIX is identifier-based (`identifierType` + `identifierValue`). NPSS/IBFT take `iban` only. |
| `422 sortCode should not exist` (GB/BankTransfer) | Included sort code | UK uses `bankAccountNumber` only. |
| `422 localRoutingNumber should not exist` (IN/IMPS_FIRC) | Wrong field name | The IFSC code goes in `localRoutingCode`, not `localRoutingNumber`. |
| `422 transitNumber should not exist` (CA/EFT) | Wrong field name | The Canadian transit number goes in `localRoutingCode`. |
| `422 bsbNumber should not exist` (AU/BECS) | Wrong field name | The Australian BSB goes in `localRoutingCode`. |

See the country-by-country `details` table in the `borderless-withdrawal-flow` skill for the full set.

### Payment-instruction country & address validation

PI creation enforces a country/currency/method compatibility table and per-country address formats. This table can be **stricter** than `/withdrawals/options` and the compliance coverage map — a route can quote as available yet fail PI creation. Trust the stricter signal and confirm the route with support@borderless.xyz.

| Status / Message | Cause | Fix |
|---|---|---|
| `422 {currency} does not match the country: {CC}. Possible currencies for the country: {CCY}` | The PI `currency` isn't the country's default | Use the country's native currency. Dollarized routes (a country whose native currency is USD) accept USD; others reject it even when a quote for the pair exists. If no `(country, currency)` pairing satisfies creation for a route that quotes, flag it to support@borderless.xyz. |
| `422 {method} does not match the country: {CC}` | The `paymentMethod` isn't valid for that country in the creation validator | Use a method the country supports. If `/options` or compliance coverage lists a `(country, method)` that creation rejects, the compatibility tables are out of sync — confirm with support@borderless.xyz rather than working around it. |
| `422 address.postalCode has invalid value for the given country` | The postal code doesn't match the destination country's expected format — some formats are validated strictly | Send a correctly formatted postal code for that country. A few country formats reject otherwise-plausible values; if every valid-looking value is rejected, flag it to support@borderless.xyz rather than guessing. |
| `422 bankAccountNumber must be shorter than or equal to N characters` | The account number / IBAN exceeds the corridor's length bound | Some corridors validate a length ceiling — send the domestic account number where the full IBAN overflows, or the format the corridor expects. Confirm the corridor's shape in `data/corridors.json`. |

### Institutions / bank-slug discovery

Bank slugs are **PFI-scoped**: the value for a given bank differs by the PFI routing the corridor, and a slug stored on a PI from one PFI is not valid when another PFI routes the same corridor. Always re-discover with `GET /withdrawals/institutions?...&pfiName={the routing PFI}` (or `/deposits/institutions`) and build the PI from that response.

| Status / Message | Cause | Fix |
|---|---|---|
| `400 Payment instruction … is not usable on {PFI}: the stored institution slug is not present in {PFI}'s catalog` | Reused a PI whose `bankSlug` came from a different PFI than the one now routing the corridor | Re-discover slugs against the routing PFI and create a fresh PI. Do not reuse a slug across PFIs. |
| `400 The service [{PFI}] is not available` on `/institutions` | That PFI doesn't expose institutions/slug discovery on this org *(org-dependent)* | Skip institutions discovery for that route and go straight to quote → PI → submit; PI shape is still validated at creation. |
| `institutions` returns `allInstitutionsSupported: false` with an empty `supportedInstitutions` | No slug is published for the route | On withdrawals this is a hard block — submitting anyway fails with `No bankSlug found for payment instruction`; contact support@borderless.xyz to have the list populated. On deposits, some routes still create and settle with `details: {}` *(org-dependent)* — try PI creation first. |

### Withdrawals

| Status / Message | Cause | Fix |
|---|---|---|
| `422 idempotency-key is required` | Missing the `idempotency-key` header | Add `idempotency-key: {uuid-v4}`. |
| `422 paymentPurpose must be one of …` | Wrong format | Lowercase with spaces: `salary payment`, `service charge`, `personal remittance`, `rent payment`, `delivery fees`, etc. (See the withdrawal skill for the full enum.) |
| `422 asset is invalid` | Used a bare token name | The asset must include the chain — `USDC_ETHEREUM`, `USDC_POLYGON`, `USDT_TRON`, etc. |
| `422 fiat is required` (or country / asset / amount / accountId / paymentInstructionId / paymentPurpose) | Required field missing | All of those fields are required on every withdrawal. |

### Deposits

| Status / Message | Cause | Fix |
|---|---|---|
| `422 paymentMethod must be one of …` | Missing `paymentMethod` | Deposits require explicit `paymentMethod` in the body even though the PI already encodes it — unlike withdrawals, the API does not auto-route. |
| `422 fromAmount should not exist` | Used quote-style fields on a deposit | Deposits use `amount` (the fiat amount). Quotes use `fromAmount` / `toAmount`. |
| `422 paymentPurpose should not exist` | Sent `paymentPurpose` on a deposit | `paymentPurpose` is **withdrawal-only** — remove it from the deposit body. |
| `422 identityId should not exist` | Sent `identityId` on a deposit | Deposits infer the counterparty identity from `accountId` — omit `identityId`. |

### Accounts

| Status / Message | Cause | Fix |
|---|---|---|
| Error on second `POST /accounts` for one identity | Identity already has a primary account | Use `POST /accounts/subaccounts` for additional accounts. |
| `422` on the `assets` field | Passed assets as bare strings | Use objects: `[{ "asset": "USDC_ETHEREUM", "address": "0x..." }]`. The string form may work for some orgs and fail for others — always use the object form. |

### Compliance

| Message | Cause | Fix |
|---|---|---|
| `Signed agreement id is required` | The browser ToS redirect did not complete (signed_agreement_id never landed at Borderless) | Re-fetch `requirements`, get a fresh ToS link, complete the redirect end-to-end (allow ~8s after click). Each link is single-use. |
| `supportingDocuments.0.file should not be empty` | Document uploaded with metadata only — no `imageFront` | Re-upload the document with the base64 image data. |
| `Image must be at least 200x200 pixels` | Document image too small | Re-upload at ≥ 200×200 (300×300 to be safe). Some PFIs validate at compliance initiation, not at upload — the `PUT /documents` succeeds but the `POST /compliance-checks/{slug}` fails. |
| `identity.document.idNumber: format is invalid` | Tax ID failed PFI validation (e.g., Argentina CUIT mod-11 check) | Use a valid local-format tax ID for the corridor's PFI. |
| `identity.address.state: Unsupported subdivision` | The identity's US state is outside the PFI's licensing coverage | Use a supported state (e.g., Delaware) for sandbox identities, or split identities. |
| `compliance: Error creating customer.` / `Validation error from PFI` at compliance initiation, with `requirements` all-clear | PFI-side validation that runs at customer creation — most commonly document image dimensions/content quality; or an owner/UBO identity that hasn't completed its own compliance | Re-upload realistic, high-resolution document images (≥1200×900 verified), and drive compliance on every owner identity too. The `requirements` endpoint reflects Borderless-side readiness only. |
| Compliance check shows `slug: null` and sits at `NotStarted` | Type-driven check — null slug does **not** mean "no check needed" | Use the compliance **type** as the path ref: `GET/POST /identities/{id}/compliance-checks/{type}`. |
| `Validation error from PFI` (no details) on retry | Often a tainted PI — see "Tainted payment instructions" below | Create a fresh payment instruction and resubmit against it. |

### Webhooks

| Message | Cause | Fix |
|---|---|---|
| `404 Not Found` on `PUT /notifications/webhooks/settings/{id}` | Wrong method | Use `PATCH`, not `PUT`. Body must include `url` even when only toggling `enabled`. |
| Webhook record shows `enabled: false` | Borderless auto-disabled after exhausting the delivery retry budget | See `cookbook/webhook-replay.md`. Fix the endpoint, then `PATCH` to re-enable. Re-enabling does **not** replay missed events — reconcile the gap separately. |

---

## Asynchronous errors (transaction submitted, then `Failed`)

The transaction returned `Submitted`. You polled or got a webhook. `status` is now `Failed` and `failureReason.details[].pfiErrorMessage` carries the real cause. Always read it before retrying.

### Payment-instruction issues

| `pfiErrorMessage` | Cause | Fix |
|---|---|---|
| `No bankSlug found for payment instruction` | Discovery returned `allInstitutionsSupported: false` and you didn't include a slug | Re-discover via `/withdrawals/institutions`, pick a slug from `supportedInstitutions`, create a fresh PI. |
| `bankAccountNumber is invalid` (EU/SEPA) | Carried a bare account number instead of the full IBAN | Recreate the PI with the IBAN in `bankAccountNumber`. |
| `Account number must be 22 digits long (CBU or CVU)` | Argentina account number wrong length | Use the exact 22-digit CBU/CVU. |
| `Invalid bank code` | Bank slug from a different PFI than the one currently routing the corridor | Re-discover slugs at runtime. They are PFI-specific and become stale when routing changes. |
| `bank.ifscCode is required` | Used `bankCode` for IN/IMPS_FIRC instead of `localRoutingCode` | Recreate the PI with `localRoutingCode` holding the IFSC. |
| `bank.bsbNumber is required` (AU) / `bank.transitNumber is required` (CA) / `bank.bankCode is required` (JP) | Routing identifier missing | Add the routing field per the corridor's spec. AU and CA: `localRoutingCode`. JP: `bankCode`. |
| `accountType is required` | Missing `bankAccountType` | Add `Checking` or `Savings`. |
| `Failed to create account: Missing required fields: bank.{field}` (e.g. `bank.branchCode`, `bank.bankCode`) | The PI created fine but the corridor needs a routing/identifier field that isn't validated at creation time — it only surfaces when the PFI builds the account | Recreate the PI with the field set: branch/agência codes and JP bank codes go in `localRoutingCode` / `bankCode`. If the field the PFI names is `bank.iban` but PI creation rejects a top-level `iban` for that corridor (`iban should not exist`), no schema field maps to it — flag the route to support@borderless.xyz. |
| `Failed to create account: ... address.postalCode (value "…" does not match expected format)`, `path: identity.address.postalCode` | Some corridors validate the **sender identity's own** address postal code against the destination country's format at PFI account creation — surfaces async, not at PI creation | The failing field is the sender identity's address, not the destination PI. Use a sender identity whose address postal code matches the destination country's format for that route, or confirm the requirement with support@borderless.xyz. |
| `country code does not match` | Identity's `address.country` doesn't match the withdrawal's destination country (some PFIs require this) | Create / use an identity whose `address.country` matches the destination. |

### Compliance issues

| `pfiErrorMessage` | Cause | Fix |
|---|---|---|
| `Compliance workflow was cancelled` | You submitted the transaction before compliance reached `Approved` / `PreApproved` | Wait for compliance to clear, then submit a fresh transaction. The cancelled one is terminal — don't retry it. |
| `identity: Compliance check failed` | A required compliance check (possibly a null-slug/type-driven one, or one on an owner identity) never reached `Approved` | List checks on **every** identity involved; drive null-slug checks by type. See the compliance skill's "Owner identities" section. |
| `No suitable ramp config found for organization` | Corridor not provisioned for your org on the relevant side (deposits and withdrawals are configured separately) — or the asset you chose came from an inactive provider's config | Validate against `GET /organizations/network?status=active` (see `cookbook/discovery.md`); if the corridor is genuinely missing, contact support@borderless.xyz. |
| `Failed to validate if bank account belongs to …` | The PFI verifies destination-account ownership against the tax-ID holder — a protection against misdirected payouts (some LATAM corridors) | Use a tax ID and bank account that match. In sandbox, request PFI-issued test credentials via support. |

### Provider / corridor issues

| `pfiErrorMessage` | Cause | Fix |
|---|---|---|
| `No suitable service` | Wrong `paymentMethod` for the corridor on this PFI | Re-discover via `/withdrawals/options`. |
| `amount must be less than X USD` | Per-transaction limit hit | Reduce amount. Some corridors have low caps (e.g., NGN ≈ $3,164 USD per transaction). |
| `Amount for {CCY} in {CC} is above maximum limit: N` | Per-transaction cap, quoted in destination fiat — but the withdrawal `amount` you sent is in the **source asset** (USDC) | Convert the fiat cap to source-asset units via a quote and stay under it. The source-asset ceiling moves with FX — recompute it from the current quote's `exchangeRate` (`cap / exchangeRate`) rather than hardcoding a USDC figure. |
| `address unavailable` | PFI hasn't provisioned a sandbox deposit address for this corridor | Provider-side issue. Contact support. |
| `partner rate does not exist` | Asset/currency pair not supported by the routed PFI | Try a different asset (e.g., switch from `USDT_TRON` to `USDC_ETHEREUM`). |
| `omnibus not configured for organization` | Backend configuration missing | Contact support. |
| `please upload an invoice for the payment` | Invoice-required corridor (IN, GH, CN, BR ≥ 50,000 BRL) and the withdrawal omitted `documents` | Resubmit a new withdrawal with a `documents: [{ type: "Invoice", content: "..." }]` array. |

---

## Tainted payment instructions

When a withdrawal fails because of a problem with the PI (missing field, format error, ownership-validation failure), retries against the **same** PI can come back with a generic "Validation error from PFI" — no details, no fix you can act on. The PI has been "tainted" on the PFI side; their state machine treats it as already-bad.

**Symptom:** The first attempt's `pfiErrorMessage` was specific (e.g., "bank.ifscCode is required"). You fixed the cause. Retry returns "Validation error from PFI" with no further detail.

**Fix:** Don't reuse the PI. Create a fresh `paymentInstructionId` with the corrected fields and submit the withdrawal against the new ID.

```
1. POST /identities/{id}/payment-instructions  (corrected details)
2. POST /withdrawals  (paymentInstructionId = the new one)
```

This is true even when the underlying problem was on the identity, not the PI itself — the PFI may not re-evaluate a PI it has already rejected.

---

## Debugging workflow

1. **Get the failure detail.** `GET /transactions/{id}` and read `failureReason.details[].pfiErrorMessage`.
2. **Match the message** against the tables above.
3. **PI-related fix:** create a fresh PI (do not update the old one — they're immutable) and resubmit.
4. **Identity-related fix:** `PATCH /identities/business/{id}` or `/identities/personal/{id}`. Re-send **all** fields you care about; some integrations have observed PATCH wiping unrelated fields when only a subset is sent. Re-run compliance if requirements changed.
5. **Provider-side error** ("omnibus not configured", "address unavailable", anything that smells like infra): file a ticket. There's no client-side fix.

---

## Status reference

### Transaction status (`TransactionStatus` enum)

| Status | Meaning | Action |
|---|---|---|
| `Submitted` | Received and queued | Poll. |
| `Verifying` | PFI KYC review in progress | Poll. |
| `Orchestrating` | Borderless picking the PFI / preparing the transfer. Non-terminal. | Poll. On some routes this can sit far past the usual settlement window before moving to `Completed` or `Failed`, and a stalled one can eventually fail with a generic message. Poll with a hard timeout; treat a long-static `updatedAt` as not-yet-settled, not an error. **Never resubmit a still-`Orchestrating` transaction** — reuse the same `idempotency-key` if you retry the poll, not a new transaction. |
| `Pending` | Awaiting action from sender (deposit) or `withdrawalOnchainInstruction` populated (withdrawal) | Take the next step in the flow. |
| `Processing` | Funds moving on the PFI side | Poll. |
| `Completed` | Done. Terminal. | — |
| `Failed` | Read `failureReason.details[].pfiErrorMessage`. Terminal. | Fix, then submit a new transaction. |
| `Cancelled` | Terminal. Often compliance-related. | Fix the precondition, then submit a new transaction. |
| `Refunded` | PFI returned funds after a post-broadcast failure. Terminal. | Reconcile against your ledger; check `refundAddress` (withdrawal) or PFI bank record (deposit). |

### Compliance status (`ComplianceStatus` enum)

| Status | Meaning | Action |
|---|---|---|
| `NotStarted` | Default before you `POST /compliance-checks/{slug}`. | Run requirements check, then start. |
| `Started` | PFI is picking up the check. | Poll / webhook. |
| `Incomplete` | PFI started but is blocked on missing info. | Refetch `requirements`. Read `missingFields`, `requiredDocuments`, `requiredExtras`. Patch identity / re-upload doc / accept ToS, then re-poll. |
| `AwaitingUbo` | Business identity waiting on UBO compliance. | Drive each UBO personal identity to `Approved` / `PreApproved`. |
| `UnderReview` | Human review at the PFI. Can sit here for hours / days in production, sometimes indefinitely in sandbox. | Wait. Set a hard timeout if your UX would be blocked. |
| `PreApproved` | No per-identity check needed for this corridor. | Transact immediately. |
| `Approved` | Terminal success. | Transact. |
| `Rejected` | Terminal failure. | Read `rejectionReasons` (`DocumentExpired`, `DocumentBlurry`, etc.). Fix and re-discover a slug. |
| `Cancelled` | Check cancelled (corridor deprecated, requirements changed). | Re-discover slugs and start over. |

---

## Related

- Withdrawal field requirements per corridor: `borderless-withdrawal-flow` skill, "Payment instruction `details` by corridor" (machine-readable mirror: `data/corridors.json`).
- Per-provider message signatures: `providers/` — when a failure carries a `pfiName`, check that provider's page.
- Corridor/asset validation before building: `cookbook/discovery.md`.
- Compliance failure detail: `borderless-compliance-flow` skill.
- Webhook delivery failures (auto-disable, replay): `cookbook/webhook-replay.md`.
- Reconciling a gap from a missed-webhook window: `cookbook/reconciliation.md`.
