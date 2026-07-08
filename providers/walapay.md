# Walapay — integration notes

> Last verified: 2026-06 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Corridors observed: **GB/GBP**, **AE/AED (NPSS)**, **EG/EGP**, **TR/TRY (EFT)**, **IN/INR (IMPS_FIRC)**, **PH/PHP**, MX/MXN. Walapay covers an unusually broad corridor set, and several of its corridors use distinct payment-instruction shapes — worth reading before building.

## Compliance behavior

- **ToS acceptance + initiation**, approving in sandbox shortly after initiation (seconds to ~1 minute).
- **Every owner/UBO identity is onboarded as its own Walapay customer.** The business identity *and* each owner personal identity carry separate Walapay compliance checks, each with its own ToS acceptance and initiation. Drive compliance on all of them — a business check alone isn't sufficient for customer creation. See "Owner identities" in `borderless-compliance-flow`.
- **Document images are quality-validated at customer creation.** Walapay checks image dimensions and content when the customer is created at initiation time — a genuinely useful control, but note the sequencing: the `requirements` endpoint reflects Borderless-side readiness and reports all-clear *before* this validation runs. If initiation returns a generic **"Error creating customer" / "Validation error from PFI"** with empty requirements, the most common cause is an image that's too small or low-content. Upload real-quality images (**≥1200×900** verified working in sandbox) and re-initiate.

## Identity requirements

- Business identity: non-empty `description` and `dateOfIncorporation`.
- UBO personal identity (US persons): 9-digit SSN `taxId`, **DriverLicense with both `imageFront` and `imageBack`** (Passport is for non-US persons).
- **Non-US individuals: Passport required.**
- `attestedOwnershipStructureAt` on each UBO must be a valid `YYYY-MM-DD` date.
- **US state coverage: NY and AK addresses are not currently supported** (state licensing scope). Use a supported state — Delaware is verified — for sandbox identities.

## Payment instruction notes

- **AE/NPSS and EG/BankTransfer use the IBAN-only shape**: `details` takes `iban` (+ `bankSlug` for EG, + `address`); `bankName`, `accountHolderName`, `bankAccountNumber` are not part of this DTO (`should not exist`).
- **TR/EFT uses the standard shape** (`bankSlug`, `bankName`, `accountHolderName`, `bankAccountNumber` holding the IBAN, `address`).
- **GB/BankTransfer:** on some orgs the account is validated as a **UK IBAN** (`GB29...`) in `bankAccountNumber` — if a plain 8-digit account number returns "bank.iban must match IBAN regex", switch to IBAN format. *(Org-dependent.)*
- **IN/IMPS_FIRC:** IFSC code goes in `localRoutingCode` (`localRoutingNumber` is not accepted; `bankCode` is ignored). `localRoutingCode` is accepted on creation but not echoed in GET responses. Withdrawals require an Invoice in `documents` on the withdrawal call — an Indian regulatory requirement (FIRC).
- **PH/BankTransfer (GCash):** discover the GCash `bankSlug`; `bankAccountNumber` carries the phone number. Allow a little longer for processing (~60s in sandbox).

## Feature enablement (org-level)

- **Virtual accounts are enabled separately from transactional compliance.** A VA request can return "Customer has not been approved for virtual bank accounts" even when the identity is `Approved` for deposits and withdrawals. Coordinate VA enablement through support@borderless.xyz.
- New sandbox orgs need the Walapay integration configured before discovery works ("Walapay API Key is not configured for this organization") — support handles this during provisioning.

## Limits

- **TR/TRY: 100,000 TRY per transaction.** The withdrawal `amount` is in source-asset units (USDC) — convert before checking the cap (~2,900 USDC at 2026-06 rates).

## Message signatures

| Message | Meaning → next step |
|---|---|
| `compliance: Error creating customer.` / `Validation error from PFI` at initiation | Image below quality threshold, or an owner identity not yet onboarded → 1200×900+ images, drive owner compliance |
| `bank.iban must match IBAN regex` | GBP PI expects IBAN format in `bankAccountNumber` |
| `localRoutingNumber should not exist` | Use `localRoutingCode` for the IFSC |
| `Failed to retrieve or create Walapay bank account` | Often transient — retry once before deeper debugging |
| `Customer has not been approved for virtual bank accounts` | VA enablement pending → support@borderless.xyz |
| `Walapay API Key is not configured for this organization` | Org provisioning pending → support@borderless.xyz |
