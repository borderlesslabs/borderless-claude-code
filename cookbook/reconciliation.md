# Reconciliation — matching Borderless transactions to your internal ledger

Webhooks are at-least-once, ordering is not guaranteed, and your endpoint can miss deliveries (auto-disable, deploys, network blips). Assume gaps. Reconcile on a schedule.

## Match keys, in priority order

1. **`reference` field.** Every `POST /deposits` and `POST /withdrawals` accepts a `reference` string that echoes back on the transaction record and webhooks. Put your internal invoice / order / payout ID here. This is your primary match key — one match is definitive.
2. **Borderless transaction `id`.** Persist it the moment you create a transaction. Unique, stable, returned on every subsequent call.
3. **Idempotency key.** Persist the UUID v4 you used when creating the transaction. On retries your record is keyed the same; on reconciliation you can trace a Borderless transaction back to the operation that triggered it.
4. **`{amount, asset, fiat, timestamp}` tuple.** Fuzzy fallback if the three above are missing — only use when you've lost the definitive keys and need to re-stitch by hand.

Always reconcile on `reference` or `id` first. Falling back to amount/timestamp matching is error-prone — duplicate amounts on the same day are common.

## Pull recent transactions

```bash
curl "$BORDERLESS_BASE_URL/transactions?startingAfter=<cursor>&limit=100" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

List endpoints are cursor-paginated (`startingAfter` + `limit`), not offset-based. Walk pages until exhausted.

For each Borderless transaction: look it up in your ledger by `reference`. If found and both sides agree on status + amount, continue. If they disagree, that's your reconciliation report entry.

## Orphaned transactions

Borderless occasionally surfaces transactions that exist on their side but haven't been matched to an external reference — usually because a deposit arrived at a PFI's bank with a memo that didn't cleanly map back to one of your operations.

```bash
curl "$BORDERLESS_BASE_URL/reconciliation/orphaned-transactions" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Review these periodically. Each orphan is either: (a) your customer paid but didn't include the reference — attribute manually; (b) a duplicate payment — refund via your support flow; (c) a payment meant for someone else — return.

## Gaps from a disabled webhook

If your webhook was disabled for a window `[T_start, T_end]`, list transactions updated in that window and reprocess them through your normal handler path (deduped via the event `id` on their webhook records, or the transaction `id` if you dedupe on that). See `cookbook/webhook-replay.md`.

## Compare as decimals

Both `amount` and fee fields come back as decimal strings. Compare via `Decimal` / `decimal.js` / `shopspring/decimal`. Lexicographic string comparison gives wrong answers (`"10"` < `"9"`). See `cookbook/amount-handling.md`.
