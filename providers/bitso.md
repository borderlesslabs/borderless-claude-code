# Bitso — integration notes

> Last verified: 2026-07 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Corridors observed: **CO/COP (PSE)**, **AR/ARS (COELSA)**, **MX/MXN (SPEI)**. Bitso's deposit and withdrawal sides differ in enough details — asset lists, the `fromAmount` convention — that you should treat each direction as its own thing rather than assuming symmetry. The deposit direction is verified end-to-end below (AR and MX completing in ~24s).

## Compliance behavior

- **`PreApproved`** on `Bitso_base` — no ToS, no initiation, transact immediately. Every failure documented below is provider-side or identity-data, never a compliance gate.
- **Personal KYC** self-approves once a `NationalId` document (imageFront) is on the identity; initiation returns `PreApproved` with no ToS. Org-level Bitso credentials must be provisioned (verification level 3) for this to resolve *(org-dependent)*.

## Quote convention (read first)

- **Deposit quotes read `fromAmount` as the FIAT amount, not the source asset.** This is the opposite of the general withdrawal convention (where `fromAmount` is source-asset units). `GET /deposits/quotes/pfis?...&fromAmount=15000` on a COP corridor treats `15000` as **15,000 COP** and returns the resulting stablecoin figure in `toAmount`. Passing a stablecoin-scale number (e.g. `1000`) reads as 1,000 COP and trips the corridor minimum. **Size deposit `fromAmount` in fiat units for Bitso**, or drive the quote from `toAmount` if you are unsure.
- **Withdrawal quotes behave normally** — `fromAmount` is source-asset (stablecoin) units. The convention flips by direction, so branch on operation type, not on the provider.

## Discovery notes

- **Skip the institutions endpoint for Bitso.** `GET /deposits/institutions` and `GET /withdrawals/institutions` with `pfiName=Bitso` return `400 The service [Bitso] is not available.` — bank-slug discovery is not exposed for this provider on the sandbox *(org-dependent)*. The quote endpoints work and report `available:true`, so go straight to quote → payment instruction → submit; do not gate your flow on an institutions lookup.
- **Re-discover the asset list per operation type.** Deposits offer `USDC_POLYGON`; withdrawals do not (withdrawals surface `USDC_ETHEREUM` plus other chain variants). Use `USDC_ETHEREUM` for Bitso withdrawals — a `USDC_POLYGON` withdrawal quote simply will not present as an option. Read the live asset list for the direction you are running rather than carrying one over from the other.

## Identity requirements

- **Colombia (CO) rails require a valid Colombian NIT on the identity record itself.** A `taxId` set on the payment instruction's `details` does **not** substitute — the check reads the identity's tax data and returns `Invalid NIT` (`path: identity`) regardless of what the PI carries. Populate the identity's Colombian tax ID (format like `900123456-7`) before running any CO deposit or withdrawal *(org-dependent on the identity's data)*.

## Payment instruction notes

- **CO/PSE:** `{bankName, accountHolderName, bankAccountNumber, bankAccountType, taxId, address}`. The `taxId` field is accepted here but does not clear the CO block — that is resolved at the identity level (see above).
- **AR/COELSA:** `{bankName, accountHolderName, bankAccountNumber (22-digit CBU), bankAccountType, address}`.
- **MX/SPEI:** `{bankName, accountHolderName, bankAccountNumber (18-digit CLABE), address}` — verified working for the deposit direction.
- **`paymentPurpose` is lowercase.** Sending `"Other"` returns `422` with the full lowercase enum; use `"other"` (and the other values) verbatim. This silently blocks a first attempt if you title-case it.
- Payment instructions are not provider-bound — a PI created for one provider can be reused across providers on the same corridor.

## End-user display

- **ARS deposit instructions surface a withholding-tax rate.** A completed AR/COELSA deposit returns real bank-transfer instructions that include a `withholdingTax` figure (e.g. `0.6`). A customer-facing integration should display this to the end user so the credited amount is not a surprise.

## Limits

Transaction limits observed (fiat side; convert the withdrawal `amount` from source-asset units before checking):

- **CO/COP:** 10,000.00 – 300,000,000.00 COP
- **AR/ARS:** 5,000.00 – 350,000,000.00 ARS
- **MX/MXN:** 19.00 – 18,000,000.00 MXN

## Message signatures

| Message | Meaning → next step |
|---|---|
| `Amount for COP in CO is below minimum limit: 10000.00 COP` | Deposit `fromAmount` is being read as fiat — size it in fiat units (or drive from `toAmount`) |
| `The service [Bitso] is not available.` (on `/institutions`) | Institutions discovery not exposed for Bitso — skip it, go quote → PI → submit |
| `Invalid NIT` (`path: identity`) | CO rails need a valid Colombian NIT on the identity record; a PI-level `taxId` does not substitute |
| `paymentPurpose` 422 with enum list | Use the lowercase value (`"other"`), not title case |

## Sandbox notes

- MXN/SPEI and ARS/COELSA **deposits** complete cleanly (Submitted → Pending → Completed in ~24s), and `pfiName` on the completed transaction holds as `Bitso` when pinned.
