# Provider integration notes

Per-provider integration notes observed on real sandbox orgs. Each PFI in the Borderless network operates under its own regulatory obligations, and each runs its own validation and compliance program. The flow skills tell you the *correct sequence*; these pages tell you *what each provider expects* — compliance steps, identity fields, payment-instruction shapes, limits, and the exact messages it returns — so your integration passes on the first attempt.

## How to use these pages

**For debugging, not routing.** Never branch your integration logic on `pfiName` — Borderless selects the PFI per corridor and routing can change. But when a transaction fails or a compliance check needs attention, the record carries `pfiName` — open that provider's page and check its message signatures before anything else.

```
GET /transactions/{id}          → .pfiName + .failureReason.details[].pfiErrorMessage
GET /identities/{id}/compliance-checks  → each check names its provider
```

**Which provider serves your corridor** is answered by live discovery, never by these pages: `GET /organizations/network?status=active` for capability, `GET /organizations/network/defaults` for actual routing. See `cookbook/discovery.md`.

## Provenance convention

Every empirical claim in these pages carries:

- **Last verified: YYYY-MM** — when the behavior was last observed on a live sandbox org.
- **Scope** — `universal` (API contract, stable), `provider-dependent` (applies wherever this PFI routes), or `org-dependent` (observed on some orgs, not others — always re-verify on yours).

Corridor routing evolves as the network grows — corridors can move between PFIs as Borderless optimizes coverage. If a page disagrees with what discovery or a live response tells you, trust the live signal and send a correction to support@borderless.xyz.

## Pages

| Provider | Corridors observed | Compliance style |
|---|---|---|
| [Bridge](bridge.md) | US/USD (ACH, Wire), EU/SEPA, USD virtual accounts | ToS + initiation |
| [Walapay](walapay.md) | GBP, AED, EGP, TRY, INR, PHP, MXN | ToS + initiation, thorough document validation |
| [Koywe](koywe.md) | AR, CO, CL, PE | Initiation, rigorous local-format validation |
| [Alfred](alfred.md) | MX/SPEI | Type-driven check |
| [Infinia](infinia.md) | BR/PIX, MX/SPEI, AR/COELSA | PreApproved — instant |
| [Yellow Card](yellowcard.md) | NGN, ZAR, Africa | PreApproved for foreign businesses; local KYC for residents |
| [HoneyCoin](honeycoin.md) | NGN | PreApproved |

A provider only gets a page once we have verified first-hand integration observations to share. Absence of a page means "no notes yet", nothing more.
