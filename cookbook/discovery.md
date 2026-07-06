# Discovery — validate what your org can actually do, before you build

Every corridor question ("can I off-ramp MXN?", "which asset should this account hold?", "do I need a bankSlug?") has a live API answer. This page is the endpoint ladder, from most authoritative to most specific, and the traps between them.

**Why this matters:** the discovery endpoints answer *different* questions, and using the wrong one produces integrations that pass discovery and then fail at transaction time. The most common version: an asset appears in `/withdrawals/options`, you build against it, and the withdrawal fails — because the asset came from a ramp config whose provider isn't active on your org.

## The ladder

```
1. What is my org capable of?        GET /organizations/network?status=active     ← AUTHORITATIVE
2. Which PFI routes each corridor?   GET /organizations/network/defaults
3. What methods/assets per corridor? GET /withdrawals/options?country=… /deposits/options?country=…
4. What bank identifier do I need?   GET /withdrawals/institutions?country=…&fiat=…&paymentMethod=…
5. Is it priced & live right now?    GET /withdrawals/quotes/pfis?…  /deposits/quotes/pfis?…
```

### 1. `GET /organizations/network?status=active` — the source of truth

Returns each **active** provider with its full capability map:

- `name`, `status` (`active` | `inactive` | `not_available`), `credentials.configured`, `complianceProfiles`
- `options` keyed by operation type (`deposit` | `withdrawal` | `virtualAccount` | `exchange`), each carrying `assets: [{asset, countries[]}]` and `fiats: [{fiat, paymentMethods: [{method, countries[], complianceProfile}]}]`

**Per-corridor validation recipe:** filter to `status=active` providers → keep those whose `withdrawal` (or `deposit`) option matches your `{fiat, method, country}` → your valid asset set is what those providers list for that country. When multiple active providers match, prefer the **intersection** of their asset lists — it stays valid regardless of which one routes the transaction.

Two things this endpoint protects you from:

- **`/withdrawals/options` reflects every ramp config on the org — including providers that are currently `inactive`.** An asset listed there is not proof a live provider settles it. Verified example (2026-06): a corridor listed `USDC_ETHEREUM` via an inactive provider's config while the active provider settled `USDC_POLYGON` only. A validation that only checked `/options` would have shipped a broken corridor.
- **`isConfigured` ≠ `active`.** `GET /organizations/integrations/config-info` reports whether credentials are set (`{provider, isConfigured, rateCollectionEnabled}`). A provider can be `isConfigured: true` and still absent from the active set. **Gate on `network.status=active`, never on `config-info.isConfigured`.**

### 2. `GET /organizations/network/defaults` — actual routing

Query params: `country`, `operationType`, `paymentMethod`. Tells you which PFI a corridor *actually routes to* (vs. which providers *could* serve it). Useful when reading provider notes (`providers/`) and when a corridor's behavior changes character — routing may have moved.

### 3. `/withdrawals/options` + `/deposits/options` — method and shape discovery

Still essential — this is where you learn the corridor's `method` values and candidate assets. Always pass `country=` (the unfiltered call paginates and can hide common countries). Just remember its answer is "configured", not "active" — cross-check assets against step 1.

### 4. `/withdrawals/institutions` — bank identifier requirements

Returns `allInstitutionsSupported`, `institutionIdentifier` (the field name your PI must carry — `bankSlug`, `bankRoutingNumber`, `identifierValue`, …, or `null` when the addressing field does the routing), and `supportedInstitutions` (`{name, slug}` pairs). Covered in depth in the `borderless-withdrawal-flow` skill, step 0.

**Never cache slugs.** They're PFI-specific and become stale the moment routing changes. Discover at runtime, per transaction batch at minimum.

### 5. `/withdrawals/quotes/pfis` and `/deposits/quotes/pfis` — liveness + pricing

Marketplace-aware quotes: per-PFI rates, fees, and corridor `limits`. Takes `fromAmount` **or** `toAmount` — not `amount` (422 otherwise). These replace the deprecated single-PFI `GET /withdrawals/quotes` / `GET /deposits/quotes`; the old shape equals element `[0]` of the new response filtered to one provider.

A successful quote is the strongest pre-transaction signal that a corridor is live for your org. A corridor that appears in `/options` but can't quote is provisioned in name only — confirm with support before building against it.

## When to re-run discovery

- **At startup / onboarding** — build your corridor map from step 1.
- **Before creating any payment instruction** — steps 3 + 4.
- **After any unexplained corridor behavior change** — "Invalid bank code", new required fields, different asset support → routing may have moved; re-run steps 1–4 and recreate PIs with fresh slugs.
- **After Borderless tells you provisioning changed** — new corridors enabled, provider added.

## Deprecated endpoints (avoid in new code)

Per the API spec, these are superseded by `GET /organizations/network`:

- `GET /deposits/countries`, `GET /withdrawals/countries`
- The unfiltered "available options" listing variants

They still respond, but the network endpoint is where new capability (and the active/inactive distinction) lands first.

## Related

- Step-0 discovery inside each flow: `borderless-deposit-flow`, `borderless-withdrawal-flow`.
- Per-provider behavior once you know who routes your corridor: `providers/README.md`.
- Corridor field requirements snapshot: `data/corridors.json` (live discovery is authoritative).
