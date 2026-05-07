---
name: borderless-virtual-account-flow
description: Use when building or debugging Borderless virtual accounts — dedicated, named bank accounts that automatically convert any incoming fiat into stablecoin without a per-deposit API call. Triggers on mentions of virtual accounts, dedicated bank accounts, recurring deposits, payroll funding, treasury auto-conversion, or named accounts in a Borderless context.
---

# Borderless Virtual Account Flow

A virtual account is a **dedicated, named bank account** provisioned by the PFI in your business's name. Any fiat sent to it is automatically converted into the configured stablecoin and credited to the linked Borderless account — no per-funding `POST /deposits` call required.

Use this when you need recurring deposits, per-customer funding addresses, or treasury auto-conversion. For one-time or infrequent deposits, the standard deposit flow (`borderless-deposit-flow`) is simpler.

**Prerequisites:** A compliant identity for the corridor + an account that already holds the target stablecoin asset. The asset must be added to the account **before** creating the virtual account.

## Virtual account vs. standard deposit

| | Standard `POST /deposits` | Virtual account |
|---|---|---|
| Bank details visible to the originator | Generic PFI omnibus account + unique reference code | Dedicated account in your business name |
| Reference / memo required from sender | **Yes** — `depositMessage` is the attribution key | **No** — the account number itself attributes the funds |
| Per-funding API call | `POST /deposits` for each | None — fund as many times as you want |
| Per-funding transaction record | Created by your call | Created automatically when funds arrive |
| Best for | One-off transfers | Recurring funding, per-customer accounts, payroll, treasury |

## The flow

```
0. Pre-check: identity is compliant, account exists with target asset attached
1. Create virtual account        → POST /accounts/{accountId}/virtual-accounts   → returns id, status: NotActive
2. Poll for activation           → GET  /accounts/{accountId}/virtual-accounts   → wait for Active + depositInstructions
3. Surface bank details to sender → out-of-band                                   (no reference code needed)
4. Funds arrive → auto-conversion → webhook: Transaction_Updated                  (Deposit transaction with virtualAccountId)
```

## 1. Create the virtual account

```bash
POST /accounts/{accountId}/virtual-accounts
Headers:
  Authorization: Bearer {accessToken}
  Content-Type: application/json
  idempotency-key: {uuid}
Body:
{
  "fiat": "USD",
  "country": "US",
  "asset": "USDC_ETHEREUM",          // must already be attached to the account
  "counterPartyIdentityId": "...",   // optional — defaults to the account's identity
  "developerFeePercent": "0.5"       // optional — your markup
}
```

The asset specified here must already be on the account. If it isn't, you'll get "Couldn't find asset in account" — add it first via `POST /accounts/{accountId}/assets`.

**Initial response:** `status: NotActive` with empty `depositInstructions`. Provisioning is asynchronous — the PFI needs to create the underlying account on its side.

## 2. Poll for activation

```bash
GET /accounts/{accountId}/virtual-accounts
```

Poll until the relevant entry's `status` flips from `NotActive` to `Active`. Sandbox typically activates in 5–20 seconds; production can be longer.

| Status | Meaning |
|---|---|
| `NotActive` | Provisioning. Poll. |
| `Active` | Ready. `depositInstructions` populated. |
| `Rejected` | Provisioning failed. Check `failureReason`. Cannot be retried — create a new VA after fixing the cause. |

**Common reasons for `Rejected`:**
- Compliance was not approved at the time of creation. (Compliance must be `Approved` / `PreApproved` first.)
- Identity address is in a region the PFI does not support for virtual accounts (e.g., certain US states).
- Identity is missing fields required for the dedicated-account product (often more strict than for one-off deposits).

## 3. Use the deposit instructions

When `Active`, `depositInstructions` is an array — one entry per supported rail. For US/USD it usually carries both ACH and Wire details:

```json
{
  "depositInstructions": [
    {
      "paymentMethod": "ACH",
      "details": {
        "bankAccountNumber": "2865227390",
        "bankRoutingNumber": "101019644",
        "bankBeneficiaryName": "Your Business Name",
        "bankBeneficiaryAddress": "...",
        "bankName": "...",
        "bankAddress": "..."
      }
    },
    {
      "paymentMethod": "Wire",
      "details": { "...same shape..." }
    }
  ]
}
```

**Critical differences from a standard deposit's `depositInstruction`:**

- The account is in **your** name, not the PFI's omnibus name. Surface this to the sender accurately.
- There is **no `depositMessage`** / reference code. The account number is the attribution key. Including a reference is harmless but unnecessary.
- Funds sent to this account auto-convert to the configured `asset` and credit the linked Borderless account.

## 4. Monitor incoming funds

Each incoming wire / ACH / etc. creates a `Deposit` transaction automatically. The transaction carries a `virtualAccountId` field referencing the VA that received it.

Two ways to track:

- **Webhook (recommended):** subscribe to `Transaction_Updated`. Filter by `data.type == "Deposit"` and `data.virtualAccountId == "{vaId}"`.
- **Polling:** `GET /transactions` filtered by the linked account, then check `virtualAccountId`.

The transaction lifecycle is the same as a standard deposit (`Submitted → Verifying → Orchestrating → Pending → Processing → Completed`).

## Lifecycle summary

```
POST /accounts/{id}/virtual-accounts        → Create (NotActive)
GET  /accounts/{id}/virtual-accounts        → Poll until Active
[sender wires fiat to the bank details]     → Funds auto-convert to stablecoin
[Transaction_Updated webhook fires]         → Deposit appears with virtualAccountId
DELETE /accounts/{accountId}/virtual-accounts/{vaId}  → Close (irreversible)
```

## Hard rules

1. **Add the asset to the account first.** Creating a VA against an asset the account doesn't hold fails immediately.
2. **Compliance must be approved before creation.** A VA created against an identity whose compliance later rejects can land in `Rejected` and is not recoverable — close it and create a fresh one.
3. **Never reuse the bank details across customers.** Each customer / use case should get its own VA. The whole point is per-purpose attribution.
4. **`Rejected` is terminal.** No retry on the same VA. Create a new one after fixing the underlying cause.
5. **Deletion is irreversible.** Closing a VA permanently invalidates the bank details. Any in-flight wires sent to a closed VA may be returned.

## Common pitfalls when generating code

- **Treating `depositInstructions` as guaranteed populated on creation.** It's empty until activation. Build the UI / customer email around the polled-or-webhooked active state.
- **Generating a `depositMessage` to "be safe".** There is none for VAs. Don't surface a placeholder — confuses the sender, and a real bank may reject the wire.
- **One VA per identity.** It's not the model. You can create many VAs per account, scoped by `counterPartyIdentityId`. Use this to give each customer / vendor / payroll batch its own funding address.
- **Forgetting that VA deposits flow through the standard deposit lifecycle.** They emit `Transaction_Updated` webhooks just like `POST /deposits` did. If your dedupe / handling assumes only API-initiated deposits, VA traffic will surprise you.
- **Skipping the activation check before sharing bank details.** Surfacing a `NotActive` VA's empty details to a customer is an embarrassing UX failure. Wait for `Active`.

## Testing on sandbox

Sandbox VAs activate in seconds (USD via Bridge is the most reliable). You cannot fund a sandbox VA with a real wire — sandbox PFIs simulate funding events; check the partner's sandbox tooling or trigger via support. Expect EUR/SEPA virtual accounts to be available where the corridor is configured for your org.

## Full reference

- Virtual account endpoints: https://docs.borderless.xyz/llms.txt (search for `virtual-accounts`)
- Standard deposit flow (use this for one-offs): `borderless-deposit-flow` skill
- Webhook handling for the auto-created deposits: `borderless-webhook-verifier` skill
