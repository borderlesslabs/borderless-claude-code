# Infinia — integration notes

> Last verified: 2026-07 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Corridors observed: **BR/PIX**, **MX/SPEI**, **AR/COELSA**, **CL/SPAV**, **CO/PSE**, **PE/CCE**, **PY/SPI**, and **BO/ACH** (withdrawal). Broad LATAM coverage under a single PreApproved compliance profile.

## Compliance behavior

- **`PreApproved`** — no ToS, no initiation, transact immediately. A great first corridor for proving out your integration end-to-end. One `Infinia_base` check covers every corridor above (deposit and withdrawal); there is no separate per-corridor compliance profile to drive.

## Payment instruction notes

Institution discovery (`GET /deposits|withdrawals/institutions`) returns `allInstitutionsSupported:true` for the LATAM rails, so no bank slug is strictly required. The `institutionIdentifier` hint in that response tells you the PI convention per corridor:

- **BR/PIX:** identifier-based (`identifierType` + `identifierValue`; `institutionIdentifier` hint is `identifierValue`). `bankName` is not part of this DTO. `identifierType` ∈ `Email` / `CPF` / `CNPJ` / `PhoneNumber` / `EVP`.
- **CL/SPAV, CO/PSE, PE/CCE, PY/SPI:** standard bank fields (`bankName`, `accountHolderName`, `bankAccountNumber`, `bankAccountType`, `address`) with the institution identifier carried as **`bankCode`** (not `bankSlug` — confirmed against a live CO/PSE PI carrying `bankCode: "007"`).
- **MX/SPEI:** the 18-digit CLABE goes in `bankAccountNumber`; standard bank fields, no identifier hint beyond them.
- **AR/COELSA:** 22-digit CBU in `bankAccountNumber`; standard bank fields, no identifier hint beyond them.

Request-body notes (enforced at the Borderless API layer, but every integrator hits them here):

- **`POST /deposits` requires an explicit `paymentMethod`; `POST /withdrawals` REJECTS it** (`paymentMethod should not exist` — the withdrawal's method comes from the payment instruction). Omitting it on a deposit 422s with the full method enum (`ACH, Wire, Sepa, Swift, Card, MobileMoney, PIX, TED, PSE, SPEI, COELSA, Transfers30, SPAV, CCE, SPI, LBTR, SINPE, Transfer365, NIP, GhIPSS, BankTransfer, EFT, RTP, BECS, FPS, IMPS_FIRC, Breb, NPSS, MADA, ZAHAV, IBFT, SIC`). Send the corridor's method (e.g. `SPEI`, `PIX`, `PSE`).
- **`paymentPurpose` is withdrawal-only** and comes from a closed enum (`salary payment, personal remittance, rent payment, property purchase, owned account abroad, advertising expenses, advisory fees, business insurance, construction, delivery fees, education, exports, donation, hotel, loan payment, maintenance expenses, medical expense, office expenses, royalty fees, service charge, shares investment, tax payment, transportation fees, travel, utility bills, other`). `other` is a safe default; a free-text value 422s. Deposits reject the field entirely (`paymentPurpose should not exist`).

## Limits

- Per-transaction caps are quote-dependent — read `minAmount` / `maxAmount` from the corridor quote. Recent sandbox quotes returned `minAmount: 1.00` (fiat side) and `maxAmount: null` (uncapped) across the LATAM rails. Withdrawal `amount` is in source-asset units (e.g. USDC); deposit `fromAmount` is fiat — convert before checking any cap.

## Message signatures

| Message | Meaning → next step |
|---|---|
| `paymentMethod must be one of the following values: …` (deposit) | Add an explicit `paymentMethod` to the deposit body |
| `paymentMethod should not exist` (withdrawal) | Withdrawals take the method from the PI — drop the field |
| `paymentPurpose must be one of the following values: …` | Use a value from the closed enum; `other` is a safe default |
| `paymentPurpose should not exist` | Drop `paymentPurpose` from a deposit body (withdrawal-only field) |
| `ACH does not match the country: BO` at BO discovery | Discovery/quote validator out of sync with `/options` for BO/ACH on some orgs → support@borderless.xyz *(org-dependent)* |
| `An error occurred processing the internal transfer` (path `transfer`, at settlement) | Settlement-stage issue observed org-wide on some sandbox orgs; request shape is fine → support@borderless.xyz *(org-dependent / sandbox)* |

## Sandbox notes

- **When healthy, Infinia is fast** — withdrawals have been observed reaching `Completed` in ~15 seconds, which makes it a useful control corridor when debugging slower flows.
- **Settlement-stage failures can affect every corridor on a given sandbox org.** On the org tested in 2026-07, transactions were created correctly (`201` → `Submitted` → `Pending`, with deposit `instructions` populating a hosted-redirect payload ~10s in), then flipped to `Failed` at the simulated internal-transfer step with `failureReason.details: [{"path":"transfer","pfiErrorMessage":"An error occurred processing the internal transfer"}]` — identically across deposits and withdrawals and multiple currencies. Because it reached instruction issuance correctly, the request shapes above are verified; the failure is at settlement and is not client-fixable. If you see this org-wide, escalate to support@borderless.xyz rather than debugging your payload. *(Org-dependent / sandbox.)*
- Deposit `instructions` populating from `null` is normal issuance, not a compliance signal — on a healthy org the transfer completes after it; on the affected org above the failure occurs *after* issuance.
- **BO/ACH withdrawal has a discovery-level validation mismatch on some orgs.** `GET /withdrawals/options?fiat=BOB&country=BO` lists `ACH` as valid and the `Infinia_base` compliance coverage lists `{BOB, ACH, BO}`, but `GET /withdrawals/institutions` and `/withdrawals/quotes/pfis` reject the same tuple with `ACH does not match the country: BO`. There's no alternate method for this pairing to work around it — coordinate with support@borderless.xyz. *(Org-dependent.)*
