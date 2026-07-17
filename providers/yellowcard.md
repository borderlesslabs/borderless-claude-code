# Yellow Card — integration notes

> Last verified: 2026-07 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Corridors observed across a 32-rail sandbox pass in 2026-07. Yellow Card brings licensed coverage across a wide set of African markets, on both bank and mobile-money rails.

- **BankTransfer / EFT:** BW/BWP, CG/XAF, KE/KES, MW/MWK, NG/NGN, RW/RWF, UG/UGX, ZA/ZAR (EFT).
- **MobileMoney:** BW/BWP, CI/XOF (Wave), MW/MWK, TZ/TZS, UG/UGX, ZM/ZMW.
- Both deposit (fiat → stablecoin) and withdrawal (stablecoin → fiat) directions were exercised. Which specific rails are provisioned varies by org — always confirm against live discovery.

## Compliance behavior

- **`PreApproved`** for the identity types tested — a US business (KYB) and a US personal identity (KYC) both self-approved with a complete profile, no ToS and no document uploads beyond a complete identity.
- **Local residents follow local KYC requirements:** an in-country resident *personal* identity is expected to carry the local regulatory documents (for NG, the Bank Verification Number `BVN_NG` plus `NationalId`). Query `GET /identities/{id}/compliance-checks` requirements per identity rather than generalizing from the business identity.

## Payment instruction notes

The PI shape differs by rail and by direction — branch on the rail, never on `pfiName`.

- **MobileMoney PIs** take `{networkSlug, accountHolderName, phone}`. The `phone` **must include a `+` country-code prefix** (e.g. `+2547...`). Without it the PI is still accepted at creation, but the withdrawal fails later at the provider with `phone number needs to be in international format`. Add the `+` up front. Discover the `networkSlug` from `/withdrawals/institutions` (`institutionIdentifier: "networkSlug"`).
- **BankTransfer / EFT PIs** take the standard `{bankSlug, bankName, accountHolderName, bankAccountNumber, address}`. `bankSlug` comes from `/withdrawals/institutions` and is provider-specific — never reuse a slug minted under a different PFI, and re-discover after any routing change.
- **Deposit POST body:** include `paymentMethod` (the API rejects the deposit without it and returns the full method enum). Do **not** send `paymentPurpose` on a deposit — it is a withdrawal-only field and returns `paymentPurpose should not exist`.
- **MobileMoney deposits** additionally require a top-level `source: {phone, networkSlug, accountHolderName}` object on the deposit call, mirroring the PI's own mobile-money details.
- **Deposit instructions vary by rail — branch on `instructions.data` shape.** Most rails return bank details (`{bankName, companyName, bankAccountNumber, bankBranchCode?}`); ZA/EFT returns a hosted-checkout redirect (`{redirectUrl}`, Peach Payments) instead. Treat every field inside `instructions.data` as optional per rail — `bankBranchCode`, for instance, appears variously as absent, a real code, a placeholder, or an empty string, and `companyName` is free-form. Don't hardcode a fixed contract; read what the rail returns.
- Deposit instructions populate while the transaction is still `Pending`, not only at `Completed`.

## Limits

- **Quote each corridor; do not assume a fixed cap.** Per-transaction limits are corridor- and rate-specific, and some rails publish no cap at all (`minAmount`/`maxAmount` come back `null`). NGN, in particular, was observed with a materially looser ceiling than older notes suggested (a live quote returned min 1,800 / max 30,000,000 NGN). Read `limits.transaction` from the live quote (`/withdrawals/quotes/pfis` or `/deposits/quotes/pfis`) rather than hardcoding. The withdrawal `amount` is in source-asset units — convert before comparing to a fiat cap.

## Message signatures

| Message | Meaning → next step |
|---|---|
| `phone number needs to be in international format` | MobileMoney PI phone missing its `+` country code → recreate the PI with `+<countrycode>...` |
| `No bankSlug found for payment instruction {id}` | A BankTransfer PI was created without a slug; on withdrawals a `bankSlug` is required. If `/withdrawals/institutions` returns an empty `supportedInstitutions`, that corridor's bank list isn't provisioned on your org *(org-dependent)* → support@borderless.xyz |
| `No active channel found for channelType: momo` | The mobile-money channel for that corridor isn't yet provisioned on your org *(org-dependent)* → support@borderless.xyz |
| `paymentPurpose should not exist` | `paymentPurpose` is withdrawal-only → drop it from the deposit POST |
| deposit rejected with the full `paymentMethod` enum | `paymentMethod` missing on the deposit POST → add it |
| `source should not be null or undefined` (MobileMoney deposit) | Add the top-level `source: {phone, networkSlug, accountHolderName}` object |

## Sandbox notes

- **Auto-completing rails:** working BankTransfer/EFT and MobileMoney rails run `Submitted` → `Pending` → (`Processing`) → `Completed`, typically 10–90 seconds, no manual fiat-in step required.
- **`Orchestrating` is a non-terminal status — poll patiently.** Alongside `Submitted` / `Pending` / `Processing`, transactions can enter `Orchestrating` and stay there for several minutes before resolving; instances persisting past 10 minutes were observed. Keep polling; treat it as in-flight, not stuck. If a transaction sits in `Orchestrating` beyond ~15 minutes, flag it to support@borderless.xyz rather than resubmitting (resubmitting would violate idempotency-key discipline without a known root cause).
- **MobileMoney deposits and some bank-institution lists are not yet provisioned on every sandbox org.** On the tested org, discovery and quote advertised availability for several MobileMoney *deposit* corridors that then returned `No supported Onramp method found for payment method MobileMoney in {country}` on submission, and a few BankTransfer corridors returned an empty `supportedInstitutions` list. These are org-level provisioning items — confirm the specific rail against your org and coordinate enablement with support@borderless.xyz. *(org-dependent)*
- **On corridors where the withdrawal bank list is empty, the deposit direction may still work** (deposit PI creation is permissive and accepts an empty `details:{}`), but the withdrawal direction requires a `bankSlug` and cannot complete without a provisioned list. Where a corridor's bank rail isn't yet provisioned, its MobileMoney rail was often the working path.
- The two historical sandbox items in older notes — `address unavailable` and `omnibus not configured` — **did not reproduce** on the 2026-07 org and are treated as resolved. If you still see either, it's an org-provisioning item for support@borderless.xyz.
