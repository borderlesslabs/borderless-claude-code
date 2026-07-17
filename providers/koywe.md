# Koywe — integration notes

> Last verified: 2026-07 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Corridors observed: **AR (COELSA)**, **CL (SPAV)**, **CO (PSE)**, **MX (SPEI)**, **PE (CCE)**.

Koywe runs some of the most thorough data validation in the network — real local tax-ID formats, exact account-number formats, and destination-account ownership verification. That rigor is a feature: a payout that passes Koywe validation is a payout going to the right person. It does mean sandbox test data has to be realistic, and it means the origin identity has to be set up for the destination country. Details below.

## Compliance behavior

- Compliance is initiated per slug (`POST /identities/{id}/compliance-checks/{slug}` with `idempotency-key`); approves in sandbox once identity data passes validation.
- **Personal KYC is not country-locked.** A complete personal identity approves regardless of where the person is registered — approval lands in ~15 seconds once `activity` is set (Koywe requires a non-null `activity`; free text, 1–255 chars) and a document from `oneOf [DriverLicense, NationalId, Passport]` is on file. The country constraint below applies to *transacting*, not to identity approval.
- **Personal `sourceOfFunds` is PascalCase** (`"Salary"`), while business identities use snake_case (`"business_revenue"`) — the 422 names the enum if you mix them up.
- **Identity documents are deduplicated by ID number across Koywe's whole sandbox**, not just your org. A collision surfaces at compliance *initiation* (`identity.Account already exists with document.idNumber …`), not at document upload. Fix client-side: pick a fresh, unused ID number, re-`PUT` the document, and re-initiate — approval then lands normally.

## Identity requirements

- **Both directions hard-require `identity.address.country` == destination country** (confirmed 2026-07 on withdrawals and deposits). A US-registered identity cannot transact on an AR/CL/CO/MX/PE rail — Koywe's underlying rule is "account from USA can't operate in [country]". Plan **one identity per Koywe-served destination country** — the identity's registered address country has to equal the corridor country. With a destination-country identity, both deposit and withdrawal complete cleanly (verified end-to-end for MX).
- **Tax IDs and document ID numbers are validated against real local formats**, verified per country in 2026-07:
  - **Argentina:** CUIT/CUIL with a valid **mod-11 check digit** (11 digits; prefixes 20/23/24/27 individuals, 30/33/34 businesses). Fabricated digits won't pass — compute a valid check digit for test data. The `NationalId` document's `idNumber` is the plain 8-digit DNI. (US tax IDs on a US identity pass without the checksum check — that validation only bites LATAM tax IDs.)
  - **Chile:** RUT with its mod-11 check digit, and the `NationalId` `idNumber` carries the same RUT **with the dash and check digit included** (`15987654-3`).
  - **Colombia:** businesses use NIT format; individuals use the plain Cédula de Ciudadanía (no checksum). Colombian cédulas have no expiry — `expiryDate` can be omitted on the document.
  - **Peru:** plain 8-digit DNI, no checksum — but subject to the sandbox-wide uniqueness rule above; use a fresh DNI per test identity.
  - **Mexico: the identity document's `idNumber` is validated as a CURP** for individuals — a passport number is rejected (`identity.document.idNumber: format is invalid: CURP-…`). Use an 18-character CURP with a valid check digit, unique per test identity (same dedup rule).
- Document `issuingCountry` should match the identity's `address.country`.

## Payment instruction notes

- **`bankSlug` AND `bankAccountType` are both required** for AR/COELSA and CO/PSE. Missing slug → "bankCode is required"; missing type → "accountType is required and must be one of: checking,savings,interbanking". Send `Checking`/`Savings` (PascalCase) — Borderless translates. All observed corridors report `allInstitutionsSupported:false` with slug-based institution identifiers (long opaque tokens, distinct per corridor).
- **AR account numbers are a 22-digit CBU/CVU**, exactly.
- **MX/SPEI:** `{bankName, accountHolderName, bankAccountNumber (18-digit CLABE), address}` — no `bankSlug` needed. **The CLABE's mod-10 check digit is validated at payout** ("Bank account is invalid … and belong to …" when it fails). Koywe is stricter here than the corridor's other providers, so a synthetic CLABE that works elsewhere can fail on Koywe — compute a valid check digit (weights 3,7,1 over the first 17 digits).
- **Destination-account ownership is verified**: the CBU must belong to the tax-ID holder — a strong protection against misdirected payouts. Fabricated sandbox data won't pass this check by design; request PFI-issued test credentials through support@borderless.xyz for end-to-end sandbox testing.
- **Withdrawal bodies require `paymentPurpose` and reject `paymentMethod`** (`paymentMethod should not exist` — the method comes from the payment instruction; verified live 2026-07). `paymentPurpose` comes from a closed enum (`salary payment, personal remittance, rent payment, property purchase, owned account abroad, advertising expenses, advisory fees, business insurance, construction, delivery fees, education, exports, donation, hotel, loan payment, maintenance expenses, medical expense, office expenses, royalty fees, service charge, shares investment, tax payment, transportation fees, travel, utility bills, other`) — `other` is a safe default.
- **Deposit bodies require `paymentMethod` but reject `paymentPurpose`** (`paymentPurpose should not exist`). The field is withdrawal-only.

## Limits and the flat-fee floor

- Deposit `fromAmount` is denominated in the **fiat** currency; withdrawal `fromAmount` is in **source-asset** (e.g. USDC) units. Convert before checking a minimum.
- Per-corridor deposit minimums observed: AR **5,000 ARS**, CL **2,000 CLP**, CO **4,050 COP**, MX **50 MXN**-equivalent. A below-minimum quote returns e.g. `Amount for ARS in AR is below minimum limit: 5000.00 ARS`.
- **The quoted `minAmount` is not the real practical floor — Koywe charges a flat per-transaction fee on some deposit rails** (observed: ~5,112 COP on CO/PSE, ~8.46 PEN on PE/CCE), and a deposit whose amount doesn't comfortably clear the flat fee nets out to zero (`"Amount Out can't be zero or less"`). **Always call `/deposits/quotes/pfis` first and check `available: true`** — if the quote itself errors with that message, raise the amount well above the flat fee rather than trusting `limits.transaction.minAmount`.

## Sandbox notes

- **A deposit that flips to `Failed` shortly after `Submitted` can be a transient async bank-provisioning step, not a terminal result.** Re-poll before treating it as final — a genuine provisioning flip resolves to `Completed`.
- If a deposit fails at settlement a few seconds after `Submitted`, **check the identity's `address.country` against the corridor first** — the destination-country identity rule above is the most common cause and fixes it outright.
- One transaction JSON nuance: the `instructions` string can contain a literal newline, which strict JSON parsers reject — parse with `strict=False` (Python) or equivalent.

## Verified end-to-end (2026-07)

The destination-country identity recipe is verified across four corridors — each with a local personal identity, country-correct document, and (where applicable) checksum-valid account number:

- **MX/SPEI:** deposit + withdrawal `Completed` (~90s). MX identity with a unique, check-digit-valid CURP; SPEI PI with a checksum-valid CLABE.
- **CL/SPAV:** deposit + withdrawal `Completed` first try (~65s). CL identity with RUT (dash + check digit on the document).
- **CO/PSE:** deposit + withdrawal `Completed` (~65s). CO identity with plain CC; deposit sized above the flat-fee floor.
- **PE/CCE:** deposit + withdrawal `Completed` (~65s). PE identity with a fresh DNI; quote-checked the amount before submitting.
- **AR/COELSA:** deposit `Completed` (~65s) with an AR identity (CUIL + DNI document). The withdrawal side additionally runs Koywe's bank-account **ownership verification** (see Payment instruction notes) — request PFI-issued test credentials via support@borderless.xyz for that leg.

In every case the pinned `pfiName` held as Koywe end-to-end.

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
| `identity.Account already exists with document.idNumber …` | Document ID number already registered in Koywe's sandbox → fresh ID number, re-`PUT` the document, re-initiate |
| `Amount Out can't be zero or less` (deposit quote or settlement) | Amount doesn't clear the rail's flat fee → raise it well above the fee and re-quote until `available: true` |
| `Failed to validate if bank account … belongs to …` | Ownership verification, not a format error — don't retry with a corrected checksum; use an account genuinely owned by the identity (production) or PFI-issued test credentials via support (sandbox) |
| `Provider credentials are invalid` (deposit, at settlement) | Check the identity's `address.country` against the corridor first — the destination-country identity rule is the most common cause |
