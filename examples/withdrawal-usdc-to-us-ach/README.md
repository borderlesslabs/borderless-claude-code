# Withdrawal: USDC on Polygon → US ACH

A minimal, runnable example of the Borderless withdrawal (off-ramp) flow in TypeScript. The client sends USDC on Polygon on-chain; USD lands in the destination bank account via ACH.

## What this covers

- OAuth 2.0 access-token fetching with caching + refresh.
- Idempotency-key generation per logical operation.
- Payment instruction creation (with env-var reuse once you've created one).
- Withdrawal quote (estimate-only).
- Withdrawal creation, capturing the on-chain instruction.
- `src/onchain-guard.ts` — the safety check that validates `fromAddress`, `amount`, `toAddress`, and asset+chain all match `withdrawalOnchainInstruction` **before** broadcasting. Any withdrawal code in your own app must call this.

The example **stops short of actually broadcasting the stablecoin transfer**. Broadcasting requires access to a wallet's signing keys (Fireblocks, Utila, Dfns, your own Standalone key, etc.) which is out of scope here. The example's last step prints what a downstream broadcaster would send.

## Prerequisites

- Node 20+.
- A Borderless sandbox client ID and secret.
- An identity that has passed compliance for `{country: US, asset: USDC_POLYGON, fiat: USD, paymentMethod: ACH, type: Withdrawal}`. Run `../compliance-personal/` (set `type: 'Withdrawal'` in its corridor constant) to produce one.
- An account linked to that identity, holding `USDC_POLYGON`, with a known `fromAddress`. Run `../account-setup/` to produce one; that example also prints the confirmed `fromAddress` to set here.

## Setup

```bash
cp .env.example .env
# fill in BORDERLESS_CLIENT_ID, BORDERLESS_CLIENT_SECRET, BORDERLESS_IDENTITY_ID,
# BORDERLESS_ACCOUNT_ID, BORDERLESS_FROM_ADDRESS
npm install
npm run withdrawal
```

## Files

- `src/auth.ts` — access-token cache + refresh.
- `src/client.ts` — thin HTTP wrapper with idempotency-key injection.
- `src/payment-instruction.ts` — creates (or reuses) a US/USD/ACH payment instruction.
- `src/onchain-guard.ts` — validates the planned transfer matches `withdrawalOnchainInstruction`. **Lost stablecoins are not refundable. Always call this before broadcasting.**
- `src/withdrawal.ts` — end-to-end withdrawal orchestration.
- `src/index.ts` — entrypoint.

## The flow

1. Fetch / refresh access token.
2. Create a payment instruction (or reuse one from `BORDERLESS_PAYMENT_INSTRUCTION_ID` if set).
3. `GET /withdrawals/quotes` with the corridor + amount → estimate.
4. `POST /withdrawals` with idempotency key and required `paymentPurpose`. Response includes `withdrawalOnchainInstruction` (`toAddress`, `fromAddress`, `amount`, `asset`) — **usually `null` at creation**; the example polls `GET /transactions/{id}` until it populates.
5. Build the planned on-chain transfer from the account's `fromAddress` + declared amount + PFI's `toAddress` + corridor asset.
6. Call `assertWithdrawalOnchainMatch` — if anything mismatches, throw and stop.
7. **(Stops here.)** In your real integration, hand the validated transfer to your wallet provider to sign and broadcast. Then poll `GET /transactions/{id}` or listen for `Transaction_Updated` until `status === 'Completed'`.

## Hard rules reflected in this code

- Decimal amounts never go through `Number`. Uses `decimal.js`.
- Access token is cached with `expiresIn`.
- Every `POST` carries a persisted `idempotency-key` so retries are safe.
- `onchain-guard.ts` throws on any mismatch — amount (decimal compare), addresses (lowercased compare for EVM), asset+chain string match.
- Sandbox base URL is hardcoded in `src/client.ts` and `src/auth.ts` — this example is sandbox-only.
- Secrets come from env only. No PII or credentials in logs.

## Hard rules the caller must still honor

The example stops before broadcasting, but when you wire up a real wallet:

- **Send from the exact `fromAddress`** declared on the account. If your wallet infrastructure can send from multiple addresses, pin the sender explicitly.
- **Send the exact amount** — dust differences cause PFI reconciliation failures.
- **Send on the exact chain** — `USDC_POLYGON` ≠ `USDC_BASE` ≠ `USDC_ETHEREUM`.
- **Persist the Borderless transaction `id` and `withdrawalOnchainInstruction` before broadcasting.** If your process crashes mid-flight, you need the record to reconcile from.

These are enforced by `onchain-guard.ts` on the input side and by the `borderless-integration-reviewer` agent at code-review time.
