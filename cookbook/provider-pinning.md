# Provider pinning — selecting a specific PFI, consistently across the discovery ladder

> Last verified: 2026-07 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active` and `GET /organizations/network/defaults`.

By default, Borderless routes each corridor to your org's **default PFI**, and you don't name a provider anywhere. When you *do* want a specific provider — to exercise a multi-provider corridor, test failover, or evaluate a candidate — pass the optional `pfiName` field. The one rule that makes pinning reliable: **pin the whole ladder to the same provider, then verify the provider on the returned transaction.** A transaction pinned to one PFI while its quote and bank-identifier discovery answered for the default PFI is the common way pinning goes wrong.

This is distinct from the debugging rule in `providers/README.md`. Pinning via the `pfiName` you *send* is a deliberate operator choice. Branching your integration's *behavior* on the `pfiName` you get *back* is the anti-pattern — routing can change, so never make transaction logic conditional on which provider served it.

## Know the default first

`GET /organizations/network/defaults` (params: `country`, `operationType`, optional `paymentMethod`) tells you which PFI a corridor routes to when you omit `pfiName`. Read it before deciding whether you even need to pin — if the default already is the provider you want, omitting `pfiName` is simpler and survives future config changes. Use `GET /organizations/network?status=active` to see which providers are *capable* of the corridor (the candidate set worth pinning across).

## Pin the whole ladder, or none of it

`pfiName` is accepted at each rung of the discovery ladder, and **without it each rung answers for the org's default provider** — not for the provider you intend to transact with:

```
GET /withdrawals/institutions?country=…&fiat=…&paymentMethod=…&pfiName=…
GET /deposits/institutions?country=…&fiat=…&paymentMethod=…&pfiName=…
GET /withdrawals/quotes/pfis?…&pfiName=…      (and /deposits/quotes/pfis)
POST /withdrawals   body: { …, "pfiName": "…" }
POST /deposits      body: { …, "pfiName": "…" }
```

If you pin the `POST` but discovered bank-identifier requirements or a quote against the (unpinned) default, you can build a payment instruction to the wrong provider's shape or price against the wrong rate. Pass the same `pfiName` to institutions discovery, to the quote, and to the transaction. On `POST /withdrawals` and `POST /deposits`, `pfiName` is optional and **falls back to the org default when omitted** — so an accidental omission on the transaction alone silently reverts to default routing.

## Always verify `.pfiName` on the returned transaction

Pinning is a request; confirmation is the response. After creating the transaction, read `.pfiName` on the returned object (`GET /transactions/{id}`, and for withdrawals the `destinationPaymentInstruction` / onchain instruction blocks) and assert it equals what you pinned. This is the only proof the pin took effect — do it in evaluation and failover runs, not just once by hand.

## Executable quotes as an alternative

Where you want the provider *and* the price locked together, take an executable quote: `POST /withdrawals/quotes` (or `POST /deposits/quotes`) with `pfiName` in the body returns a `quoteId` valid until its `expiresAt`; passing that `quoteId` on the transaction pins that provider's quoted terms. (`GET /withdrawals/quotes/pfis` is the *browse* endpoint — per-PFI rates and limits for comparison; it does not mint a `quoteId`.) Quotes remain estimates until executed — keep the "subject to change" caveat on anything you display, and never treat a quote as the settlement amount.

## When to pin vs. rely on the default

Pin when:

- **A corridor has more than one active provider** and you specifically want one of them.
- **You're testing failover** — deliberately route around the default to confirm the alternate settles end-to-end.
- **You're evaluating a provider** — drive a full flow against a named PFI before it becomes a default.

Rely on default routing otherwise. Most integrations should omit `pfiName` and let Borderless route — it's less to maintain and it tracks network optimization automatically. Pinning is an operational tool, not a standing part of transaction logic.

## Verified

A withdrawal pinned to a specific PFI on a corridor whose **default was a different provider** completed end-to-end in sandbox (2026-07): the pinned `pfiName` held through discovery, quote, submission, and the final `Completed` transaction, with `.pfiName` matching the pin at every step. Where a provider is already the org default, sending `pfiName` explicitly is still cheap insurance against a future default-PFI change silently rerouting the rail — the request behaves identically, and the verification step catches any drift.

## Related

- `cookbook/discovery.md` — the full endpoint ladder; pinning threads `pfiName` through rungs 2–5.
- `providers/README.md` — per-provider behavior once you know who routes (or who you pinned).
- `providers/` — the page for the `pfiName` you pinned, for its PI shapes and message signatures.
