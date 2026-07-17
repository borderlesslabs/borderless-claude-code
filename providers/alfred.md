# Alfred — integration notes

> Last verified: 2026-07 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Corridors observed: **MX/SPEI**. Coverage spans LATAM + US assets (ARS, BOB, BRL, CLP, COP, DOP, MXN, PYG, PEN, USD). On the org observed, Alfred settled **`USDC_POLYGON`** — validate your corridor's asset against the *active-provider* capability list (`GET /organizations/network?status=active`), not `/withdrawals/options` alone (see `cookbook/discovery.md`).

## Compliance behavior — the type-driven check

- Alfred's compliance check (`Alfred_base`) appears in `GET /identities/{id}/compliance-checks` with **`slug: null`**. **A null slug does not mean "no check needed"** — it is a real, required check; transactions submitted before it reaches `Approved` report `identity: Compliance check failed`.
- **Drive it by compliance *type* instead of slug** — the path parameter accepts the type string:

  ```
  GET  /identities/{id}/compliance-checks/Alfred_base/requirements
  POST /identities/{id}/compliance-checks/Alfred_base     (idempotency-key required)
  ```

- Both individual (personal KYC) and business KYB are decisioned by Alfred. **Business KYB includes review steps** and can remain at `Started` until they complete.

## Identity requirements

### Personal (KYC)

- **`citizenship` on the personal identity** — set via `PATCH /identities/personal/{id}` with `{"citizenship":"US"}`. The field belongs on the personal identity (the business identity responds "citizenship should not exist"), and it's `citizenship`, not `nationality`.

### Business (KYB)

- **`ProofOfAddress` and `TaxId` documents on the business identity** (`allOf`).
- **Beneficial owner(s)** with `ownershipPercentage` set.
- **The beneficial owner's `NationalId` document with both `imageFront` and `imageBack`.** Alfred's KYB validates the *back* face of the owner's National ID — supply both images.
- Business-profile fields Alfred reads: `conductsMoneyServices` and `operatesInProhibitedCountries` (booleans), plus `approximateDepositFirstMonth` and `approximateMonthlyTransaction` — both **strings** (maxLength 10), not numbers.
- The owner identity carries its own Alfred check — drive compliance on both (see "Owner identities" in `borderless-compliance-flow`).

## Sandbox notes

- Alfred runs real KYC/KYB decisioning on the submitted identity data even in sandbox — plan on realistic test personas. For sandbox test personas that clear the individual and business flows end to end, coordinate with support@borderless.xyz. *(sandbox-only)*

## Message signatures

| Message | Meaning → next step |
|---|---|
| `identity: Compliance check failed` (async, MXN) | The type-driven Alfred check hasn't reached `Approved` → initiate by type; supply citizenship + business docs |
| `citizenship should not exist` | Field sent on the business identity → set it on the personal identity |
