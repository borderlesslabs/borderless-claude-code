---
name: borderless-compliance-flow
description: Use when building or debugging the Borderless compliance flow — creating a personal or business identity, discovering required documents for a specific PFI/corridor, uploading documents, accepting ToS, and initiating the KYC/KYB check. Triggers on mentions of identities, KYC, KYB, compliance checks, or terms of service in a Borderless context.
---

# Borderless Compliance Flow

The compliance flow establishes that an identity is cleared to transact through a specific PFI for a specific corridor. Every transaction on Borderless requires a compliant identity.

**Mental model:** An identity is created once. Compliance is then granted per-corridor via a `slug` — a specific combination of PFI, country, asset, fiat, and payment method. The same identity can hold multiple compliance checks for different corridors.

## The six steps

```
1. Create identity                 → POST /identities/personal or /identities/business
2. Discover available PFIs         → GET  /identities/{id}/compliance-checks?country=...&asset=...&fiat=...&paymentMethod=...&type=...
3. Check required documents        → GET  /identities/{id}/compliance-checks/{slug}/requirements
4. Upload documents                → PUT  /identities/{id}/documents
5. Accept ToS (if required)        → handled on end-user side; confirm via metadata.hasAcceptedTos
6. Start compliance check          → POST /identities/{id}/compliance-checks/{slug}
```

Check status anytime via `GET /identities/{id}/compliance-checks` and listen for `IdentityComplianceCheck_Updated` / `IdentityComplianceCheck_Completed` webhook events.

## Step-by-step

### 1. Create the identity

Pick the right type:
- **Personal** — natural persons, including UBOs, directors, signers. KYC.
- **Business** — legal entities. KYB. Typically includes `ultimateBeneficialOwners` (UBOs) which may reference existing personal identities by `personalIdentityId` or inline a new personal identity via `personalIdentity`.

**Choosing the archetype:** the real compliance matrix is **provider × country × customer type** — requirements differ along all three axes. Two patterns that matter:

- **Consumer / end-user flows → model end users as personal identities.** Personal KYC often approves automatically in sandbox where business KYB includes review steps. If your product offramps for individual end users, create each as `POST /identities/personal` with their own account and payment instruction — don't funnel them through one corporate identity.
- **Local residents carry local KYC requirements.** An identity resident in the destination country can require country-specific documents that a foreign identity doesn't (e.g. Nigeria: `BVN_NG` + `NationalId` for NG-resident individuals; some PFIs require `citizenship` on the person). The `requirements` endpoint is per-identity — query it for **each** identity rather than generalizing from the first one.

**UBO structure (business identities):** each UBO must be a separate personal identity referenced by `personalIdentityId` — inline names are rejected. Required companions: `controlPersonTitle` when `hasControl: true`, `ownershipPercentage` when `hasOwnership: true`, and `attestedOwnershipStructureAt` as a real `YYYY-MM-DD` date (not null).

```bash
POST /identities/personal
# or
POST /identities/business
Headers:
  Authorization: Bearer {accessToken}
  Content-Type: application/json
  idempotency-key: {uuid}
```

**Capture `id` from the response** — you'll need it for every subsequent call.

**Creation and update semantics (all identity types):**

- `POST /identities/business` **always creates** a new identity, even with a duplicate email — it does not upsert. Include every provider-required field at creation time; if you miss one, update with PATCH rather than creating a second identity.
- The update path includes the type: `PATCH /identities/business/{id}` or `PATCH /identities/personal/{id}`. The bare `PATCH /identities/{id}` (and `PUT`) return 404.
- **PATCH is atomic** — one invalid field 422s the whole body and *nothing* persists. A classic trap: enriching an identity where the UBO object omits `ownershipPercentage` (required when `hasOwnership: true`) silently leaves *every* field in the request unsaved, and compliance later fails on "missing" fields you thought you set. **Check the PATCH response contains the identity `id`** (i.e. it's the updated entity, not an error body) before moving on.

### 2. Discover available PFIs for the corridor

This returns the compliance `slug` for the `{country, asset, fiat, paymentMethod, type}` combination. It also tells you whether the PFI requires ToS acceptance.

```bash
GET /identities/{identityId}/compliance-checks?country=US&asset=USDC_BASE&fiat=USD&paymentMethod=ACH&type=Deposit
```

> **Org-level alternative:** `GET /v1/compliance-checks/coverage` returns every compliance slug configured on your organization with its `coverage` array (`{type, operationType, method, fiat, country, asset}`). Useful for building a corridor-to-slug lookup once at startup, instead of querying per identity. Reject the URL params `country`/`asset`/etc. — this endpoint takes none.

Key response fields:
- `slug` — identifier for this specific compliance check. Save it.
- `status` / `kycStatus` — current compliance state. See the [status table](#status-values) below for the full enum. Both fields usually mirror each other.
- `metadata.tosLink` — if non-null, present this link to the end user and have them accept before step 6.
- `metadata.hasAcceptedTos` — boolean confirming acceptance.
- `coverage` — the corridors this slug unlocks.

**Null-slug checks are still real checks.** Some providers' checks appear with `slug: null` but a populated `type` (e.g. a `{Provider}_base` type). A null slug does **not** mean "no check needed" — transactions fail until the check is `Approved`. Drive these **by type**: the `{slug}` path parameter accepts the compliance type string for both `GET .../compliance-checks/{type}/requirements` and `POST .../compliance-checks/{type}`. Rule of thumb: `ref = slug ?? type` for every compliance-check call.

### 3. Check required documents and fields

```bash
GET /identities/{identityId}/compliance-checks/{slug}/requirements
```

Key response fields:
- `missingFields` — identity fields still needed (e.g., `address.postalCode`). Patch them onto the identity via update endpoints.
- `requiredDocuments[].mode` — `oneOf` (pick one) or `allOf` (provide all).
- `requiredDocuments[].documents` — list of accepted document types from the `IdentityDocumentType` enum: `Passport`, `DriverLicense`, `NationalId`, `ResidencePermit`, `Formation`, `Ownership`, `ProofOfAddress`, `SourceOfFunds`, `IndividualHolding`, `BVN_NG` (Nigeria Bank Verification Number), `Selfie`, `Aadhaar` (India), `PAN` (India). The `subType` field carries finer-grained classification for `ProofOfAddress` (`UtilityBill`, `BankStatement`, `RentalAgreement`, `TaxDocument`, `GovernmentCorrespondence`).
- `requiredExtras.acceptTermsOfService.link` — ToS URL if applicable.

Use this to drive your UI. Only ask the end user for what this endpoint says is required.

**Caveat — an all-clear requirements response doesn't guarantee initiation succeeds.** `requirements` reflects Borderless-side readiness. Some PFI-side validations (notably document image dimensions/content quality) only run at initiation, when the PFI creates its customer record. If initiation fails with a generic customer-creation error while `missingFields`, `requiredDocuments`, and `requiredExtras` are all empty, suspect document image quality first — upload realistic, high-resolution images (≥1200×900 has been verified where 300×300 placeholders were declined) and re-initiate. See `providers/` for provider-specific validation notes.

### 4. Upload documents

Images must be **base64-encoded** at **at least 200×200 pixels**.

```bash
PUT /identities/{id}/documents
Headers: Authorization, Content-Type, idempotency-key
Body: {
  "issuingCountry": "US",
  "type": "Passport",
  "issuedDate": "2024-07-25",
  "expiryDate": "2027-07-25",
  "imageFront": "data:image/jpeg;base64,...",
  "imageBack": "data:image/jpeg;base64,..."
}
```

Documents persist on the identity. If the same identity later needs compliance with a different PFI that accepts the same doc type, you don't re-upload.

Notes:

- `DriverLicense` requires **both** `imageFront` and `imageBack`. Metadata-only uploads (no image) create the record but fail at compliance initiation.
- Document `issuingCountry` should match the identity's `address.country`.
- **Reading documents back:** `GET /identities/{id}/documents` returns `[]` even when documents exist. Uploaded documents live on the identity object — `GET /identities/{id}` → `.documents`.

### 5. Confirm ToS acceptance

If step 2 returned `metadata.tosLink`, the end user must visit that link and accept. Re-fetch the compliance check and confirm `metadata.hasAcceptedTos === true` before proceeding.

Each identity needs its own ToS acceptance — links are not reusable across identities.

### 6. Start the compliance check

```bash
POST /identities/{identityId}/compliance-checks/{slug}
Headers: Authorization, Content-Type, idempotency-key
# No body required
```

Response returns `{ slug, status, metadata }`.

## Owner identities have their own compliance checks

For business identities, the compliance work doesn't stop at the business. **Some PFIs onboard each owner/UBO personal identity as its own customer** — the owner identity carries its *own* compliance checks (same provider, separate check), each needing its own ToS acceptance, document set, and initiation. Symptoms of skipping this: the business check looks fine but customer creation fails, or the business check parks at `AwaitingUbo`.

The full loop for a business identity:

```
for identity in [business, ...each owner personal identity]:
  1. GET  /identities/{id}/compliance-checks              → find checks (slug or type)
  2. GET  .../compliance-checks/{ref}/requirements        → per-identity requirements
  3. accept any ToS links (per identity — links are not shared)
  4. POST .../compliance-checks/{ref}                     → initiate
  5. poll until Approved / PreApproved
```

Owner identities can also carry fields the business identity doesn't accept — e.g. `citizenship` is set on the *personal* identity via `PATCH /identities/personal/{id}` (the business identity rejects it, and the field is `citizenship`, not `nationality`).

## Status values

Compliance-check `status` (and `kycStatus`, which usually mirrors it) goes through these values. The full `ComplianceStatus` enum from the API spec:

| Status | Meaning | Terminal? |
|---|---|---|
| `NotStarted` | Default after step 2, before you POST to start the check. Not an error — many checks sit here until you call step 6. | No |
| `Started` | Check has been initiated by step 6; PFI is picking it up. | No |
| `Incomplete` | PFI started the check but is blocked on missing info. Refetch `requirements` — `missingFields`, `requiredDocuments`, or `requiredExtras` will say what's needed. | No |
| `AwaitingUbo` | (Business identities) PFI is waiting on UBO compliance. The UBO personal identities each have their own `status` — chase those. | No |
| `UnderReview` | PFI has human-review in the loop. Can sit here for extended periods in sandbox (Bridge in particular). | No |
| `PreApproved` | PFI requires no per-identity check for this corridor — you can transact immediately. | Yes (success) |
| `Approved` | Terminal success. PFI has cleared the identity for this corridor. | Yes (success) |
| `Rejected` | Terminal failure. Read `rejectionReasons` for the structured reason codes (e.g., `DocumentExpired`, `DocumentBlurry`). | Yes (failure) |
| `Cancelled` | Check was cancelled — typically because requirements changed or the PFI deprecated the corridor. Re-discover and start over. | Yes |

Treat `NotStarted`, `Started`, `Incomplete`, `AwaitingUbo`, `UnderReview` as non-terminal. Poll or wait for a webhook. **Do not assume `Completed` exists** — it's not in the enum. Success is `Approved` or `PreApproved`.

## Timelines

- **Personal (KYC):** minutes to a few hours. Some PFIs are near-instant.
- **Business (KYB):** 1–4 days typical.
- **RFIs (Requests for Information):** 24–48 hours after the PFI asks. These are communicated manually. Watch for `incompleteReasons` or `rejectionReasons` in the compliance check response.
- **Sandbox note:** Sandbox checks usually approve within seconds of initiation, but some PFIs spend **2–3 minutes** in `UnderReview` before flipping to `Approved` — poll for at least a few minutes before treating a check as stuck. A minority can park in `UnderReview` longer; set a hard timeout and don't block user-facing flows on it.

## Tracking status

Two options:

**Polling** — re-call the list endpoint with the corridor query and read the first element:

```
GET /identities/{id}/compliance-checks?country={country}&asset={asset}&fiat={fiat}&paymentMethod={paymentMethod}&type={Deposit|Withdrawal}
```

There is no singular `GET /identities/{id}/compliance-checks/{slug}` — it returns 404. Use the list variant on a back-off schedule.

**Webhooks (recommended)** — subscribe to:
- `IdentityComplianceCheck_Updated` — fires on every state change.
- `IdentityComplianceCheck_Completed` — fires when the check reaches a terminal state.

See the `borderless-webhook-verifier` skill for signature verification.

## Common mistakes

- **Skipping the requirements check.** Calling `POST /compliance-checks/{slug}` with missing fields or docs fails silently — the check starts but immediately blocks on `incompleteReasons`.
- **Reusing a ToS link across identities.** Each identity needs a fresh acceptance.
- **Completing a ToS acceptance without the redirect.** Where a PFI's ToS link is an interactive page, the redirect back to Borderless is what records the acceptance. Complete it in a real browser and let the redirect finish — don't call the callback URL directly.
- **Treating `NotStarted` as an error.** It's the default state before step 6. Only `Rejected` and explicit `incompleteReasons` mean something is wrong.
- **Treating a null slug as "no check".** Drive it by compliance type (see step 2).
- **Driving compliance only on the business identity.** Owner/UBO identities can carry their own checks — see "Owner identities" above.
- **Re-uploading documents on every compliance check.** Borderless persists them on the identity. Only upload once per unique document.
- **Submitting transactions before every applicable check is `Approved`/`PreApproved`.** `Started` and `UnderReview` are not sufficient — the transaction fails terminally and must be recreated. Gate transaction submission on compliance state, and when the gate blocks, fix the gate.

## When generating code

- Always wrap the full flow in a single orchestration function that takes `{ identityInput, corridor }` and returns `{ identityId, slug, status }`.
- Persist `identityId` and `slug` to your database **before** calling step 6, so you can resume if the process is interrupted.
- Treat each step as independently retryable with its idempotency key.

## Full reference

The Borderless quick-start covers this flow end-to-end at https://docs.borderless.xyz/docs/quick-start-guide.md (the Identities & Compliance section). The API reference for each endpoint is linked from that page.
