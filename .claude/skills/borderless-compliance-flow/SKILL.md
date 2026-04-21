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

### 2. Discover available PFIs for the corridor

This returns the compliance `slug` for the `{country, asset, fiat, paymentMethod, type}` combination. It also tells you whether the PFI requires ToS acceptance.

```bash
GET /identities/{identityId}/compliance-checks?country=US&asset=USDC_BASE&fiat=USD&paymentMethod=ACH&type=Deposit
```

Key response fields:
- `slug` — identifier for this specific compliance check. Save it.
- `status` / `kycStatus` — current compliance state. See the [status table](#status-values) below for the full enum. Both fields usually mirror each other.
- `metadata.tosLink` — if non-null, present this link to the end user and have them accept before step 6.
- `metadata.hasAcceptedTos` — boolean confirming acceptance.
- `coverage` — the corridors this slug unlocks.

### 3. Check required documents and fields

```bash
GET /identities/{identityId}/compliance-checks/{slug}/requirements
```

Key response fields:
- `missingFields` — identity fields still needed (e.g., `address.postalCode`). Patch them onto the identity via update endpoints.
- `requiredDocuments[].mode` — `oneOf` (pick one) or `allOf` (provide all).
- `requiredDocuments[].documents` — list of accepted document types (`Passport`, `DriversLicense`, etc.).
- `requiredExtras.acceptTermsOfService.link` — ToS URL if applicable.

Use this to drive your UI. Only ask the end user for what this endpoint says is required.

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

## Status values

Compliance-check `status` (and `kycStatus`, which usually mirrors it) goes through these values. Not every check hits every intermediate state.

| Status | Meaning |
|---|---|
| `NotStarted` | Default after step 2, before you POST to start the check. Not an error. |
| `Started` | Check has been initiated by step 6; PFI is picking it up. |
| `InProgress` | PFI is running the check. |
| `UnderReview` | PFI has human-review in the loop. Can sit here for extended periods in sandbox (Bridge in particular). |
| `Completed` / `Approved` | Terminal success. Depending on PFI the field may hold either literal value — handle both. |
| `Rejected` | Terminal failure. Read `rejectionReasons` for why. |

Treat `NotStarted`, `Started`, `InProgress`, `UnderReview` as non-terminal. Poll or wait for a webhook.

## Timelines

- **Personal (KYC):** minutes to a few hours. Some PFIs are near-instant.
- **Business (KYB):** 1–4 days typical.
- **RFIs (Requests for Information):** 24–48 hours after the PFI asks. These are communicated manually. Watch for `incompleteReasons` or `rejectionReasons` in the compliance check response.
- **Sandbox note:** Some sandbox PFIs (Bridge in particular) can park a newly-started check in `UnderReview` indefinitely. If you're waiting on a sandbox completion, set a hard timeout; don't block user-facing flows on it.

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
- **Treating `NotStarted` as an error.** It's the default state before step 6. Only `Rejected` and explicit `incompleteReasons` mean something is wrong.
- **Re-uploading documents on every compliance check.** Borderless persists them on the identity. Only upload once per unique document.

## When generating code

- Always wrap the full flow in a single orchestration function that takes `{ identityInput, corridor }` and returns `{ identityId, slug, status }`.
- Persist `identityId` and `slug` to your database **before** calling step 6, so you can resume if the process is interrupted.
- Treat each step as independently retryable with its idempotency key.

## Full reference

The Borderless quick-start covers this flow end-to-end at https://docs.borderless.xyz/docs/quick-start-guide.md (the Identities & Compliance section). The API reference for each endpoint is linked from that page.
