# Alfred — integration notes

> Last verified: 2026-06 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Corridors observed: **MX/SPEI**. On the org observed, Alfred settled **`USDC_POLYGON`** — validate your corridor's asset against the *active-provider* capability list (`GET /organizations/network?status=active`), not `/withdrawals/options` alone (see `cookbook/discovery.md`).

## Compliance behavior — the type-driven check

- Alfred's compliance check (`Alfred_base`) appears in `GET /identities/{id}/compliance-checks` with **`slug: null`**. **A null slug does not mean "no check needed"** — it is a real, required check; transactions submitted before it reaches `Approved` report `identity: Compliance check failed`.
- **Drive it by compliance *type* instead of slug** — the path parameter accepts the type string:

  ```
  GET  /identities/{id}/compliance-checks/Alfred_base/requirements
  POST /identities/{id}/compliance-checks/Alfred_base     (idempotency-key required)
  ```

- **Personal (individual) identities approve automatically in sandbox; business KYB includes review steps** and can remain at `Started` until those complete. For consumer/end-user demo flows, model end users as personal identities — they clear immediately.

## Identity requirements

- **`citizenship` on the owner's *personal* identity** — set via `PATCH /identities/personal/{id}` with `{"citizenship":"US"}`. Note: the field belongs on the personal identity (the business identity responds "citizenship should not exist"), and it's `citizenship`, not `nationality`.
- **`ProofOfAddress` document on the business identity.**
- The owner identity carries its own Alfred check — drive compliance on both (see "Owner identities" in `borderless-compliance-flow`).

## Message signatures

| Message | Meaning → next step |
|---|---|
| `identity: Compliance check failed` (async, MXN) | The type-driven Alfred check hasn't reached `Approved` → initiate by type; supply citizenship + ProofOfAddress |
| `citizenship should not exist` | Field sent on the business identity → set it on the personal identity |
