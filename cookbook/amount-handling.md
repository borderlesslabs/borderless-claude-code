# Amount handling

Every amount in the Borderless API — `amount`, `fromAmount`, `toAmount`, `fee`, `orchestrationFee`, `exchangeRate`, `developerFee`, corridor `limits` — is a **decimal string in natural units**. `"10.50"` means 10.50 USD, or 10.50 USDC, depending on context. Not 1050 cents. Not an on-chain integer with 6 decimals of precision.

**Which currency is "context"?** On **withdrawals**, `amount` is in the **source asset** (USDC/USDT). On **deposits**, `amount` is in the **fiat** the originator sends. Per-corridor transaction caps are usually stated in fiat or USD-equivalent — get a quote to convert before comparing a withdrawal amount against a fiat-denominated cap.

## The rule

**Use a decimal library. Never use native `Number` / `float` / `double`.**

- TypeScript / Node: `decimal.js`.
- Python: `decimal.Decimal`.
- Go: `github.com/shopspring/decimal`.
- Ruby: `BigDecimal`.
- Java / Kotlin: `BigDecimal`.
- Rust: `rust_decimal`.

## Why

Native floats lose precision above ~15 significant digits and mis-round at ordinary decimal places. Two examples that bite people:

```js
0.1 + 0.2                // 0.30000000000000004
(10 * 0.07).toFixed(2)   // "0.70" — ok, by luck
(100 * 0.07).toFixed(2)  // "7.00" — but "7" internally
(10000 * 1.235).toFixed(2) // "12350.00" — off by a cent vs. decimal math
```

Once a fee or FX rate applies, float errors compound. You send the PFI an amount they can't reconcile, or you ledger a value that doesn't match the webhook.

## String comparison is also wrong

`"10" < "9"` evaluates to `true` lexicographically. If you compare amount strings without parsing as decimals, sorting a list of transactions by amount gives you nonsense. Always:

```ts
import Decimal from 'decimal.js';

const a = new Decimal(tx1.amount);
const b = new Decimal(tx2.amount);
if (a.gt(b)) { /* ... */ }
```

## Cross-currency comparisons

Amounts across `fiat` and `asset` are not directly comparable. A deposit with `amount: "100"` USD and `toAmount: "99.5"` USDC is not "a loss of 0.5" — it reflects fees and FX. Reconcile each leg against its own currency: fiat in against `source`, stablecoin out against `destination`.

## Precision rules per currency

- **Fiat:** 2 decimal places standard (USD, EUR, BRL). A few zero-decimal currencies exist (JPY, KRW). Don't assume 2 universally — store whatever precision the API returns.
- **Stablecoins:** natural units, typically 2 decimals for display. On-chain the same asset uses 6 (USDC) or 18 (DAI) decimals — the Borderless API hides this. Never convert to on-chain integer units except at the moment of broadcasting a withdrawal transfer.

## Display to end users

Format from your decimal type, not from the raw API string. `Decimal("10").toFixed(2)` → `"10.00"`, which is what most users expect to see. The API sometimes returns `"10"` and sometimes `"10.00"` for the same semantic value — don't pass the raw string to your UI or invoicing code.

## When exchanging quote → order → settlement

`quote.toAmount` is an estimate. `transaction.destination.amount` is the settled amount. These will often differ. Persist both if you need to report the drift to your customer — never treat the quote as settlement.
