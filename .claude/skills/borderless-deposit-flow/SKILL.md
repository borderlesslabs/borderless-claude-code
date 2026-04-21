---
name: borderless-deposit-flow
description: Use when building or debugging a Borderless deposit (on-ramp) flow — converting local fiat currency into stablecoins. Triggers on mentions of deposits, on-ramp, fiat-to-stablecoin, pay-in, or receiving funds via ACH, wire, PIX, SPEI, or other local rails in a Borderless context.
---

# Borderless Deposit Flow (On-Ramp)

A deposit converts local fiat → stablecoin. The payment originator sends fiat via local rails (ACH, Wire, PIX, SPEI, etc.) to the PFI's bank account. The PFI then releases stablecoins to the account's wallet.

**Prerequisites:** A compliant identity for the corridor + an account with the target stablecoin asset configured. See `borderless-compliance-flow` and the Accounts documentation.

## The flow

```
(optional) Get quote     → GET  /deposits/quotes
1. Create deposit        → POST /deposits                    → returns payment instructions
2. Originator sends fiat → out-of-band, directly to PFI bank  (ACH / Wire / PIX / etc.)
3. PFI releases stablecoin → webhook: Transaction_Updated → status: Completed
```

Track with `GET /transactions/{id}` or by listening for `Transaction_Updated` webhooks.

## Optional: get a quote first

Quotes show estimated fees and exchange rates. They are **not guarantees** — never use them as settlement amounts.

```bash
GET /deposits/quotes?country=US&fiat=USD&asset=USDC_POLYGON&paymentMethod=ACH&fromAmount=10
Headers: Authorization
```

Query params (not a body — this is a GET): `country`, `fiat`, `asset`, `paymentMethod`, `fromAmount`.

Response includes `toAmount`, `exchangeRate`, `totalFee`, `orchestrationFee`, and corridor `limits`. Surface these as estimates only.

## 1. Create the deposit

```bash
POST /deposits
Headers:
  Authorization: Bearer {accessToken}
  Content-Type: application/json
  idempotency-key: {uuid}
Body:
{
  "fiat": "USD",
  "amount": "1000.00",
  "asset": "USDC_POLYGON",
  "accountId": "{accountIdFromAccountsSetup}",
  "paymentMethod": "ACH",
  "country": "US"
}
```

The response shape (abbreviated):

```json
{
  "id": "cmi7s...",
  "type": "Deposit",
  "status": "Submitted",
  "pfiName": "Bridge",
  "source": { "amount": "1000", "fiatCurrency": "USD", "paymentMethod": "ACH" },
  "destination": { "asset": "USDC_POLYGON", "accountId": "...", "fiatCurrency": null },
  "instructions": null,
  "depositInstruction": null,
  ...
}
```

### Handling `instructions: null` / `depositInstruction: null`

The response carries two parallel instruction fields:

- **`depositInstruction`** — the typed, canonical shape (`{ paymentMethod, details: { bankName, bankAccountNumber, bankRoutingNumber, ... } }`). Prefer reading from this.
- **`instructions`** — a flatter snake_case variant (`{ bank_name, bank_account_number, ... }`). Kept populated for compatibility; same information.

Both are usually `null` at creation if KYC/KYB is still settling at the PFI. **Do not retry the deposit.** Either:

- Subscribe to the `Transaction_Updated` webhook and read the instructions when they arrive, or
- Poll `GET /transactions/{id}` on a back-off schedule until **either** field populates (they populate together).

Once populated, the instructions specify exactly where and how the payment originator should send fiat.

## 2. Originator sends fiat to the PFI

This happens **outside Borderless** over the traditional fiat rail (ACH, Wire, Fedwire, PIX, SPEI, etc.). Critical rules:

- The fiat transfer must match the deposit order **exactly** — amount, reference, beneficiary bank, everything as shown in `depositInstruction`.
- If the reference/memo is specified, it must be included. PFIs use it to attribute the incoming payment.
- Borderless is not liable for fiat sent to incorrect destinations. Surface the instructions verbatim to the originator; don't paraphrase or format-shift.

## 3. PFI releases stablecoins

Once the PFI reconciles the incoming fiat, it releases stablecoin to the destination account's wallet address. The transaction progresses through the statuses in the table below — typically `Submitted` → `Verifying` → `Orchestrating` → `Pending` → `Processing` → `Completed`. Failures end in `Failed` with a `failureReason`.

`txHash` on the transaction record is an **array of strings** (`txHash: string[]`) — not a single hash. It's empty at creation and populates after the PFI broadcasts on-chain; most flows end with one entry, but some (e.g., ERC-20 approve + transfer) add more than one.

## Lifecycle summary

| Status | Meaning |
|---|---|
| `Submitted` | Order received by Borderless and queued for processing. |
| `Verifying` | PFI KYC review in progress (only on PFIs that require it). |
| `Orchestrating` | Borderless is selecting the PFI and preparing execution data. |
| `Pending` | Awaiting action from the originator — for deposits, the fiat transfer hasn't arrived yet. This is the state where `depositInstruction` is usually populated and the originator is expected to send fiat. |
| `Processing` | Fiat received by PFI; stablecoin transfer to the destination account in progress. |
| `Completed` | Stablecoins delivered. Terminal. |
| `Failed` | See `failureReason`. Terminal. |
| `Cancelled` | Cancelled by the caller (`POST /transactions/{id}/cancel`) or by the PFI. Terminal. |

## Cancellation

```bash
POST /transactions/{id}/cancel
```

Cancellation only works from non-terminal early states (`Submitted`, `Verifying`, `Orchestrating`, `Pending`). Once the transaction reaches `Processing`, the PFI is already moving funds and the cancel is denied.

## Common pitfalls when generating code

- **Don't block on `instructions` / `depositInstruction`** in the response from `POST /deposits`. Both may legitimately be `null` at creation. Write the code so either can populate asynchronously from a webhook or poll.
- **Don't hardcode `pfiName`.** The PFI is selected by Borderless based on the corridor; your code should treat any PFI as valid.
- **Always use the `accountId` returned by account creation.** Don't reconstruct account state from wallet addresses.
- **Validate the corridor before submitting.** Call `GET /deposits/options?country={country}` and `/deposits/countries` at startup or during onboarding to confirm the `{country, fiat, asset, paymentMethod}` you're about to use is supported for your configured PFIs. Always pass `country=` — the unfiltered `/deposits/options` paginates and can hide configured corridors (US, in particular, is often missing from the default page).
- **Amounts are decimals as strings in responses.** Use a decimal library for comparisons and ledger entries; don't use JavaScript `Number`.

## Testing on sandbox

Sandbox base URL: `https://sandbox-api.borderless.xyz/v1`. Test deposit flows without real fiat — PFI partners have sandbox modes. Status transitions are simulated; `Transaction_Updated` webhooks fire as expected. Don't mix sandbox `clientId`/`clientSecret` with production URLs or vice versa.

## Reference implementation

See `/examples/deposit-us-ach-to-usdc/` in this repo for a Node.js implementation covering auth, idempotency, deposit creation, and status polling. Webhook-driven reconciliation lives in a separate example — `/examples/webhooks/` — and is documented in the `borderless-webhook-verifier` skill.

## Full reference

- Deposit endpoints: https://docs.borderless.xyz/llms.txt (search for `transaction-deposits`)
- Quick-start walkthrough: https://docs.borderless.xyz/docs/quick-start-guide.md
