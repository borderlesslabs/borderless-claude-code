# Bridge — integration notes

> Last verified: 2026-07 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Corridors observed: **US/USD (ACH, Wire)**, **EU/SEPA**, USD virtual accounts.

## Compliance behavior

- **ToS acceptance, then compliance initiation.** Bridge runs a full KYB/KYC program; in sandbox, checks usually approve shortly after initiation but can spend **2–3 minutes** in `UnderReview` before reaching `Approved`. Give it a few minutes before escalating — a check in `UnderReview` is progressing, not stuck.
- **One ToS acceptance covers every Bridge check on an identity.** Bridge's SEPA and base (USD) profiles share a single terms-of-service session — accepting once (from either link) clears ToS for both. The SEPA profile is a superset that carries the base profile with it: approving SEPA approves base as well. *(Provider-dependent.)*
- **The ToS redirect completes the acceptance.** The `acceptTermsOfService.link` opens an interactive Bridge page. The redirect back to Borderless after clicking Accept is what persists the `signed_agreement_id`. If the redirect is skipped or pre-empted — e.g. hitting the callback URL directly with `curl` — the acceptance isn't recorded, and initiation returns **"Signed agreement id is required."** Use a real browser, click Accept, and let the redirect complete (~8 seconds). Each link is single-use; if the redirect doesn't complete, re-fetch `requirements` for a fresh link.

## Identity requirements (business)

Bridge's KYB program expects a fully-enriched business identity. Provide these at creation time — missing fields surface at compliance initiation, not identity creation:

- `businessIndustryCode` — **NAICS codes from a validated enum.** `522320` (Financial Transactions Processing) and `523910` (Miscellaneous Intermediation) are known-valid; verify your code against the enum in the `requirements` response.
- `accountPurpose` (enum: `third_party_money_transmission`, `payroll`, …), `website`, `sourceOfFunds`.
- `ultimateBeneficialOwners` — each UBO references a personal identity by `personalIdentityId` (inline names are not accepted). `controlPersonTitle` is required when `hasControl: true`; `ownershipPercentage` is required when `hasOwnership: true`.
- **`address.state` takes ISO 3166-2 subdivision codes, not free text.** This applies globally — e.g. Singapore uses `01`–`05` (`01` = Central Singapore). `state: "Singapore"` returns "Invalid subdivision code".

## Identity requirements (personal)

Bridge approves personal (KYC) identities. To pass:

- Accept the Bridge ToS once (covers every Bridge check on the identity — see Compliance behavior).
- Upload a `ProofOfAddress` document.
- **Set `address.state` to a Bridge-supported US subdivision.** New York is not currently supported — initiation returns **"Unsupported subdivision NY"** and the same applies to any unsupported subdivision. This fires at initiation only; the `requirements` endpoint does not list it in `missingFields`, so treat "requirements all-clear" as necessary but not sufficient. Use a supported state and re-initiate. *(Org-dependent — the supported-subdivision set is confirmed live via a successful initiation, not from requirements.)*

With ToS, `ProofOfAddress`, and a supported subdivision in place, personal checks moved to `Approved` in roughly 1–2 minutes in sandbox.

## Payment instruction notes

- **EU/SEPA:** carry the full IBAN in `bankAccountNumber` (e.g. `DE89...`); the `iban` field name is not part of this DTO (`422 iban should not exist`). Also provide `swiftOrBicNumber` (8+ chars) and `accountOwnerType` (`Personal`/`Business`, plus `businessName` when Business), `bankName`, `accountHolderName`, and `address`. This shape is confirmed working first-attempt. A bare account number passes PI creation but the withdrawal reports "bankAccountNumber is invalid" asynchronously. *(Org-dependent: SEPA routed through other PFIs may use a different shape — discovery is authoritative.)*
- **US/USD Wire uses the same shape as ACH, including `bankAccountType`.** On some orgs, Wire PI creation returns `422` without `bankAccountType`: `"bankAccountType": ["should not be null or undefined", "must be one of the following values: Checking, Savings"]`. Provide `bankAccountType` (`Checking` or `Savings`) on both ACH and Wire — the two shapes are identical here. *(Org-dependent.)*
- **`GET /withdrawals/institutions` and `/deposits/institutions`** for Bridge US (ACH, Wire) and EU (SEPA) rails return `allInstitutionsSupported: true` with an empty `supportedInstitutions` — no bank-slug lookup is needed for these Bridge rails. `institutionIdentifier` is `swiftOrBicNumber` for SEPA and `bankRoutingNumber` for ACH/Wire (informational only while the list is empty).
- **`paymentPurpose` is case-sensitive and lowercase.** `"other"` is accepted; `"Other"` returns `422` with the full enum list. Applies API-wide, but it tripped the first withdrawal on these rails — use lowercase.
- **`POST /deposits` requires an explicit `paymentMethod` field in the body**, even when the attached payment instruction already encodes it. Omitting it returns `422` with the full `paymentMethod` enum (`ACH, Wire, Sepa, ...`). Set it to match the PI's method. This is general API behavior, surfaced here on the deposit rails.

## Feature enablement (org-level)

- **SEPA/Euro is enabled per organization.** Until your org is provisioned, EUR transactions return **"Please contact Bridge to enable SEPA/Euro or SWIFT services"** even with compliance `Approved`. Coordinate through support@borderless.xyz — it's a quick enablement, not an integration issue.

## Sandbox notes

- USD virtual accounts via Bridge activate reliably, typically within seconds — a good first VA corridor.
- **Deposits self-complete.** Sandbox deposits return non-null `instructions` and progress `Submitted → Pending → Processing → Completed` on their own (no external fiat payin needed), typically in ~30–80 seconds. Withdrawals across ACH, Wire, and SEPA completed in the same window.
- Document uploads need `imageFront` included: metadata-only uploads surface as **"Could not find the key … in the 'kyc-docs-sandbox' bucket"** at compliance time — re-upload with the base64 image.

## Message signatures

| Message | Meaning → next step |
|---|---|
| `Signed agreement id is required` | ToS redirect didn't complete → fresh link, real browser, let redirect finish |
| `Unsupported subdivision NY` (personal, at initiation) | `address.state` is an unsupported US subdivision → use a supported state and re-initiate *(org-dependent)* |
| `Invalid subdivision code` | `address.state` is free text → use the ISO 3166-2 code |
| `bankAccountType … must be one of the following values: Checking, Savings` (Wire) | Wire PI needs `bankAccountType`, same as ACH → add it *(org-dependent)* |
| `paymentMethod … must be one of the following values: ACH, Wire, Sepa, …` (on `POST /deposits`) | `paymentMethod` missing from the deposit body → add it to match the PI |
| `paymentPurpose … must be one of the following values: … other` | `paymentPurpose` sent title-cased → use lowercase (`other`) |
| `Please contact Bridge to enable SEPA/Euro or SWIFT services` | Org-level enablement pending → support@borderless.xyz |
| `Could not find the key … in the 'kyc-docs-sandbox' bucket` | Document uploaded without `imageFront` → re-upload with image |
| `bankAccountNumber is invalid` (async, SEPA) | Bare account number instead of full IBAN → recreate PI |
