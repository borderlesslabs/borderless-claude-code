# Infinia — integration notes

> Last verified: 2026-04 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Corridors observed: **BR/PIX**, **MX/SPEI**, **AR/COELSA**.

## Compliance behavior

- **`PreApproved`** — no ToS, no initiation, transact immediately. A great first corridor for proving out your integration end-to-end.

## Payment instruction notes

- **BR/PIX:** identifier-based (`identifierType` + `identifierValue`); `bankName` is not part of this DTO. `identifierType` ∈ `Email` / `CPF` / `CNPJ` / `PhoneNumber` / `EVP`.
- **MX/SPEI:** the 18-digit CLABE goes in `bankAccountNumber`.
- **AR/COELSA:** 22-digit CBU in `bankAccountNumber`. Identity and account preflight requirements differ by routed PFI — check the corridor's live `requirements` and `institutions` responses rather than assuming another provider's rules apply.

## Limits

- BRL and MXN: **100,000 per transaction** (fiat side) observed. The withdrawal `amount` is in source-asset units — convert before checking.

## Sandbox notes

- Fast: withdrawals typically reach `Completed` in ~15 seconds — useful as the control corridor when debugging slower flows.
- If you ever see a corridor-wide configuration error here (affecting every payload shape), escalate to support@borderless.xyz rather than debugging your request — config-level items are resolved quickly on the network side.
