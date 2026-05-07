---
name: borderless-exchange-flow
description: Use when building or debugging a Borderless exchange — converting one asset leg to another inside a single PFI account (asset↔asset, asset↔fiat, or fiat↔fiat depending on the PFI). Triggers on mentions of exchange, conversion, asset swap, FX, fiat conversion, or rebalancing balances inside a Borderless account.
---

# Borderless Exchange Flow

An exchange converts a `from` leg to a `to` leg **inside a single PFI account**. Unlike deposits and withdrawals — which involve fiat moving between the PFI and an external bank, or stablecoin moving between the PFI and an external wallet — an exchange does not leave the PFI's custody. It's an internal balance conversion.

**Common uses:**
- Converting incoming USDC to local fiat held with the PFI before scheduling a withdrawal.
- Converting between two stablecoins (asset ↔ asset) on PFIs that support it.
- Rebalancing fiat balances across currencies inside a PFI account.

**Prerequisites:** A PFI-held account (`AccountPfiCreateDto`) with both legs available. Standalone / web3 / Utila / Dfns accounts hold stablecoins on-chain — they cannot exchange via this endpoint.

## The flow

```
1. Check the source leg balance       → GET  /accounts/{id}/balances    (or fiat balance)
2. Submit the exchange                → POST /exchanges                  → returns an Exchange transaction
3. Poll for completion                → GET  /transactions/{id} until status: Completed
```

There is no on-chain step — the conversion is internal to the PFI. There are also no separate "instructions" returned, unlike deposits and withdrawals.

## 1. Submit the exchange

```bash
POST /exchanges
Headers:
  Authorization: Bearer {accessToken}
  Content-Type: application/json
  idempotency-key: {uuid}
Body:
{
  "from": { "type": "asset", "asset": "USDC_POLYGON" },   // or { "type": "fiat", "fiat": "USD" }
  "to":   { "type": "fiat",  "fiat":  "MXN" },            // or { "type": "asset", "asset": "USDT_TRON" }
  "amount": "1000",          // amount of the source leg (decimal string)
  "accountId": "{pfiAccountId}"
}
```

Each leg is an `ExchangeLegDto`:

| Field | When | Notes |
|---|---|---|
| `type` | always | `asset` or `fiat`. |
| `asset` | when `type == asset` | Chain-qualified identifier (`USDC_POLYGON`, `USDT_TRON`, etc.). |
| `fiat` | when `type == fiat` | ISO currency code (`USD`, `MXN`, `BRL`). |

**Amounts are source-leg only.** You cannot specify the target amount — the PFI's exchange rate determines what you receive.

Response is a `TransactionEntity` with `type: Exchange`. Quote / rate appears once the conversion settles.

## 2. Poll until Completed

The lifecycle uses the same `TransactionStatus` enum as deposits/withdrawals: `Submitted → Verifying → Orchestrating → Pending → Processing → Completed` (or `Failed` / `Cancelled` / `Refunded`). Most exchanges complete in seconds because there's no external rail involved.

```bash
GET /transactions/{id}
```

When `Completed`:
- The source leg is debited from the PFI account.
- The target leg is credited to the same PFI account.
- The transaction record carries the realized rate.

## Hard rules

1. **Quotes do not exist for exchanges** — there is no `/exchanges/quotes` endpoint. The rate is what the PFI offered at execution time. If you need a pre-trade rate, ask the PFI directly (out of band) or build a small probe transaction.
2. **Both legs must be available on the same PFI account.** An asset that lives in your standalone wallet cannot be exchanged via `POST /exchanges` — it has to be deposited into the PFI first (which is a separate transaction).
3. **No PI required.** Exchanges don't have a destination bank; they're balance-only.
4. **Amounts are decimal strings in source-leg natural units.** Same rule as deposits/withdrawals — use a decimal library, never `Number` / `float`.
5. **Idempotency-key required** on `POST /exchanges`.

## Common pitfalls when generating code

- **Using a standalone account.** Exchanges only work on PFI-held accounts. Calling against a wallet-style account returns "no fiat balance" / "no asset" errors.
- **Expecting the target amount to be controllable.** It isn't. You always specify source `amount`.
- **Treating the rate as a quote.** The realized rate is final. There's no quote step you can show the user beforehand via this endpoint.
- **Forgetting that the asset must be chain-qualified.** `USDC` alone is rejected — use `USDC_POLYGON`, `USDC_BASE`, etc.

## Reference

- Exchange endpoint: `POST /v1/exchanges`
- Transaction lifecycle: same as deposits/withdrawals — see `borderless-deposit-flow` or `borderless-withdrawal-flow` for the status model.
- Cancellation: `POST /transactions/{id}/cancel` works while the transaction is non-terminal (rare — exchanges typically complete too fast to cancel).
