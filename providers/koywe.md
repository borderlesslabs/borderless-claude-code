# Koywe — integration notes

> Last verified: 2026-07 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Corridors observed: **AR (COELSA)**, **CL (SPAV)**, **CO (PSE)**, **MX (SPEI)**, **PE (CCE)**.

Koywe runs some of the most thorough data validation in the network — real local tax-ID formats, exact account-number formats, and destination-account ownership verification. That rigor is a feature: a payout that passes Koywe validation is a payout going to the right person. It does mean sandbox test data has to be realistic, and it means the origin identity has to be set up for the destination country. Details below.

## Compliance behavior

- Compliance is initiated per slug (`POST /identities/{id}/compliance-checks/{slug}` with `idempotency-key`); approves in sandbox once identity data passes validation.
- **Personal KYC is not country-locked.** A complete personal identity approves regardless of where the person is registered — a US-registered personal identity approves in ~15 seconds once `activity` is set (Koywe requires a non-null `activity`; free text, 1–255 chars). The country constraint below applies to *transacting*, not to identity approval.
- **Business KYB can carry residual sandbox state.** On some orgs, initiating the business check returns `Document already exists for this client` because Koywe's sandbox already holds a customer/document record for that business from a prior run. There is no client-side document delete for this — coordinate a provider-side reset with support@borderless.xyz. *(Org-dependent.)*

## Identity requirements

- **Both directions hard-require `identity.address.country` == destination country** (confirmed 2026-07 on withdrawals and deposits). A US-registered identity cannot transact on an AR/CL/CO/MX/PE rail — Koywe's underlying rule is "account from USA can't operate in [country]". Plan **one identity per Koywe-served destination country** — the identity's registered address country has to equal the corridor country. With a destination-country identity, both deposit and withdrawal complete cleanly (verified end-to-end for MX).
- **Tax IDs are validated against real local formats:**
  - Argentina: CUIT with a valid **mod-11 check digit** (11 digits; prefixes 20/23/24/27 individuals, 30/33/34 businesses). Fabricated digits won't pass — compute a valid check digit for test data. (US tax IDs on a US identity pass without the CUIT checksum check — that validation only bites LATAM tax IDs.)
  - Colombia: NIT format.
  - **Mexico: the identity document's `idNumber` is validated as a CURP** for individuals — a passport number is rejected (`identity.document.idNumber: format is invalid: CURP-…`). Use an 18-character CURP with a valid check digit. Koywe also enforces CURP **uniqueness across its sandbox** — a previously used CURP returns `identity.Account already exists with document.idNumber … and type CURP in MEX`; generate a fresh one per test identity.
- Document `issuingCountry` should match the identity's `address.country`.

## Payment instruction notes

- **`bankSlug` AND `bankAccountType` are both required** for AR/COELSA and CO/PSE. Missing slug → "bankCode is required"; missing type → "accountType is required and must be one of: checking,savings,interbanking". Send `Checking`/`Savings` (PascalCase) — Borderless translates. All observed corridors report `allInstitutionsSupported:false` with slug-based institution identifiers (long opaque tokens, distinct per corridor).
- **AR account numbers are a 22-digit CBU/CVU**, exactly.
- **MX/SPEI:** `{bankName, accountHolderName, bankAccountNumber (18-digit CLABE), address}` — no `bankSlug` needed. **The CLABE's mod-10 check digit is validated at payout** ("Bank account is invalid … and belong to …" when it fails). Koywe is stricter here than the corridor's other providers, so a synthetic CLABE that works elsewhere can fail on Koywe — compute a valid check digit (weights 3,7,1 over the first 17 digits).
- **Destination-account ownership is verified**: the CBU must belong to the tax-ID holder — a strong protection against misdirected payouts. Fabricated sandbox data won't pass this check by design; request PFI-issued test credentials through support@borderless.xyz for end-to-end sandbox testing.
- **Withdrawal bodies require `paymentPurpose` and reject `paymentMethod`** (`paymentMethod should not exist` — the method comes from the payment instruction; verified live 2026-07). `paymentPurpose` comes from a closed enum (`salary payment, personal remittance, rent payment, property purchase, owned account abroad, advertising expenses, advisory fees, business insurance, construction, delivery fees, education, exports, donation, hotel, loan payment, maintenance expenses, medical expense, office expenses, royalty fees, service charge, shares investment, tax payment, transportation fees, travel, utility bills, other`) — `other` is a safe default.
- **Deposit bodies require `paymentMethod` but reject `paymentPurpose`** (`paymentPurpose should not exist`). The field is withdrawal-only.

## Limits

- Deposit `fromAmount` is denominated in the **fiat** currency; withdrawal `fromAmount` is in **source-asset** (e.g. USDC) units. Convert before checking a minimum.
- Per-corridor deposit minimums observed: AR **5,000 ARS**, CL **2,000 CLP**, CO **4,050 COP**, MX **50 MXN**-equivalent. A below-minimum quote returns e.g. `Amount for ARS in AR is below minimum limit: 5000.00 ARS`.

## Sandbox notes

- **A deposit from a wrong-country identity can currently surface as `Provider credentials are invalid`** at the settlement step (a few seconds after `Submitted` — the transaction is created, then flips to `Failed`). The underlying Koywe response is the country rule above ("account from USA can't operate in [country]"), not a credential problem; the error mapping is being improved. If you see this on a deposit, check the identity's `address.country` against the corridor first.
- **A deposit that flips to `Failed` shortly after `Submitted` can be a transient async bank-provisioning step, not a terminal result.** Re-poll before treating it as final — a genuine provisioning flip resolves to `Completed`. A persistent, unchanging `Provider credentials are invalid` across several re-polls is the credential gap above, which won't clear client-side.

## Verified end-to-end (2026-07)

A full MX **deposit and withdrawal** pair completed on a fresh sandbox org following exactly the rules above: MX-registered personal identity (`activity` set, `sourceOfFunds` in the personal PascalCase enum e.g. `Salary`) → `NationalId` document with a unique, check-digit-valid CURP → compliance `Approved` in ~15s → SPEI payment instruction with a checksum-valid CLABE → withdrawal `Completed` in ~90s, pinned `pfiName` holding as Koywe throughout.

## Message signatures

| Message | Meaning → next step |
|---|---|
| `identity.document.idNumber: format is invalid: CUIT-…` | Tax ID needs a valid mod-11 check digit |
| `identity.document.idNumber: format is invalid: CURP-…` | MX individuals: document `idNumber` must be a valid CURP, not a passport number |
| `identity.Account already exists with document.idNumber …` | CURP already registered at the PFI — use a fresh, unique CURP per test identity |
| `Bank account is invalid … and belong to …` | Account-number checksum failed (MX: CLABE mod-10) — compute a valid check digit |
| `Account number must be 22 digits long (CBU or CVU)` | Use the exact 22-digit AR format |
| `The country code of the bank account does not match the user's registered country` | Withdrawal identity's `address.country` ≠ destination → use an identity registered in the destination country |
| `accountType is required and must be one of: checking,savings,interbanking` | Add `bankAccountType` to PI details |
| `paymentMethod must be one of the following values: …` (deposit) | Add `paymentMethod` to the deposit body |
| `paymentPurpose should not exist` | Drop `paymentPurpose` from a deposit body (withdrawal-only field) |
| `Failed to validate if bank account … belongs to …` | Ownership verification vs test data → request test credentials via support |
| `Provider credentials are invalid` (deposit, at settlement) | Usually the identity-country rule surfacing under a generic message (mapping fix in progress) → use an identity registered in the corridor country |
