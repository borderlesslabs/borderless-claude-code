---
name: borderless-virtual-account-flow
description: Use when building or debugging Borderless virtual accounts — named bank accounts created in the identity's name with stable deposit instructions for recurring first-party funding (the end user transferring fiat from their own external accounts). Triggers on mentions of virtual accounts, named accounts, recurring deposits, or first-party funding in a Borderless context.
---

# Borderless Virtual Account Flow

A virtual account is a **named bank account** created by the PFI in the identity's name (sometimes called a "named account"). It keeps the **same deposit instructions** — routing number, account number, etc. — across many funding events, so the end user can move fiat from their own external accounts on a recurring basis without a `POST /deposits` call each time. Funds are auto-converted to the configured stablecoin and credited to the linked Borderless account.

**First-party only.** Virtual accounts are designed for deposits from accounts registered to the **same end user** as the identity that owns the VA. They do not generally accept deposits from third parties — funds sent by a different person or business may be rejected or held by the PFI. If you need third-party collection (one VA receiving from many senders), use the standard deposit flow with per-transaction reference messages.

**Prerequisites:** A compliant identity for the corridor + an account that already holds the target stablecoin asset. The asset must be added to the account **before** creating the virtual account.

## Virtual account vs. standard deposit

| | Standard `POST /deposits` | Virtual account |
|---|---|---|
| Bank details visible to the sender | Generic PFI omnibus account + unique reference code | Named account in the identity's name |
| Reference / memo required from sender | **Yes** — `depositMessage` is the attribution key | **No** — the account number itself is the identifier |
| Per-funding API call | `POST /deposits` for each | None — same instructions reused across all fundings |
| Per-funding transaction record | Created by your call | Created automatically when funds arrive |
| Sender model | One-time or third-party deposits supported | **First-party only** — same end user moving from their own external accounts |
| Best for | One-off transfers, third-party collection | Recurring first-party funding (e.g. end user repeatedly moving from their own bank to their Borderless account) |

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

Response is paginated:

```json
{ "data": [ { "id": "...", "status": "Active", "depositInstructions": [...] } ], "hasMore": false }
```

Iterate `data` and find the entry whose `id` matches the one returned at creation. Poll until its `status` flips from `NotActive` to `Active`. Sandbox typically activates in 5–20 seconds; production can be longer. If `hasMore` is true, paginate (cursor-based — see CLAUDE.md).

| Status | Meaning |
|---|---|
| `NotActive` | Provisioning. Poll. |
| `Active` | Ready. `depositInstructions` populated. |
| `Rejected` | Provisioning failed. Check `failureReason`. Cannot be retried — create a new VA after fixing the cause. |

**Common reasons for `Rejected`:**
- Compliance was not approved at the time of creation. (Compliance must be `Approved` / `PreApproved` first.)
- Identity address is in a region the PFI does not support for virtual accounts (e.g., certain US states).
- Identity is missing fields required for the dedicated-account product (often more strict than for one-off deposits).
- **The virtual-account product isn't enabled for your identity/org yet.** Some PFIs gate VAs separately from transactional compliance — an identity fully `Approved` for deposits and withdrawals can still see "Customer has not been approved for virtual bank accounts". This is an enablement step, not a compliance failure — coordinate through support@borderless.xyz.

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

- The account is in the **identity's** name (a "named account"), not the PFI's omnibus name. Surface this to the end user accurately — the sender must be the same person/entity, since these are first-party-only.
- There is **no `depositMessage`** / reference code. The account number is the identifier. Including a reference is harmless but unnecessary.
- Funds sent to this account auto-convert to the configured `asset` and credit the linked Borderless account.

**`VirtualAccountEntity` field caveat:** the entity carries both `depositInstructions` (the typed array shown above) and a deprecated `instructions` field (flatter snake_case shape, kept for backward compat). New code should read `depositInstructions`.

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

1. **First-party only.** Funds must come from accounts registered to the same end user as the identity that owns the VA. Third-party deposits (a different person or business sending money in) are not generally supported and may be rejected or held by the PFI.
2. **Add the asset to the account first.** Creating a VA against an asset the account doesn't hold fails immediately.
3. **Compliance must be approved before creation.** A VA created against an identity whose compliance later rejects can land in `Rejected` and is not recoverable — close it and create a fresh one.
4. **`Rejected` is terminal.** No retry on the same VA. Create a new one after fixing the underlying cause.
5. **Deletion is irreversible.** Closing a VA permanently invalidates the bank details. Any in-flight wires sent to a closed VA may be returned.

## Common pitfalls when generating code

- **Treating VAs as a per-customer attribution mechanism.** They're not. A VA belongs to one identity and is meant for that end user's own incoming transfers from their own external accounts. If you need per-vendor / per-customer / per-invoice attribution, use `POST /deposits` with reference messages, or create separate identities per counterparty.
- **Treating `depositInstructions` as guaranteed populated on creation.** It's empty until activation. Build the UI / end-user email around the polled-or-webhooked active state.
- **Generating a `depositMessage` to "be safe".** There is none for VAs. Don't surface a placeholder — confuses the sender, and a real bank may reject the wire.
- **Forgetting that VA deposits flow through the standard deposit lifecycle.** They emit `Transaction_Updated` webhooks just like `POST /deposits` did. If your dedupe / handling assumes only API-initiated deposits, VA traffic will surprise you.
- **Skipping the activation check before sharing bank details.** Surfacing a `NotActive` VA's empty details to the end user is an embarrassing UX failure. Wait for `Active`.
- **Letting the end user share VA details with third parties.** The PFI may reject inbound transfers whose sender doesn't match the identity name on file. Make the first-party-only constraint explicit in your UX.

## Testing on sandbox

Sandbox VAs activate in seconds (USD via Bridge is the most reliable). You cannot fund a sandbox VA with a real wire — sandbox PFIs simulate funding events; check the partner's sandbox tooling or trigger via support. Expect EUR/SEPA virtual accounts to be available where the corridor is configured for your org.

## Full reference

- Virtual account endpoints: https://docs.borderless.xyz/llms.txt (search for `virtual-accounts`)
- Standard deposit flow (use this for one-offs): `borderless-deposit-flow` skill
- Webhook handling for the auto-created deposits: `borderless-webhook-verifier` skill
