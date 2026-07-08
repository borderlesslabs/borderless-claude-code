# Bridge — integration notes

> Last verified: 2026-04 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Corridors observed: **US/USD (ACH, Wire)**, **EU/SEPA**, USD virtual accounts.

## Compliance behavior

- **ToS acceptance, then compliance initiation.** Bridge runs a full KYB program; in sandbox, checks usually approve shortly after initiation but can spend **2–3 minutes** in `UnderReview` before reaching `Approved`. Give it a few minutes before escalating — a check in `UnderReview` is progressing, not stuck.
- **The ToS redirect completes the acceptance.** The `acceptTermsOfService.link` opens an interactive Bridge page. The redirect back to Borderless after clicking Accept is what persists the `signed_agreement_id`. If the redirect is skipped or pre-empted — e.g. hitting the callback URL directly with `curl` — the acceptance isn't recorded, and initiation returns **"Signed agreement id is required."** Use a real browser, click Accept, and let the redirect complete (~8 seconds). Each link is single-use; if the redirect doesn't complete, re-fetch `requirements` for a fresh link.

## Identity requirements (business)

Bridge's KYB program expects a fully-enriched business identity. Provide these at creation time — missing fields surface at compliance initiation, not identity creation:

- `businessIndustryCode` — **NAICS codes from a validated enum.** `522320` (Financial Transactions Processing) and `523910` (Miscellaneous Intermediation) are known-valid; verify your code against the enum in the `requirements` response.
- `accountPurpose` (enum: `third_party_money_transmission`, `payroll`, …), `website`, `sourceOfFunds`.
- `ultimateBeneficialOwners` — each UBO references a personal identity by `personalIdentityId` (inline names are not accepted). `controlPersonTitle` is required when `hasControl: true`; `ownershipPercentage` is required when `hasOwnership: true`.
- **`address.state` takes ISO 3166-2 subdivision codes, not free text.** This applies globally — e.g. Singapore uses `01`–`05` (`01` = Central Singapore). `state: "Singapore"` returns "Invalid subdivision code".

## Payment instruction notes

- **EU/SEPA:** carry the full IBAN in `bankAccountNumber` (e.g. `DE89...`); the `iban` field name is not part of this DTO (`422 iban should not exist`). Also provide `swiftOrBicNumber` (8+ chars) and `accountOwnerType` (`Personal`/`Business`, plus `businessName` when Business). A bare account number passes PI creation but the withdrawal reports "bankAccountNumber is invalid" asynchronously. *(Org-dependent: SEPA routed through other PFIs may use a different shape — discovery is authoritative.)*

## Feature enablement (org-level)

- **SEPA/Euro is enabled per organization.** Until your org is provisioned, EUR transactions return **"Please contact Bridge to enable SEPA/Euro or SWIFT services"** even with compliance `Approved`. Coordinate through support@borderless.xyz — it's a quick enablement, not an integration issue.

## Sandbox notes

- USD virtual accounts via Bridge activate reliably, typically within seconds — a good first VA corridor.
- Document uploads need `imageFront` included: metadata-only uploads surface as **"Could not find the key … in the 'kyc-docs-sandbox' bucket"** at compliance time — re-upload with the base64 image.

## Message signatures

| Message | Meaning → next step |
|---|---|
| `Signed agreement id is required` | ToS redirect didn't complete → fresh link, real browser, let redirect finish |
| `Invalid subdivision code` | `address.state` is free text → use the ISO 3166-2 code |
| `Please contact Bridge to enable SEPA/Euro or SWIFT services` | Org-level enablement pending → support@borderless.xyz |
| `Could not find the key … in the 'kyc-docs-sandbox' bucket` | Document uploaded without `imageFront` → re-upload with image |
| `bankAccountNumber is invalid` (async, SEPA) | Bare account number instead of full IBAN → recreate PI |
