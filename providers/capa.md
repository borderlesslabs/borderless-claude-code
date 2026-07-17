# Capa — integration notes

> Last verified: 2026-07 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Corridors observed: **MX**. Capa's identity requirements are built around Mexican end users — model your MX personal identities to match before driving compliance.

## Compliance behavior

- Compliance is initiated per check (`POST /identities/{id}/compliance-checks/{slug}` with `idempotency-key`) and reads org-provided `capaCredentials`.
- **Individual (personal) KYC is scoped to Mexican residents.** Capa validates a Mexican tax-ID format, a Mexican economic-activity classification, and a back-of-ID image. Model MX end users accordingly.
- Business KYB expects a provider-side customer record to exist before initiation succeeds (see Sandbox notes).

## Identity requirements (personal, MX end users)

- **`taxId` must be a Mexican RFC** — format `^[A-Z]{4}\d{6}[A-Z0-9]{3}$` (four letters, six digits, three-character checksum). A tax ID from another country will not pass.
- **`economicActivity`** — a Capa-specific field taking one value from a Spanish-language enum (for example `DESARROLLO DE SOFTWARE`, `CONSULTORIA`). This is distinct from the standard `activity` / `occupationCode` fields; supply the Capa value in addition.
- **Back-of-ID image** — `backIdUrl` must be a string pointing at the reverse face of the identity document.
- A `Selfie` document and `occupationCode` are also read on the personal identity.

## Sandbox notes

- These Mexican-format validations (RFC pattern, `economicActivity` enum, `backIdUrl`) fire at **initiation**, not in `/requirements` — a US or non-MX identity clears `/requirements` and only fails at `POST`. Build MX personas to Capa's shape from the start. *(sandbox-only)*
- On a new org, business KYB can return `Customer record is not found for identity ... pfi: Capa` — Capa expects a provider-side customer record that the initiate-only flow does not bootstrap on its own. Coordinate this one-time customer setup through support@borderless.xyz. *(org-dependent)*

## Message signatures

| Message | Meaning → next step |
|---|---|
| `taxId` must match `^[A-Z]{4}\d{6}[A-Z0-9]{3}$` | Supply a Mexican RFC — model the end user as a Mexican taxpayer |
| `economicActivity must be one of ...` | Use a value from Capa's Spanish-language `economicActivity` enum |
| `identity.backIdUrl must be a string` | Provide the back-of-ID image URL |
| `Customer record is not found for identity ... pfi: Capa` | KYB customer bootstrap pending on this org → support@borderless.xyz |
