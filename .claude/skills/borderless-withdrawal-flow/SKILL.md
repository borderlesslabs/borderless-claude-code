---
name: borderless-withdrawal-flow
description: Use when building or debugging a Borderless withdrawal (off-ramp) flow — converting stablecoins into local fiat currency. Covers payment instruction creation, withdrawal transaction submission, and the on-chain stablecoin transfer to the PFI. Triggers on mentions of withdrawals, off-ramp, stablecoin-to-fiat, pay-out, payouts, or sending fiat to a bank account via a Borderless integration.
---

# Borderless Withdrawal Flow (Off-Ramp)

A withdrawal converts stablecoin → local fiat. The client sends stablecoins on-chain to the PFI's deposit address. The PFI then sends local fiat to a bank account specified by a **Payment Instruction** that you create up front.

This has **one more step than a deposit** because you must tell the PFI where the fiat should land.

**Prerequisites:** A compliant identity for the corridor + an account holding the source stablecoin. See `borderless-compliance-flow`.

## The flow

```
(optional) Get quote              → GET  /withdrawals/quotes
1. Create payment instruction     → POST /identities/{id}/payment-instructions   → returns paymentInstructionId
2. Create withdrawal              → POST /withdrawals                             → returns on-chain instructions (deposit address)
3. Send stablecoin on-chain       → out-of-band, from the account's wallet       (exact amount, exact fromAddress, exact toAddress)
4. PFI releases fiat              → webhook: Transaction_Updated → status: Completed
```

## Optional: get a quote first

```bash
GET /withdrawals/quotes?country=US&fiat=USD&asset=USDC_POLYGON&paymentMethod=ACH&fromAmount=10
Headers: Authorization
```

Query params (not a body — this is a GET): `country`, `fiat`, `asset`, `paymentMethod`, `fromAmount`.

Returns `toAmount`, `exchangeRate`, `totalFee`, `orchestrationFee`, and corridor `limits`. **Estimates only**; they are not firm.

## 1. Create the payment instruction

The payment instruction captures the **destination bank account** for the fiat leg. Create it against the identity that owns the beneficiary relationship.

```bash
POST /identities/{identityId}/payment-instructions
Headers:
  Authorization: Bearer {accessToken}
  Content-Type: application/json
  idempotency-key: {uuid}
Body:
{
  "country": "US",
  "currency": "USD",
  "name": "Primary Bank Account",
  "paymentMethod": "ACH",
  "details": {
    "bankName": "Example Bank",
    "accountHolderName": "John Doe",
    "bankAccountNumber": "123456789012",
    "bankRoutingNumber": "123456789",
    "bankAccountType": "Checking",
    "address": { "street1": "...", "city": "...", "state": "...", "country": "US", "postalCode": "..." }
  }
}
```

The `details` schema varies by `country` + `paymentMethod`. Examples:
- **US / ACH:** `bankRoutingNumber`, `bankAccountNumber`, `bankAccountType`
- **Brazil / PIX:** PIX key (email, phone, CPF, or random key)
- **Mexico / SPEI:** CLABE
- **Nigeria / Mobile Money:** provider + phone number
- **EU / SEPA:** IBAN + BIC

Use `GET /withdrawals/institutions` for the target country/currency/paymentMethod to discover the required `details` schema dynamically.

**Capture `id` from the response** — this is the `paymentInstructionId` for step 2.

Payment instructions can be reused for repeat payouts to the same beneficiary. Persist them; don't re-create on every transaction.

## 2. Create the withdrawal

```bash
POST /withdrawals
Headers:
  Authorization: Bearer {accessToken}
  Content-Type: application/json
  idempotency-key: {uuid}
Body:
{
  "fiat": "USD",
  "country": "US",
  "asset": "USDC_POLYGON",
  "amount": "100.00",
  "accountId": "{sourceAccountId}",
  "paymentInstructionId": "{fromStep1}",
  "paymentPurpose": "personal remittance",  // REQUIRED. Enum — see list below.
  "developerFee": "5.00",                   // optional, your markup
  "purposeDescription": "Monthly...",       // optional
  "reference": "INV-2025-001"               // optional, echoed back in the transaction
}
```

**`paymentPurpose` is required** — the PFI uses it for AML / travel-rule filings. Must be one of: `salary payment`, `personal remittance`, `rent payment`, `property purchase`, `owned account abroad`, `advertising expenses`, `advisory fees`, `business insurance`, `construction`, `delivery fees`, `education`, `exports`, `donation`, `hotel`, `loan payment`, `maintenance expenses`, `medical expense`, `office expenses`, `royalty fees`, `service charge`, `shares investment`, `tax payment`, `transportation fees`, `travel`, `utility bills`, `other`.

The response returns the transaction but `withdrawalOnchainInstruction` is usually **`null` at creation** — it populates asynchronously once the PFI provisions the destination address. Poll `GET /transactions/{id}` or subscribe to `Transaction_Updated` webhooks. Do not broadcast until it's present.

```json
{
  "id": "...",
  "type": "Withdrawal",
  "status": "Submitted",
  "withdrawalOnchainInstruction": {
    "asset": "USDC_POLYGON",
    "amount": "100",
    "toAddress": "0x...",      // PFI's receiving address — send here
    "fromAddress": "0x..."     // the address declared on the account's asset
  },
  "destination": { "paymentInstructionId": "...", "fiatCurrency": "USD" }
}
```

## 3. Send stablecoins on-chain

Transfer the stablecoins from the account's wallet to `withdrawalOnchainInstruction.toAddress`.

**Three things must match exactly** — PFIs reconcile on all three:

1. **`amount`** — exact amount, in the correct decimal precision for the stablecoin.
2. **`fromAddress`** — the address you declared in the account. Sending from a different wallet can result in **lost funds with no refund**.
3. **`toAddress`** — the PFI's receiving address and network as returned in the instructions. Sending USDC on Ethereum to a Polygon address = lost funds.

The `asset` field encodes the network (`USDC_POLYGON`, `USDC_BASE`, `USDT_TRON`, etc.). Match both the token and the chain.

## 4. PFI releases fiat

Once the PFI detects the on-chain transfer and reconciles all three fields above, it issues the fiat payment per the payment instruction. The transaction status progresses to `Completed`.

`txHash` on the transaction record is an **array of strings** (`txHash: string[]`) — not a single hash. It's empty at creation and populates with the hash(es) of **your** stablecoin transfer after it lands on-chain; most flows end with one entry, but some (e.g., ERC-20 approve + transfer) add more than one.

## Lifecycle summary

Typical progression: `Submitted` → `Verifying` → `Orchestrating` → `Pending` → `Processing` → `Completed`.

| Status | Meaning |
|---|---|
| `Submitted` | Order received by Borderless and queued for processing. |
| `Verifying` | PFI KYC review in progress (only on PFIs that require it). |
| `Orchestrating` | Borderless is selecting the PFI and preparing execution data. |
| `Pending` | Awaiting action from the sender — `withdrawalOnchainInstruction` is usually populated in this state and the caller is expected to broadcast the stablecoin transfer. |
| `Processing` | Stablecoin transfer received on-chain and reconciled; fiat payout in flight. |
| `Completed` | Fiat delivered to the payment instruction's bank. Terminal. |
| `Failed` | See `failureReason`. Terminal. |
| `Cancelled` | Cancelled by the caller or by the PFI. Terminal. |

## Hard rules — lost funds risks

1. **Never send from a different `fromAddress`** than the one declared on the account / returned in `withdrawalOnchainInstruction.fromAddress`.
2. **Never send a different amount** than specified. Even dust differences can cause reconciliation to fail.
3. **Never send on a different chain.** `USDC_POLYGON` ≠ `USDC_BASE` ≠ `USDC_ETHEREUM`.
4. **Never reuse a `toAddress` across withdrawals unless the PFI explicitly says it is reusable.** Each withdrawal gets its own instruction; treat it as single-use.

Borderless cannot refund stablecoins sent incorrectly. The PFI may not be able to recover them either.

## Cancellation

```bash
POST /transactions/{id}/cancel
```

Only works from non-terminal early states (`Submitted`, `Verifying`, `Orchestrating`, `Pending`). Critically: once you broadcast the on-chain stablecoin transfer — even if the transaction is still in `Pending` — the PFI will reconcile and progress to `Processing`, after which cancellation is no longer possible and the fiat leg will complete.

## Common pitfalls when generating code

- **Creating payment instructions on every withdrawal.** Reuse them. Store `paymentInstructionId` against the beneficiary in your database.
- **Treating `withdrawalOnchainInstruction` as optional.** It's the entire point of step 2. If it's missing, do not send stablecoins — poll or wait for the webhook.
- **Broadcasting the stablecoin transfer before persisting the transaction.** Save the Borderless transaction `id` and `withdrawalOnchainInstruction` to your database **before** broadcasting, so a crash mid-flight can be reconciled.
- **Forgetting the `fromAddress` guarantee.** If your wallet infrastructure can send from multiple addresses, pin the sender explicitly.
- **Not using `reference`.** The `reference` field surfaces in the transaction record and is useful for reconciliation against your own invoice or order IDs.

## Testing on sandbox

Sandbox base URL: `https://sandbox-api.borderless.xyz/v1`. Use sandbox PFI test accounts — don't send real stablecoins to sandbox deposit addresses. Status transitions are simulated; `Transaction_Updated` webhooks fire as expected.

## Reference implementation

See `/examples/withdrawal-usdc-to-us-ach/` in this repo for an implementation covering auth, payment instruction creation, withdrawal submission, polling for `withdrawalOnchainInstruction`, and the `onchain-guard.ts` safety check. The example intentionally **stops short of broadcasting** — you hand the validated `PlannedTransfer` to your wallet provider. Webhook-driven status reconciliation lives in the separate `/examples/webhooks/` example.

## Full reference

- Withdrawal endpoints: https://docs.borderless.xyz/llms.txt (search for `transaction-withdrawals` and `payment-instructions`)
- Quick-start walkthrough: https://docs.borderless.xyz/docs/quick-start-guide.md
