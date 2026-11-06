# Account setup: Standalone + asset

A minimal, runnable example that creates a Standalone account for an existing identity and attaches a stablecoin asset. This is the second prerequisite for the deposit and withdrawal examples (compliance is the first — see `../compliance-personal/`).

## What this covers

- `POST /accounts` with type Standalone — customer-managed wallet. The **customer provides the onchain address** at create time; Borderless does not generate one.
- Reading back the per-asset address confirmation from the account response.
- Reporting the identifiers the downstream examples need: `BORDERLESS_ACCOUNT_ID` and `BORDERLESS_FROM_ADDRESS`.

## What Standalone means

Standalone is Borderless's "bring your own wallet" account type. You tell Borderless the address you'll send from (for withdrawals) and where stablecoins should land (for deposits). Borderless doesn't custody or sign — you use whatever wallet infrastructure you already have. In production most integrations swap Standalone for Fireblocks, Utila, Dfns, or Circle — but Standalone is the fastest way to validate end-to-end flows without a wallet-provider setup.

**Security note:** The address you pass is public metadata. Never pass a private key or seed phrase here or anywhere else.

## Prerequisites

- Node 20+.
- A Borderless sandbox client ID and secret.
- An identity that has passed compliance for your target corridor. See `../compliance-personal/`.
- An onchain address you control on the target chain (for `USDC_POLYGON`, that's any Polygon / EVM address). For sandbox, you can generate a throwaway:
  ```bash
  # If you have foundry:
  cast wallet new

  # Otherwise, any random 20-byte hex prefixed with 0x works for sandbox testing:
  printf '0x%s\n' "$(openssl rand -hex 20)"
  ```
  For production withdrawals you need an address you can actually sign transactions from.

## Setup

```bash
cp .env.example .env
# fill in BORDERLESS_CLIENT_ID, BORDERLESS_CLIENT_SECRET, BORDERLESS_IDENTITY_ID,
# BORDERLESS_STANDALONE_ADDRESS
npm install
npm run account
```

## Files

- `src/auth.ts` — access-token cache + refresh.
- `src/client.ts` — thin HTTP wrapper with idempotency-key injection.
- `src/index.ts` — single-file orchestrator.

## The flow

1. Fetch / refresh access token.
2. `POST /accounts` with `{ name, identityId, assets: [{ asset, address }] }`. Response confirms the per-asset address.
3. Print the new `accountId` and the confirmed `fromAddress`.

## Adding more assets later

`POST /accounts/{id}/assets` adds an asset to an existing account. The body shape is the same per-asset object (`{ asset, address }` for Standalone). This example creates the account with a single asset; to add more after the fact, re-run with a different `ASSET` value **or** use `/borderless-scaffold` to generate the addition-call code in your own project.

## Hard rules reflected in this code

- Every mutating call carries a persisted `idempotency-key`.
- The address the customer passes is the `fromAddress` for withdrawals. `onchain-guard.ts` in the withdrawal example compares against exactly this value. Sending from a different address results in lost funds the PFI can't recover.
- Sandbox base URL is hardcoded in `src/client.ts` and `src/auth.ts` — this example is sandbox-only.
- No PII or credentials in logs.

## Next

Once this prints `BORDERLESS_ACCOUNT_ID` and `BORDERLESS_FROM_ADDRESS`, set both in:

- `../deposit-us-ach-to-usdc/.env` (needs `BORDERLESS_ACCOUNT_ID`).
- `../withdrawal-usdc-to-us-ach/.env` (needs `BORDERLESS_ACCOUNT_ID` **and** `BORDERLESS_FROM_ADDRESS`).

Then run either example.
