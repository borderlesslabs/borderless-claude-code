# Walapay — integration notes

> Last verified: 2026-07 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Walapay is the network's widest-coverage provider — 50+ corridors exercised across the Americas, Europe, MEA, and APAC. Several corridors use distinct payment-instruction shapes, so **read the shape families below before building a payment instruction**, and resolve the shape from the corridor's own discovery response rather than assuming a regional default.

Corridors verified reaching `Completed` (2026-07):

- **Americas:** MX/MXN (SPEI), AR/ARS (COELSA and Transfers30), BR/BRL (PIX and TED), CA/CAD (EFT), CO/COP (ACH), CR/CRC (SINPE), US/USD (Wire), SG/USD (Swift, multi-country), DO/DOP (LBTR), HN/HNL, JM/JMD, PE/PEN (CCE), BO/BOB, CL/CLP (SPAV), GT/GTQ (ACH).
- **Europe:** DE/EUR (SEPA), CH/CHF (SIC), GB/GBP (BankTransfer), TR/TRY (EFT).
- **MEA:** AE/AED (NPSS), EG/EGP, GH/GHS, IL/ILS (ZAHAV), JO/JOD, KE/KES, NG/NGN (NIP), QA/QAR, SA/SAR (MADA), TZ/TZS, ZA/ZAR (EFT).
- **APAC:** BD/BDT, CN/CNY, HK/HKD (FPS), ID/IDR, IN/INR (IMPS_FIRC), JP/JPY, KR/KRW, LK/LKR, PH/PHP (GCash), PK/PKR (IBFT), SG/SGD, MY/MYR, TH/THB, VN/VND.

Corridor availability is org-dependent — confirm any corridor not in the verified list against your own org's discovery before building.

## Compliance behavior

- **ToS acceptance + initiation.** Business identities approve quickly in sandbox (seconds to ~1 minute). Personal identity KYC runs an async review and may sit at `Started` for longer *(sandbox-dependent — see Sandbox notes)*.
- **One `Walapay_base` check covers the whole Walapay network.** A single Approved compliance check unlocks every Walapay corridor for that identity — the check's coverage array spans all supported countries. You do not initiate a separate check per corridor.
- **Every owner/UBO identity is onboarded as its own Walapay customer.** The business identity *and* each owner personal identity carry separate Walapay compliance checks, each with its own ToS acceptance and initiation. Drive compliance on all of them — a business check alone isn't sufficient for customer creation.
- **Document images are quality-validated at customer creation.** Walapay checks image dimensions and content when the customer is created at initiation time. Note the sequencing: `/requirements` reflects Borderless-side readiness and reports all-clear *before* this validation runs. If initiation returns a generic **"Error creating customer" / "Validation error from PFI"** with empty requirements, the most common cause is an image that's too small or low-content. Upload real-quality images (**≥1200×900** verified working) and re-initiate.
- **`pfiName` holds through to the terminal transaction.** Walapay-pinned withdrawals stayed `pfiName: "Walapay"` from initiation to `Completed`, including on corridors where the org's `defaultPfi` is a different provider — no silent re-routing observed. (Still: never branch integration logic on `pfiName` — read it off the record when debugging.)

## Identity requirements

- **Business identity:** non-empty `description` and `dateOfIncorporation`; a UBO with `ownershipPercentage` set; Formation / Ownership / SourceOfFunds documents.
- **UBO / personal identity — US persons:** 9-digit SSN in `taxId`, and a **`DriverLicense` with both `imageFront` and `imageBack`**. A Passport or NationalId alone is not sufficient for US persons at initiation — this requirement surfaces only at initiate (`/requirements` shows all-clear first), returning the opaque `compliance: Error creating customer.` until the DriverLicense front+back is present.
- **Non-US individuals:** Passport.
- `attestedOwnershipStructureAt` on each UBO must be a valid `YYYY-MM-DD` date.
- **US state coverage:** NY and AK addresses are not currently supported (state licensing scope). Use a supported state — Delaware is verified.

## Payment instruction notes — by shape family

Resolve two independent axes per corridor from discovery before building the PI:

- **Shape family** (which fields the PI accepts) — see below.
- **Institution identifier** — `GET /withdrawals/institutions` reports `institutionIdentifier` (`bankSlug` or `localRoutingCode`) and `allInstitutionsSupported`. `allInstitutionsSupported: true` does **not** always mean "no identifier needed" (CN needs a `localRoutingCode` even so) — check `institutionIdentifier` explicitly regardless of the flag. When a `bankSlug` is required, resolve it from **Walapay's own** institutions list for the corridor; a slug from another provider's list may not exist in Walapay's. Exact slug matches across providers do occur and are safe to reuse once you've confirmed the match against Walapay's list.

### 1. Standard bank shape

`{ bankSlug, bankName, accountHolderName, bankAccountNumber, address }` — the workhorse. Add `bankAccountType` (`Checking`/`Savings`) where the corridor requires it.

- Verified: BD, HK (FPS — a plain bank rail, no phone identifier), ID, KR, LK, SG, MY, TH, VN, GH, KE, TZ, ZA (EFT), NG (NIP), DO, HN, BO, GT, CO (ACH), and PH/GCash (below).
- `bankAccountType` required: **US/Wire** (`Checking`/`Savings` — omitting it 422s; Wire on Walapay needs it just like ACH), **CL/SPAV**, **AR** rails.
- **AR (COELSA, Transfers30):** 22-digit CBU in `bankAccountNumber`; `allInstitutionsSupported: true`, no `bankSlug` needed. COELSA and Transfers30 are sibling AR rails with the identical shape.
- **CR/SINPE (CRC):** the CR IBAN-style account (`CR` + 20 digits) goes in `bankAccountNumber`; no `bankAccountType`.
- **PE/CCE:** account number must be **exactly 20 digits** — the PFI enforces this even though PI creation doesn't. Pad/validate client-side.
- **PH/PHP (GCash):** resolve the GCash `bankSlug` from institutions; `bankName: "GCash"`, and the **mobile number goes in `bankAccountNumber`** (no separate phone field). "BankTransfer" here is e-wallet routing (GCash/TagCash listed as institutions).

### 2. IBAN-in-`bankAccountNumber` + SWIFT shape

`{ bankName, accountHolderName, bankAccountNumber (full IBAN), swiftOrBicNumber, address }`, plus `accountOwnerType` + `businessName` for business payees where used.

- **EU/SEPA:** an existing SEPA payment instruction (Bridge-shape: full IBAN in `bankAccountNumber` + `swiftOrBicNumber`) was accepted by a Walapay-pinned withdrawal unmodified. Payment instructions are stored per `(currency, country, method)` independent of PFI — try the existing PI first, and only branch shapes on an actual 422. No bare `iban`-field PI was required for SEPA on the test org.
- **GB/GBP (BankTransfer):** the account is validated as a **UK IBAN** (`GB29...`-style) in `bankAccountNumber`, alongside `swiftOrBicNumber`. If a plain 8-digit account number returns `bank.iban must match IBAN regex`, switch to IBAN format. *(Org-dependent.)*

### 3. `iban`-only shape

`{ iban, address }` only — `bankName`, `accountHolderName`, `bankAccountNumber` are rejected (`should not exist`).

- Verified: **AE/NPSS (AED)**, **CH/SIC (CHF)**. Both are IBAN-based European/Gulf rails but do **not** take the SEPA `bankAccountNumber`+`swiftOrBicNumber` shape — send `{ iban, address }`. `allInstitutionsSupported: true`, no `bankSlug`.

### 4. `iban` + `bankSlug` shape

`{ bankSlug, iban, address }` — the `iban`-only fields plus an institution slug (`allInstitutionsSupported: false`).

- Verified: **EG/EGP**, **IL/ZAHAV (ILS)**, **JO/JOD**, **QA/QAR**, **SA/MADA (SAR)**, **PK/IBFT (PKR)**.
- This is the default assumption for a new Gulf/Levant BankTransfer rail on Walapay. Note two traps: `iban`-only *field shape* and `bankSlug` *requirement* are independent — EG needs both (it is not pure `iban`-only despite the field shape). And **`MADA`** is Saudi Arabia's card-scheme name but settles as an IBAN bank transfer here — don't infer a card-number shape from the method name.
- **PK/IBFT** rejects the standard bank fields synchronously at PI creation (`bankName`/`accountHolderName`/`bankAccountNumber` `should not exist`) — a fast fail; switch to `{ bankSlug, iban, address }`.

### 5. Identifier shape

`{ identifierType, identifierValue, address }` — no `bankName`.

- **BR/PIX:** `identifierType` ∈ `Email` / `CPF` / `CNPJ` / `PhoneNumber` / `EVP`. (BR also offers TED under a different shape — see family 6.)

### 6. Extra-routing-field shapes (`localRoutingCode` / `bankCode`)

Standard bank shape **plus** a routing-style field the PI-creation validator does *not* check synchronously — omit it and the PI is created fine but the **withdrawal fails asynchronously** at the PFI on the first poll. Inspect `failureReason.details[].path` to see which field is named.

| Corridor | Extra field | Value |
|---|---|---|
| **BR/TED (BRL)** | `localRoutingCode` | bank branch / agência code (e.g. `0001`); `allInstitutionsSupported: false`, resolve `bankSlug` from institutions |
| **CA/EFT (CAD)** | `localRoutingCode` | 5-digit transit number |
| **IN/IMPS_FIRC (INR)** | `localRoutingCode` | IFSC code (use `localRoutingCode`, **not** `localRoutingNumber` or `bankCode`); `allInstitutionsSupported: true`, no slug list |
| **CN/BankTransfer (CNY)** | `localRoutingCode` | 12-char CNAPS code; `institutionIdentifier` is `localRoutingCode` (empty slug list); `address.postalCode` is a real 6-digit code |
| **JP/BankTransfer (JPY)** | `bankCode` | 4-digit Japanese bank code (e.g. `0001`); distinct from `bankSlug` — both are needed |
| **JM/BankTransfer (JMD)** | `bankCode` | format `NNNNN NNN` (5 digits, space, 3 digits — the PFI error states the expected format) |

The IFSC (IN) note: `localRoutingCode` is accepted on creation but not echoed in GET responses. Do not generalise a `bankCode`/`localRoutingCode` requirement across a region — a neighbour corridor (e.g. KR next to JP) may need only the standard shape. Confirm per corridor.

## Withdrawal call notes

- **INR/IMPS_FIRC requires an Invoice** in `documents` on the `POST /withdrawals` call (an Indian FIRC regulatory requirement), and the embedded image has a hard **200×200px minimum** — a tiny placeholder 422s with a documents-specific error. Use a real-sized invoice image. The `documents` array goes on the withdrawal call itself, not the payment instruction.
- **`paymentPurpose` is a closed, lowercase enum** (Borderless API-level, not Walapay-specific, but it bites every Walapay rail on the first attempt). Sending free text or Title Case (`"Other"`) 422s with the full enum listed. Use a listed value — `"other"` for test traffic.

## Limits

Per-transaction maxima vary widely by corridor — always size from the live quote. Notably tight caps observed:

- **TR/TRY: 100,000 TRY per transaction.** The cap surfaces only as an `available: false` error at the tested amount, not as a `limits` field. The withdrawal `amount` is in source-asset units (USDC), so **compute the safe ceiling from the current quote's `exchangeRate`** (`100000 / exchangeRate`) — a hardcoded USDC figure goes stale as FX moves.
- **JO/JOD: 2,000 JOD** (≈ $2,820) — the tightest cap observed; plan larger payouts as multiple transactions.
- **TH/THB: 49,999 THB** (≈ $1,530) — materially lower than APAC siblings, which cap in the millions.
- **IL/ILS: 25,000 · GH/GHS: 100,000 · SG/SGD: 200,000 · MY/MYR, PK/PKR: 1,000,000 · IN/INR: 1,500,000 · NG/NGN: 7,500,000 · ZA/ZAR, US/USD: 5,000,000.**
- **CN/CNY: min 8, max 3,500,000** — the minimum is low (≈ $1.10), not a high floor. Confirm mins/maxes via the live quote rather than inferring them.
- Minimums are small in most corridors (single digits to low hundreds of local units). BR: **PIX min 60 BRL vs TED min 6 BRL** — the PIX floor is ~10× TED's.

## Feature enablement (org-level)

- **Virtual accounts are enabled separately from transactional compliance.** A VA request can return `Customer has not been approved for virtual bank accounts` even when the identity is `Approved` for deposits and withdrawals. Coordinate VA enablement through support@borderless.xyz.
- **New sandbox orgs need the Walapay integration configured before discovery works** (`Walapay API Key is not configured for this organization`) — support handles this during provisioning.
- **Currency-pair enablement is per team/org.** A corridor listed in your org's provider config can still return `This currency pair is not supported for your team. Please contact support.` at discovery — request enablement through support@borderless.xyz before building against it. *(org-dependent)*

## Message signatures

| Message | Meaning → next step |
|---|---|
| `compliance: Error creating customer.` / `Validation error from PFI` at initiation | Image below quality threshold, or an owner identity not yet onboarded, or (US person) DriverLicense front+back missing → upload ≥1200×900 images incl. DriverLicense both sides, drive owner compliance |
| `<field> should not exist` on PI creation (e.g. `bankName`/`accountHolderName`/`bankAccountNumber`, or `iban`) | Wrong shape family for this corridor → switch to the family it uses (iban-only, iban+bankSlug, etc.) |
| `bank.iban must match IBAN regex` | Corridor expects IBAN format in `bankAccountNumber` (e.g. GB) |
| `Failed to create account: Missing required fields: bank.branchCode` | BR/TED needs `localRoutingCode` (branch/agência code) |
| `Failed to create account: Missing required fields: bank.bankCode` | JP needs `bankCode` (4-digit); JM needs `bankCode` |
| `... does not match expected format. Example: 00000 999` | JM `bankCode` format `NNNNN NNN` |
| `Account number must be 20 digits for PE bank accounts.` | Pad PEN `bankAccountNumber` to exactly 20 digits |
| `bankAccountType should not be null or undefined` | US/Wire (and ACH) need `bankAccountType` = `Checking`/`Savings` |
| `Amount for TRY in TR is above maximum limit: 100000.00 TRY` | Over the TRY cap → size `fromAmount` from live `exchangeRate` |
| `documents ... dimensions must be at least 200x200px` | INR invoice image too small → use ≥200×200 |
| `Customer has not been approved for virtual bank accounts` | VA enablement pending → support@borderless.xyz |
| `Walapay API Key is not configured for this organization` | Org provisioning pending → support@borderless.xyz |
| `This currency pair is not supported for your team. Please contact support.` | Currency-pair enablement for your org → support@borderless.xyz |
| `Failed to retrieve or create Walapay bank account` | Often transient → retry once before deeper debugging |

## Sandbox notes

- **Timing:** completed withdrawals move `Submitted` → `Pending` → `Processing` → `Completed`, typically ~70–100s; several corridors (BR/TED, DO, CL, GT) completed in under 10s.
- **Personal KYC** reached `Started` after the DriverLicense front+back was supplied but did not always auto-terminalize to `Approved` within a ~5-minute window (business KYB approves fast). The individual AiPrise-backed KYC appears to sit in async review — re-poll later rather than re-initiating.
- **Async-not-422 failures:** extra-routing-field corridors (family 6) create the PI cleanly and only fail at the PFI on the first poll. Always poll the transaction to a terminal state before assuming success.
