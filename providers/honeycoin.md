# HoneyCoin — integration notes

> Last verified: 2026-07 · Scope: provider-dependent unless noted. Routing is org-dependent — NGN has been observed routing through different PFIs on different orgs. Confirm with `GET /organizations/network?status=active`.

Corridors observed (all withdrawal): **NG/NGN**, **TZ/TZS**, **KE/KES**, **MW/MWK** (BankTransfer + MobileMoney each on TZS/KES/MWK), and MobileMoney on **UG/UGX**, **CM/XAF**, **GH/GHS**, **RW/RWF**, **SN/XOF**. HoneyCoin covers a broad African mobile-money set alongside bank transfers — the two methods use different payment-instruction shapes, so read both below.

## Compliance behavior

- **`PreApproved`** — no ToS, no initiation. Transactable immediately.

## Payment instruction notes

Two shapes, keyed on the method:

- **BankTransfer** uses the standard shape: `bankSlug`, `bankName`, `accountHolderName`, `bankAccountNumber`, `address` (`street1`, `city`, `country`, `postalCode`). `bankSlug` is HoneyCoin-specific — pull it from `GET /withdrawals/institutions?...&pfiName=HoneyCoin` per corridor; slugs minted under a different PFI return "Invalid bank code".
- **MobileMoney** uses `{ networkSlug, accountHolderName, phone }` — **no `address`, no `bankAccountNumber`** (both return `should not exist`). `phone` is required, a string ≥7 chars, in international format with **no leading `+`** (e.g. `254712345678`).
- **`institutionIdentifier` is `networkSlug` for MobileMoney rails, `bankSlug` for BankTransfer.** Always read the actual `institutionIdentifier` key returned by discovery rather than assuming — the generic "usually `bankSlug`" guidance does not hold for HoneyCoin's mobile-money rails.
- **`paymentPurpose` is a lowercase enum** (`"salary payment"`, `"personal remittance"`, `"other"`, etc.). Capitalized values (`"Payroll"`) return `422` with the full accepted list.

## Corridors, methods, and networks

| Corridor | Method | Identifier | Networks / notes |
|---|---|---|---|
| NG/NGN | BankTransfer | `bankSlug` | Access, Stanbic IBTC, Standard Chartered, plus smaller/microfinance banks |
| TZ/TZS | BankTransfer | `bankSlug` | 58 banks (CRDB, NMB, Stanbic, Standard Chartered, Equity, Exim, …) |
| TZ/TZS | MobileMoney | `networkSlug` | Airtel, Tigo, Halotel |
| KE/KES | BankTransfer | `bankSlug` | Choice, GTBank, EcoBank, Standard Chartered, NCBA, … |
| KE/KES | MobileMoney | `networkSlug` | M-Pesa (single network) |
| UG/UGX | MobileMoney | `networkSlug` | MTN, Airtel |
| CM/XAF | MobileMoney | `networkSlug` | MTN, Orange |
| GH/GHS | MobileMoney | `networkSlug` | Airtel, Vodafone, MTN |
| RW/RWF | MobileMoney | `networkSlug` | MTN, Airtel |
| SN/XOF | MobileMoney | `networkSlug` | Only **MTN** and **Moov** actually settle — see below |
| MW/MWK | BankTransfer | `bankSlug` | Ecobank, Standard Bank, National Bank of Malawi, FDH, CDH, First Capital, NBS, Centenary |
| MW/MWK | MobileMoney | `networkSlug` | Airtel, TNM Mpamba |

Phone country prefixes used on the MobileMoney rails (no leading `+`): UGX `256`, KES `254`, XAF `237`, GHS `233`, RWF `250`, XOF/SN `221`, TZS `255`, MWK `265`.

## Discovery vs. rail reality (SN/XOF)

The discovery `supportedInstitutions` list can be broader than what the underlying rail accepts. On SN/XOF, the list includes Orange, Wave, Mobicash, Emoney, and Free Money (some duplicated with different slugs), but only **MTN** and **Moov** settle — a transaction built on an Orange slug reaches `Submitted` then goes `Failed` at the provider with `Validation failed: Invalid MoMo operator. Must be one of: moov, mtn`. Treat the discovery list as "these are registered", not "these all settle": if a rail fails with an "Invalid operator/network" provider error, retry with a different institution from the same list before escalating.

## Limits

- **Quote `limits.transaction` are denominated in the destination fiat**, not USDC. Size `fromAmount` (USDC) so the converted `toAmount` lands inside the band.
- **MobileMoney caps run a fraction of the BankTransfer cap on the same corridor** where both exist — size mobile-money rails more conservatively by default. Observed fiat bands:

| Corridor / method | Min | Max |
|---|---|---|
| NG/NGN BankTransfer | 1,000 | 100,000,000 |
| TZ/TZS BankTransfer | 1,000 | 10,000,000 |
| TZ/TZS MobileMoney | 1,000 | 5,000,000 |
| UG/UGX MobileMoney | 500 | 5,000,000 |
| KE/KES BankTransfer | 10 | 999,999 |
| KE/KES MobileMoney | 10 | 150,000 |
| MW/MWK BankTransfer | 500 | 100,000,000 |
| MW/MWK MobileMoney | 100 | 750,000 |
| CM/XAF, GH/GHS, RW/RWF, SN/XOF MobileMoney | `null` | `null` (no published cap) |

- The NGN quote's fiat band is separate from any tighter org-wide/asset-level constraint layered on top — stay under both.

## Message signatures

| Message | Meaning → next step |
|---|---|
| `bankAccountNumber should not exist` / `address should not exist` (on a MobileMoney PI) | MobileMoney takes `{networkSlug, accountHolderName, phone}` only → drop bank/address fields, add `phone` |
| `phone` required (on a MobileMoney PI) | Add `phone` as a string ≥7 chars, international format, no leading `+` |
| `paymentPurpose must be one of ...` | Use a lowercase enum value (`"salary payment"`, not `"Payroll"`) |
| `Invalid bank code` (BankTransfer) | Slug was minted under a different PFI → re-run `/withdrawals/institutions?...&pfiName=HoneyCoin` and recreate the PI |
| `Validation failed: Invalid MoMo operator. Must be one of: moov, mtn` (SN/XOF, post-submission) | The chosen network isn't settled by the rail → retry with MTN or Moov |

## Sandbox notes

- Fast: mobile-money rails often go `Submitted → Completed` within a single ~10s poll; bank transfers typically settle `Pending → Completed` over ~30s. No multi-minute lag observed on these rails.
- A HoneyCoin pin (`pfiName=HoneyCoin`) held through to `Completed` on every rail, including corridors where another PFI is the org default and even through the earlier `Failed` SN/XOF attempt.

## Coverage discovery (org-level)

- **The org's `defaultPfi` for a cell does not indicate whether HoneyCoin covers it.** GH/GHS MobileMoney shows a different default PFI in the routing table, yet pinning `pfiName=HoneyCoin` returned `available: true` and completed end to end. Don't read default-PFI absence as non-coverage — check with the pin against `GET /organizations/network?status=active` and the pinned discovery call.
