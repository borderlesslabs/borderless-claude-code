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

`/transactions` accepts useful filters per the `TransactionsQuery` schema: `status`, `type` (`Deposit` / `Withdrawal` / `Exchange`), `pfiName`, `sourceAccountId`, `destinationAccountId`, `includeAccounts`, `fromDate` / `toDate` (creation), `fromUpdatedDate` / `toUpdatedDate` (state change), `counterPartyIdentityId`. Use `fromUpdatedDate` for incremental sync — pull anything updated since your last reconciliation watermark.

For each Borderless transaction: look it up in your ledger by `reference`. If found and both sides agree on status + amount, continue. If they disagree, that's your reconciliation report entry. Compare the response's `reconciliationStatus` field too — Borderless's own assessment of whether the transaction is in sync with the PFI.

Bulk export option: `GET /transactions/export` returns a downloadable file (same filters as `/transactions`) for offline analysis.

## Reconciliation endpoints (server-side helpers)

Borderless exposes three reconciliation endpoints to surface mismatches on their side, separate from your own ledger walk:

```bash
GET /reconciliation/items?status={STATUS}                # paginated list of reconciliation items
GET /reconciliation/items/{transactionId}                # full reconciliation result for one transaction
GET /reconciliation/orphaned-transactions?pfiName={PFI}  # paginated list of unmatched PFI-side transactions
GET /reconciliation/orphaned-transactions/{id}           # one orphan in detail
```

`/reconciliation/items` returns Borderless's own reconciliation status for transactions it knows about — useful for catching transactions where Borderless and the PFI disagree, before that disagreement hits your ledger.

`/reconciliation/orphaned-transactions` returns transactions that exist on a PFI's side but haven't been matched to a Borderless transaction — usually because a deposit arrived at a PFI's bank with a memo that didn't cleanly map back to one of your operations. Each orphan carries `externalId`, `externalData`, `pfiName`, `sourceAmount`, `destinationAmount`, `sourceCurrency`, `destinationCurrency`, `type`, `periodStart`, `periodEnd`.

```bash
curl "$BORDERLESS_BASE_URL/reconciliation/orphaned-transactions" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Review these periodically. Each orphan is either: (a) your customer paid but didn't include the reference — attribute manually; (b) a duplicate payment — refund via your support flow; (c) a payment meant for someone else — return.

## Gaps from a disabled webhook

If your webhook was disabled for a window `[T_start, T_end]`, list transactions updated in that window and reprocess them through your normal handler path (deduped via the event `id` on their webhook records, or the transaction `id` if you dedupe on that). See `cookbook/webhook-replay.md`.

## Compare as decimals

Both `amount` and fee fields come back as decimal strings. Compare via `Decimal` / `decimal.js` / `shopspring/decimal`. Lexicographic string comparison gives wrong answers (`"10"` < `"9"`). See `cookbook/amount-handling.md`.
