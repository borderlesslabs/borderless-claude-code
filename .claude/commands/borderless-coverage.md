---
description: Show the Borderless corridors currently live on this organization — countries, fiats, payment methods, assets, and transaction types — based on the active-provider network endpoint.
---

Print the corridors currently live on the authenticated Borderless organization. PFIs are pre-configured by Borderless before sandbox provisioning; this command is a read-only inventory of what's already live, not a setup walkthrough.

## Argument

Accept an optional country code (ISO 3166-1 alpha-2) as the first argument to scope output to a single country: e.g. `/borderless-coverage US` or `/borderless-coverage MX`. If omitted, show the global summary.

## Guardrails

- **Never ask the customer for corridor details.** This command is a live read, not an interview.
- **Never guess PFI coverage.** Every corridor shown must come from the live API response.
- **Do not dump raw JSON.** Summarize into readable tables — totals at the top, per-country breakdown below.
- **Read credentials from env**: `BORDERLESS_CLIENT_ID`, `BORDERLESS_CLIENT_SECRET`. Do not echo them.
- **Read base URL**: `BORDERLESS_BASE_URL` if set, else default to `https://sandbox-api.borderless.xyz/v1`.
- **If any call returns non-2xx, stop.** Print status + body (redacting echoed secrets) and ask the customer how to proceed.

## Steps

### 1. Authenticate

```bash
curl -sS -X POST "$BORDERLESS_BASE_URL/auth/m2m/token" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$BORDERLESS_CLIENT_ID\",\"clientSecret\":\"$BORDERLESS_CLIENT_SECRET\"}"
```

Extract `accessToken` → `ACCESS_TOKEN`. Stop on non-200.

### 2. Fetch the active provider network (authoritative)

```bash
curl -sS "$BORDERLESS_BASE_URL/organizations/network?status=active" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

This is the source of truth for what the org can actually do **right now**. Each element is an active provider with:

- `name`, `status`
- `options` keyed by operation type (`deposit` | `withdrawal` | `virtualAccount` | `exchange`), each carrying
  `assets: [{asset, countries[]}]` and `fiats: [{fiat, paymentMethods: [{method, countries[], complianceProfile}]}]`

**Why this endpoint and not `/deposits/options` + `/withdrawals/options`?** The `options` endpoints reflect every ramp config on the org — *including providers that are currently inactive*. An asset listed there is not proof a live provider settles it. The `?status=active` network read only shows live capability. (The older `/deposits/countries` and `/withdrawals/countries` endpoints are deprecated in favor of this one.) See `cookbook/discovery.md` for the full endpoint ladder.

### 3. Build the corridor map

Flatten across active providers into `{country, fiat, method, operationType} → asset set`:

- For each provider → each operation type (`deposit`, `withdrawal`) → each `fiats[]` entry → each `paymentMethods[]` entry → each country in `countries[]`: record the corridor.
- The valid asset set for a corridor is the union of the assets the matching providers list for that country. When more than one active provider serves the same corridor, also note the **intersection** — an integration that uses an intersection asset stays valid regardless of which provider routes a given transaction.

If a country argument was passed, filter to that country. If nothing matches, say "No active coverage for {ARG}" and list the countries that do have coverage as suggestions.

### 4. Render — global output (no argument)

One line per `{country, fiat, method}`, alphabetized by country code. The fourth column is a **flag tag** showing direction: `[D/W]` = both, `[D  ]` = deposit-only, `[  W]` = withdrawal-only. Finish with a legend so the reader doesn't have to guess.

```
Borderless coverage on this org (active providers)
  Deposits:     {N} corridors across {C} countries
  Withdrawals:  {N} corridors across {C} countries
  Providers:    {list of active provider names}

Countries:
  US   USD   ACH              [D/W]   USDC_BASE, USDC_ETHEREUM, USDC_POLYGON
  MX   MXN   SPEI             [D/W]   USDC_POLYGON
  BR   BRL   PIX              [D/W]   USDC_ETHEREUM, USDC_POLYGON
  AR   ARS   COELSA           [  W]   USDC_ETHEREUM, USDC_POLYGON
  …

Legend: D = deposit supported, W = withdrawal supported
```

Aggregation rules:
- Collapse duplicate rows that share `{country, fiat, method}`; list the union of assets across deposit + withdrawal for that corridor.
- Sort alphabetically by country code, then by fiat, then by method.
- Flag tag width is fixed at `[D/W]` / `[D  ]` / `[  W]` padding so asset columns align.

If the org has many corridors configured, the table can run long — conclude with `Use /borderless-coverage {CC} to drill down into a specific country.`

### 5. Render — per-country output

Include which provider(s) serve each corridor and flag intersection-safe assets when multiple do:

```
Coverage for MX (active providers)

  Deposit
    MXN / SPEI  → USDC_POLYGON                    (Provider A)

  Withdrawal
    MXN / SPEI  → USDC_POLYGON                    (Provider A, Provider B — intersection-safe)
    MXN / SPEI  → USDC_ETHEREUM                   (Provider B only)

  Virtual accounts: not configured for MX
```

If only one transaction type is configured, print only that section and say so explicitly.

Optionally (per-country mode only), fetch actual routing so the customer knows which provider a transaction will use today:

```bash
curl -sS "$BORDERLESS_BASE_URL/organizations/network/defaults?country=$CC&operationType=withdrawal" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### 6. Closing line

End with:

```
Coverage read live from {BORDERLESS_BASE_URL} (active providers only). PFIs and corridors are provisioned server-side to match your project's scope — to extend or adjust, work with your Borderless contact.
```

## Do not

- Do not call `POST /integrations-config/setup-*` endpoints or instruct the customer to. PFI setup is Borderless's responsibility.
- Do not use `GET /organizations/integrations/config-info` to infer coverage — `isConfigured: true` does not mean a provider is active. Gate on `network.status=active`.
- Do not suggest "pick a PFI per transaction". Borderless routes automatically based on the corridor.
- Do not cache results across invocations — coverage can change as Borderless adds partners.
- Do not emit raw JSON unless the customer explicitly asks for it.
