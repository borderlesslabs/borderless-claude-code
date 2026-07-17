# Cobre — integration notes

> Last verified: 2026-07 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Corridors observed: **MX/SPEI** (deposit + withdrawal), **CO/PSE** (deposit + withdrawal), **CO/ACH** (withdrawal), **CO/Breb** (withdrawal). Cobre covers both Colombian and Mexican rails, and its Colombian payment-instruction shapes vary by method — read the notes below before building.

## Compliance behavior

- **No compliance check appears for Cobre** on the orgs observed — no Cobre-named profile is returned by `GET /identities/{id}/compliance-checks`, so there is nothing to initiate, drive, or gate on. Discovery and transaction creation (`POST /deposits`, `POST /withdrawals` pinned to Cobre) succeed with no compliance reference anywhere in the response. In practice this means Cobre rails are transactable as soon as your org is provisioned. *(Org-dependent — confirm on yours with the compliance-checks call, and coordinate with support@borderless.xyz if you expect a Cobre profile and don't see one.)*
- Because there is no KYC/KYB to be pending on, the usual "instructions are `null` because compliance is incomplete" heuristic does not apply to Cobre. See Sandbox notes for what `null` instructions actually mean here.

## Payment instruction notes

- **Deposits are identity-agnostic on the request.** `POST /deposits` takes `accountId` + `asset` + `fiat`/`country`/`paymentMethod` directly — no payment instruction and no `identityId`. Including `identityId` returns `422 "identityId should not exist"`; the counterparty identity is inferred from `accountId`.
- **Assets differ by operation direction on the same corridor.** MX/SPEI deposits accept `USDC_ETHEREUM`; MX/SPEI withdrawals accept `USDC_ETHEREUM` and `USDC_POLYGON`. Don't assume one asset works across every Cobre cell for a currency — read the corridor's quote/matrix per direction.
- **MX/SPEI withdrawal** uses the standard shape: `bankName`, `accountHolderName`, `bankAccountNumber`, `address`. `allInstitutionsSupported` is `true` (free-text bank fields; no slug needed).
- **CO/PSE withdrawal** also runs with `allInstitutionsSupported: true` (no slug lookup required).
- **CO/ACH withdrawal** runs with `allInstitutionsSupported: false` — `institutionIdentifier` is `bankSlug`, and the slug must come from Cobre's own catalog. Bank slugs are **provider-scoped**: a payment instruction built with another provider's slug is rejected at withdrawal creation with a clear, named `400` (see Message signatures). Re-derive the slug from `GET /withdrawals/institutions?...&pfiName=Cobre` and create a fresh instruction.
- **CO/Breb withdrawal** uses the leanest shape of any Cobre rail: `{ "brebKey": "<key>" }` and nothing else. `accountHolderName`, `address`, and all bank fields must be absent (they return `should not exist`). Breb (Colombia's Bre-B instant-payment key system — a phone/email/national-ID-style alias, analogous to a PIX key) resolves the recipient entirely by key. Discovery reports `institutionIdentifier: "brebKey"` with an empty `supportedInstitutions` list — here `institutionIdentifier` names the single routing field in `details`, not a bank to look up.
- **`paymentPurpose` on withdrawals is a lowercase enum** (`"other"`, `"personal remittance"`, `"salary payment"`, etc.). A capitalized value (`"Other"`) returns `422` naming the full accepted list.

## Deposit instruction shapes

Cobre resolves deposit instructions differently per corridor — don't assume one schema fits all rails:

- **MX/SPEI:** a `virtual_clabe_accounts` object carrying an 18-digit virtual CLABE. This resolves **asynchronously** — see Sandbox notes.
- **CO/PSE:** a hosted `checkout_url` link (`checkout.cobre.co/...`) with `checkout_rails: ["pse"]` and a `valid_until` timestamp. Present the link to the payer rather than expecting account coordinates.

## Limits

- MX/SPEI deposit quote: `minAmount 1.00 MXN`, `maxAmount null` (uncapped). CO/PSE deposit quote: `minAmount 1.00 COP`, `maxAmount null`.
- Withdrawal `amount` is in **source-asset units** (USDC), not fiat — convert before checking any cap.

## Message signatures

| Message | Meaning → next step |
|---|---|
| `identityId should not exist` (on `POST /deposits`) | Deposits infer the identity from `accountId` → drop `identityId` and resend |
| `paymentPurpose must be one of the following values: ...` | Use a lowercase enum value (e.g. `"other"`, not `"Other"`) |
| `Payment instruction ... is not usable on Cobre: the stored institution slug is not present in Cobre's catalog. Recreate the destination via GET /institutions?pfiName=Cobre and POST it back.` | The PI carries a non-Cobre bank slug → recreate it with a slug from `GET /withdrawals/institutions?...&pfiName=Cobre` |
| `accountHolderName should not exist` / `address should not exist` (on a Breb PI) | Strip to `brebKey` only — Breb takes no bank or holder fields |

## Sandbox notes

- **MX/SPEI deposit `instructions` is `null` at creation and resolves asynchronously.** The transaction is created `Submitted` with `instructions: null`, and the virtual CLABE appears on a subsequent fetch (within the first poll in sandbox). **Re-fetch the transaction — do not retry the create.** For Cobre specifically, `null` instructions never signal a pending compliance gate (there is none), only that the deposit coordinates are still being provisioned.
- Fast: deposits and withdrawals reached `Completed` within about 10 seconds on the org observed.
- A Cobre pin (`pfiName=Cobre`) held through to `Completed` on every rail, including corridors where another PFI is the org default — pinning works even with no compliance profile behind the provider.
