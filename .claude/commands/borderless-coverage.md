---
description: Show the Borderless corridors currently configured on this organization — countries, fiats, payment methods, assets, and transaction types — based on live API calls.
---

Print the corridors currently configured on the authenticated Borderless organization. PFIs are pre-configured by Borderless before sandbox provisioning; this command is a read-only inventory of what's already live, not a setup walkthrough.

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

### 2. Fetch canonical country lists

```bash
curl -sS "$BORDERLESS_BASE_URL/deposits/countries"    -H "Authorization: Bearer $ACCESS_TOKEN"
curl -sS "$BORDERLESS_BASE_URL/withdrawals/countries" -H "Authorization: Bearer $ACCESS_TOKEN"
```

Both return a JSON array of 2-letter country codes. Union them → `ALL_COUNTRIES`.

If a country argument was passed, intersect `ALL_COUNTRIES` with `[$ARG]`. If the intersection is empty, say "No coverage configured for {ARG}" and list the first 5–10 countries from `ALL_COUNTRIES` as suggestions.

### 3. Fetch corridors per country

For each `CC` in the target country set:

```bash
curl -sS "$BORDERLESS_BASE_URL/deposits/options?country=$CC"    -H "Authorization: Bearer $ACCESS_TOKEN"
curl -sS "$BORDERLESS_BASE_URL/withdrawals/options?country=$CC" -H "Authorization: Bearer $ACCESS_TOKEN"
```

Each response is an array of `{id, country, method, fiat, asset}`. Aggregate by `{country, method, fiat}` and collect the set of assets behind each.

**Why per-country, not unfiltered?** The unfiltered `/deposits/options` paginates and drops common countries (US in particular is often missing from the default page). The `?country=` filter is the authoritative path.

### 4. Render — global output (no argument)

One line per `{country, fiat, method}`, alphabetized by country code. The fourth column is a **flag tag** showing direction: `[D/W]` = both, `[D  ]` = deposit-only, `[W  ]` = withdrawal-only. Finish with a legend so the reader doesn't have to guess.

```
Borderless coverage on this org
  Deposits:     {N} corridors across {C} countries
  Withdrawals:  {N} corridors across {C} countries

Countries:
  US   USD   ACH              [D/W]   ETH, USDC_BASE, USDC_ETHEREUM, USDC_OPTIMISM, USDC_POLYGON, USDC_SOLANA, USDT_ETHEREUM
  US   USD   Wire             [D/W]   ETH, USDC_BASE, USDC_ETHEREUM, USDC_OPTIMISM, USDC_POLYGON, USDC_SOLANA, USDT_ETHEREUM
  MX   MXN   SPEI             [D/W]   USDC_ETHEREUM, USDC_POLYGON, USDT_ETHEREUM, USDT_POLYGON
  BR   BRL   PIX              [D/W]   USDC_ETHEREUM, USDC_POLYGON, USDT_ETHEREUM, USDT_POLYGON
  KE   KES   MobileMoney      [D  ]   USDC_CELO, USDC_ETHEREUM, USDC_POLYGON, USDC_SOLANA, USDT_ETHEREUM, USDT_POLYGON, USDT_SOLANA, USDT_TRON
  AR   ARS   COELSA           [W  ]   USDC_BASE, USDC_ETHEREUM, USDC_POLYGON, USDC_SOLANA, USDT_ETHEREUM, USDT_POLYGON, USDT_SOLANA, USDT_TRON
  …

Legend: D = deposit supported, W = withdrawal supported
```

Aggregation rules:
- Collapse duplicate rows that share `{country, fiat, method}`; list the **union** of assets across deposit + withdrawal for that corridor.
- Sort alphabetically by country code, then by fiat, then by method.
- Flag tag width is fixed at `[X/Y]` / `[X  ]` / `[  Y]` padding so asset columns align.

For orgs with many countries (the default sandbox has 100+), the table will run long. Conclude with: `Use /borderless-coverage {CC} to drill down into a specific country.`

### 5. Render — per-country output

```
Coverage for US

  Deposit
    USD / ACH   → USDC_BASE, USDC_ETHEREUM, USDC_OPTIMISM, USDC_POLYGON, USDC_SOLANA, USDT_ETHEREUM, ETH
    USD / Wire  → USDC_BASE, USDC_ETHEREUM, USDC_OPTIMISM, USDC_POLYGON, USDC_SOLANA, USDT_ETHEREUM, ETH

  Withdrawal
    USD / ACH   → USDC_BASE, USDC_ETHEREUM, USDC_OPTIMISM, USDC_POLYGON, USDC_SOLANA, USDT_ETHEREUM, ETH
    USD / Wire  → USDC_BASE, USDC_ETHEREUM, USDC_OPTIMISM, USDC_POLYGON, USDC_SOLANA, USDT_ETHEREUM, ETH
```

If only one transaction type is configured, print only that section and say so explicitly.

### 6. Closing line

End with:

```
Coverage read live from {BORDERLESS_BASE_URL}. If a corridor you need isn't listed, contact support@borderless.xyz — PFIs are provisioned server-side.
```

## Do not

- Do not call `POST /integrations-config/setup-*` endpoints or instruct the customer to. PFI setup is Borderless's responsibility.
- Do not suggest "pick a PFI per transaction". Borderless routes automatically based on the corridor.
- Do not cache results across invocations — coverage can change as Borderless adds partners.
- Do not emit raw JSON unless the customer explicitly asks for it.
