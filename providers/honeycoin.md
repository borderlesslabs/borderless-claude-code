# HoneyCoin — integration notes

> Last verified: 2026-03 · Scope: provider-dependent unless noted. Routing is org-dependent — NGN has been observed routing through different PFIs on different orgs. Confirm with `GET /organizations/network?status=active`.

Corridors observed: **NG/NGN (BankTransfer)**.

## Compliance behavior

- **`PreApproved`** — no ToS, no initiation.

## Payment instruction notes

- Method is `BankTransfer`; **`bankSlug` required** and HoneyCoin-specific. After any routing change on a corridor, re-run `/withdrawals/institutions` and recreate the PI with the fresh slug — slugs minted under a different PFI return "Invalid bank code".
- Settles `USDC_ETHEREUM` (verify your org's asset list via `GET /organizations/network?status=active`).

## Sandbox notes

- Smooth sandbox processing observed: withdrawals progress `Pending → Processing → Completed` within about a minute.
- If NGN behavior on your org changes character (different slugs accepted, different asset support), check `pfiName` on a recent transaction — corridor routing may have moved, and slugs/assets should be re-discovered.
