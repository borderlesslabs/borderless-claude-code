---
name: borderless-withdrawal-flow
description: Use when building or debugging a Borderless withdrawal (offramp) flow — converting stablecoins into local fiat currency. Covers payment instruction creation, withdrawal transaction submission, and the onchain stablecoin transfer to the PFI. Triggers on mentions of withdrawals, offramp, stablecoin-to-fiat, pay-out, payouts, or sending fiat to a bank account via a Borderless integration.
---

# Borderless Withdrawal Flow (Offramp)

A withdrawal converts stablecoin → local fiat. The client sends stablecoins onchain to the PFI's deposit address. The PFI then sends local fiat to a bank account specified by a **Payment Instruction** that you create up front.

This has **one more step than a deposit** because you must tell the PFI where the fiat should land.

**Prerequisites:** A compliant identity for the corridor + an account holding the source stablecoin. See `borderless-compliance-flow`.

## The flow

```
0. Discover the corridor          → GET  /withdrawals/options + /withdrawals/institutions   (run before building the PI)
(optional) Get quote              → GET  /withdrawals/quotes
1. Create payment instruction     → POST /identities/{id}/payment-instructions   → returns paymentInstructionId
2. Create withdrawal              → POST /withdrawals                             → returns onchain instructions (deposit address)
3. Send stablecoin onchain       → out-of-band, from the account's wallet       (exact amount, exact fromAddress, exact toAddress)
4. PFI releases fiat              → webhook: Transaction_Updated → status: Completed
```

## 0. Discover the corridor first

**Always discover before creating a payment instruction.** Never hardcode payment methods, bank slugs, or asset identifiers — they vary by corridor and the PFI behind a corridor can change without notice.

Two calls — neither is optional:

```bash
GET /withdrawals/options?country={CC}
GET /withdrawals/institutions?country={CC}&fiat={CCY}&paymentMethod={METHOD}
```

`options` takes only `country=` as a query param — `fiat`, `method`, and `asset` come back as fields on each response item. (Note: it's `method`, not `paymentMethod`, on options items.) Filter client-side to the corridor you're targeting. Empty array (or no items matching your `{fiat, method}`) = corridor not configured for your org. `institutions` returns:

```json
{
  "allInstitutionsSupported": false,
  "institutionIdentifier": "bankSlug",
  "supportedInstitutions": [
    { "name": "BANCO GALICIA", "slug": "gOLB1gcN-Xbq..." }
  ]
}
```

Two fields decide what your PI must contain:

- **`institutionIdentifier`** — names the field your PI's `details` must include to identify the bank. Observed values: `bankSlug`, `bankCode` (deprecated alias, still returned for some corridors), `bankRoutingNumber`, `swiftOrBicNumber`, `bankName`, `identifierValue` (PIX), `brebKey` (Bre-B Colombia). May also be `null` for corridors that don't use a bank-level identifier — e.g. AE/NPSS, IN/IMPS_FIRC, AU/BECS, MX/SPEI, EU/SEPA all return `null` here on a typical org because the addressing field (`iban`, CLABE in `bankAccountNumber`, `localRoutingCode`) does the routing instead. The same corridor through a different PFI may switch this.
- **`allInstitutionsSupported`** — `true` means any valid value for that identifier works (or, when `institutionIdentifier` is `null`, that no bank-level identifier is needed at all); `false` means you MUST pick from `supportedInstitutions` and use the `slug` value (typically the `bankSlug` field).

**Never cache bank slugs.** They are PFI-specific and become invalid the moment routing changes. Discover at runtime.

**Options ≠ availability.** `/options` reflects every ramp config on the org — including providers that are currently **inactive**. An asset or corridor appearing there is not proof a live provider serves it. Validate against `GET /organizations/network?status=active` (the authoritative capability read) and confirm with a quote before building against it. Full endpoint ladder: `cookbook/discovery.md`.



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

The `details` shape is a `oneOf` over **seven** DTO variants — the API picks the variant based on `country` + `paymentMethod`. Each variant has its own required and forbidden fields. Get them wrong and you'll either 422 at PI creation or fail asynchronously after the withdrawal is submitted.

**The seven `details` variants:**

| Variant | Used by | Distinguishing field |
|---|---|---|
| `USDetailsCreateDto` | US/ACH, US/Wire | `bankRoutingNumber` (ABA) + `bankAccountType` |
| `BankDetailsCreateDto` | Most other corridors (UK, MX, NG, LATAM, JP, etc.) | `bankSlug`, `bankAccountNumber`, optionally `localRoutingCode` |
| `IbanBankDetailsIbanCreateDto` | AE/NPSS, PK/IBFT | `iban` |
| `IdentifierDetailsCreateDto` | BR/PIX | `identifierType` + `identifierValue` |
| `BrebKeyDetailsCreateDto` | CO/Bre-B | `brebKey` |
| `SepaDetailsCreateDto` | EU/SEPA | `bankAccountNumber` (full IBAN) + `swiftOrBicNumber` + `accountOwnerType` |
| `MobileMoneyDetailsCreateDto` | Mobile-money corridors (KE, GH, NG, etc. via MobileMoney method) | `phone` + `networkSlug` |

Use `GET /withdrawals/institutions` (step 0) to discover the right `institutionIdentifier`. The table below is a working snapshot; treat the live discovery response as authoritative.

**Capture `id` from the response** — this is the `paymentInstructionId` for step 2.

Payment instructions can be reused for repeat payouts to the same beneficiary. Persist them; don't re-create on every transaction. **Exception — tainted PIs:** if a withdrawal against a PI fails on the PFI side, retries against the same PI can come back with a generic "Validation error from PFI" even after you fix the upstream issue. When recovering from a failed withdrawal, create a fresh PI and reference the new `paymentInstructionId`.

### Payment instruction `details` by corridor

The required and forbidden field sets differ by country and method. Forbidden fields produce 422 at PI creation; missing required fields often pass PI creation but fail the withdrawal asynchronously with a `pfiErrorMessage`.

> The table below is a working snapshot drawn from observed integration behavior. The Borderless docs cover the most common corridors (US, UK, EU, BR, MX) explicitly; the long-tail corridors (AE/NPSS, IN/IMPS_FIRC, AU/BECS, etc.) are validated empirically and may shift if PFI routing changes. Always treat the live `/withdrawals/institutions` response as authoritative for the `institutionIdentifier` field, and the PFI's async `pfiErrorMessage` as authoritative for required fields you may have missed. A machine-readable version of this table lives at `data/corridors.json` (update both together); per-provider behavior notes live under `providers/`.

| Country / Method | Required `details` | Forbidden | Notes |
|---|---|---|---|
| **US / ACH** | `bankName`, `accountHolderName`, `bankAccountNumber`, `bankRoutingNumber`, `bankAccountType`, `address` | — | `bankAccountType` is `Checking` or `Savings`. |
| **US / Wire** | `bankName`, `accountHolderName`, `bankAccountNumber`, `bankRoutingNumber`, `address` | — | |
| **GB / BankTransfer** | `bankName`, `accountHolderName`, `bankAccountNumber`, `address` | `sortCode`, `iban` | UK uses `bankAccountNumber` only. |
| **EU / SEPA** | `bankName`, `accountHolderName`, `bankAccountNumber` (must hold the **full IBAN**), `swiftOrBicNumber`, `accountOwnerType`, `address`. `businessName` if `accountOwnerType` is `Business`. | `iban` | Field requirements differ across PFIs. The `iban` field name is rejected on some routes; carry the IBAN in `bankAccountNumber`. A bare account number passes PI creation but fails async with "bankAccountNumber is invalid". |
| **BR / PIX** | `identifierType`, `identifierValue` | `bankName`, `accountHolderName`, `bankAccountNumber` | PIX is identifier-based. `identifierType` is `Email` / `CPF` / `CNPJ` / `PhoneNumber` / `EVP` (per `PaymentInstructionIdentifierType` enum). The `address` field is **deprecated** for PIX in the spec; do not include it. |
| **AR / COELSA** | `bankSlug` (or whatever discovery returns), `bankName`, `accountHolderName`, `bankAccountNumber` (22-digit CBU/CVU), `bankAccountNumberType` (enum: `CBU` / `CVU` / `ALIAS`), `address` | — | `bankAccountNumberType` is the AR-specific field — distinct from `bankAccountType` (Checking/Savings). Some PFIs strict-validate the CUIT (mod-11) on the identity and require `address.country == "AR"`. On some orgs the corridor returns `institutionIdentifier: "bankName"` with `allInstitutionsSupported: true` (no slug list at all) — discovery is authoritative. |
| **CO / PSE** | `bankName`, `accountHolderName`, `bankAccountNumber`, `bankAccountType`, `address`, plus `bankCode` **or** `bankSlug` (per discovery) | — | Use whichever the `institutionIdentifier` says. Some PFIs require `address.country == "CO"`. **`bankCode` is deprecated** in the spec but still returned by discovery on this corridor — use it when discovery says so. |
| **CO / Bre-B** | `brebKey` | — | New CO corridor with its own `BrebKeyDetailsCreateDto` — only the Bre-B key value, no other bank fields. |
| **MX / SPEI** | `bankName`, `accountHolderName`, `bankAccountNumber` (18-digit CLABE), `address` | — | The 18-digit CLABE goes in `bankAccountNumber`. |
| **NG / BankTransfer** | `bankSlug`, `bankName`, `accountHolderName`, `bankAccountNumber`, `address` | — | Discover the slug — provider-specific and not interchangeable across PFIs. Some PFIs cap per-transaction value (~$3,164 USD equiv). |
| **AE / NPSS** | `iban`, `address` | `bankName`, `accountHolderName`, `bankAccountNumber` | One of the few corridors where the `iban` field name is correct. |
| **EG / BankTransfer** | `bankSlug`, `iban`, `address` | `bankName`, `accountHolderName`, `bankAccountNumber` | IBAN-only shape like AE/NPSS, plus the discovered `bankSlug`. |
| **TR / EFT** | `bankSlug`, `bankName`, `accountHolderName`, `bankAccountNumber` (Turkish IBAN), `address` | — | ~100,000 TRY per-transaction cap — and `amount` is in source-asset units (≈2,900 USDC at 2026-06 rates), so convert before checking. |
| **IN / IMPS_FIRC** | `bankAccountNumber`, `localRoutingCode` (IFSC), `bankName`, `accountHolderName`, `address` | `bankCode` (silently ignored), `localRoutingNumber` (rejected) | Withdrawals here also need a `documents: [{ type: "Invoice", content: "..." }]` on the withdrawal call (see step 2). `localRoutingCode` is accepted on creation but not echoed back in GET responses. |
| **PH / BankTransfer** | `bankSlug`, `bankName`, `accountHolderName`, `bankAccountNumber`, `address` | — | For e-wallets like GCash, the `bankAccountNumber` is the phone number. Discover the GCash slug. |
| **ZA / EFT** | `bankSlug`, `bankName`, `accountHolderName`, `bankAccountNumber`, `address` | — | Method is `EFT`, not `BankTransfer`. |
| **PK / IBFT** | `bankSlug`, `iban`, `address` | `bankName`, `accountHolderName`, `bankAccountNumber` | IBAN format `PK36ABPL...`. |
| **CA / EFT** | `bankSlug`, `bankName`, `accountHolderName`, `bankAccountNumber`, `localRoutingCode` (transit number `XXX-XXXXX` or `XXXXX-XXX`), `address` | `transitNumber` | The Canadian transit number lives in `localRoutingCode`, not `transitNumber`. |
| **AU / BECS** | `accountHolderName`, `bankAccountNumber`, `localRoutingCode` (6-digit BSB), `address` | `bsbNumber` | The BSB number lives in `localRoutingCode`. |
| **JP / BankTransfer** | `bankSlug`, `bankName`, `accountHolderName`, `bankAccountNumber`, `address`, plus the routing identifier returned by discovery (`XXXX-XXX` — 4-digit bank, 3-digit branch) | — | The spec marks the standalone `bankCode` field as deprecated, but JP routing still flows through whichever field discovery names. Trust `institutionIdentifier` from `/withdrawals/institutions` and put the `XXXX-XXX` value there. Wrong format fails async. |
| **TH / BankTransfer**, **ID / BankTransfer**, **SG / BankTransfer**, **KE / BankTransfer**, **GH / BankTransfer**, **BD / BankTransfer** | `bankSlug`, `bankName`, `accountHolderName`, `bankAccountNumber`, `address` | — | Standard slug-based. **GH withdrawals also require an Invoice document** on the withdrawal call (see step 2). |
| **MobileMoney corridors** (KE, GH, NG, etc. when method is `MobileMoney`) | `phone`, `accountHolderName`, optionally `networkSlug` | — | Mobile-money is its own DTO (`MobileMoneyDetailsCreateDto`). `networkProvider` is deprecated — use `networkSlug` discovered at runtime. |

### Field-naming traps that bite

- **`street1`, not `addressLine1` / `address1`.** The first address line is always `street1`. Other names 422.
- **The `iban` field is corridor-specific.** `iban` is accepted only on AE/NPSS and PK/IBFT (and possibly other routes per discovery). On EU/SEPA the IBAN goes in `bankAccountNumber`. On most other corridors, `iban` is rejected outright.
- **`localRoutingCode` is the catch-all routing field.** Per the spec it's required for `BECS, FPS, IMPS_FIRC, EFT, TED`, and holds country-specific identifiers — BSB (AU), transit (CA), IFSC (IN), branch code, sort code, etc. The provider-native names (`bsbNumber`, `transitNumber`, `ifscCode`) are rejected at PI creation. JP/BankTransfer is not in the spec's `localRoutingCode` list — its routing identifier is named by discovery.
- **Deprecated bank-detail fields (avoid for new integrations):** `bankCode`, `phone`, `taxId` are all marked deprecated on `BankDetailsCreateDto`. They still work (and discovery may still return `bankCode` as the `institutionIdentifier`), but new code should rely on `bankSlug` / `localRoutingCode` / `swiftOrBicNumber` and discovery.
- **Async PFI errors quote the provider's field name** ("bank.bsbNumber is required", "bank.transitNumber is required") even though the Borderless field is different. Translate before retrying.
- **`bankCode` vs. `bankSlug`.** Both can be the value of `institutionIdentifier`. Always use the field name that discovery returned, not the one you remember.
- **Invoice-required corridors fail async, not sync.** If `country` is `IN` / `GH` / `CN` (or `BR` over 50,000 BRL), include `documents: [{ type: "Invoice", content: "data:image/jpeg;base64,..." }]` in the **withdrawal** request (step 2). Without it, PI and withdrawal both submit, then the transaction fails with "please upload an invoice…".

## 2. Create the withdrawal

```bash
POST /withdrawals
Headers:
  Authorization: Bearer {accessToken}
  Content-Type: application/json
  idempotency-key: {uuid}
Body:
{
  "asset": "USDC_POLYGON",
  "amount": "100.00",                       // in SOURCE-ASSET units (100 USDC), not destination fiat
  "accountId": "{sourceAccountId}",
  "paymentInstructionId": "{fromStep1}",
  "paymentPurpose": "personal remittance",  // REQUIRED. Enum — see list below.
  "developerFee": "5.00",                   // optional, your markup
  "purposeDescription": "Monthly...",       // optional
  "reference": "INV-2025-001",              // optional, echoed back in the transaction
  "refundAddress": "0x...",                 // optional crypto address for refunds if the withdrawal fails or is rejected
  "counterPartyIdentityId": "...",          // optional — defaults to the PI's identity
  "documents": [                            // REQUIRED for IN, GH, CN, and BR ≥ 50,000 BRL
    { "type": "Invoice", "content": "data:image/jpeg;base64,..." }
  ]
  // NOTE: fiat and country are DEPRECATED on this body — Borderless resolves
  // both from the payment instruction. Older code may still send them; the API
  // accepts and ignores. New integrations should omit.
}
```

The `documents` array is required for invoice-corridor withdrawals (India, Ghana, China, and Brazil over 50,000 BRL). Supported formats: JPEG / PNG / PDF, base64 data URI, min 200×200 px, max 5 MB. Skipping it does not 422 — the withdrawal submits, then transitions to `Failed` with "please upload an invoice…".

**`refundAddress`** is the crypto address Borderless will return funds to if the withdrawal fails or is rejected after you've broadcast the onchain transfer. Defaults to the same address you sent from. Worth setting explicitly when your wallet infrastructure can spend from multiple addresses but you want refunds to a single sweep account.

**`amount` is denominated in the source asset** (USDC/USDT), not the destination fiat. Per-corridor caps are usually expressed in fiat (e.g. 100,000 TRY, 30M NGN) or USD-equivalent — convert via a quote before comparing, and expect the cap error to quote either denomination.

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

## 3. Send stablecoins onchain

Transfer the stablecoins from the account's wallet to `withdrawalOnchainInstruction.toAddress`.

**Three things must match exactly** — PFIs reconcile on all three:

1. **`amount`** — exact amount, in the correct decimal precision for the stablecoin.
2. **`fromAddress`** — the address you declared in the account. Sending from a different wallet can result in **lost funds with no refund**.
3. **`toAddress`** — the PFI's receiving address and network as returned in the instructions. Sending USDC on Ethereum to a Polygon address = lost funds.

The `asset` field encodes the network (`USDC_POLYGON`, `USDC_BASE`, `USDT_TRON`, etc.). Match both the token and the chain.

## 4. PFI releases fiat

Once the PFI detects the onchain transfer and reconciles all three fields above, it issues the fiat payment per the payment instruction. The transaction status progresses to `Completed`.

`txHash` on the transaction record is an **array of strings** (`txHash: string[]`) — not a single hash. It's empty at creation and populates with the hash(es) of **your** stablecoin transfer after it lands onchain; most flows end with one entry, but some (e.g., ERC-20 approve + transfer) add more than one.

## Lifecycle summary

Typical progression: `Submitted` → `Verifying` → `Orchestrating` → `Pending` → `Processing` → `Completed`.

The full `TransactionStatus` enum is: `Submitted`, `Verifying`, `Orchestrating`, `Pending`, `Processing`, `Completed`, `Failed`, `Cancelled`, `Refunded`.

| Status | Meaning |
|---|---|
| `Submitted` | Order received by Borderless and queued for processing. |
| `Verifying` | PFI KYC review in progress (only on PFIs that require it). |
| `Orchestrating` | Borderless is selecting the PFI and preparing execution data. |
| `Pending` | Awaiting action from the sender — `withdrawalOnchainInstruction` is usually populated in this state and the caller is expected to broadcast the stablecoin transfer. |
| `Processing` | Stablecoin transfer received onchain and reconciled; fiat payout in flight. |
| `Completed` | Fiat delivered to the payment instruction's bank. Terminal. |
| `Failed` | See `failureReason.details[].pfiErrorMessage`. Terminal. |
| `Cancelled` | Cancelled by the caller or by the PFI. Terminal. |
| `Refunded` | Stablecoins returned to `refundAddress` (or original sender) after a post-broadcast failure on the fiat leg. Terminal. |

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

Only works from non-terminal early states (`Submitted`, `Verifying`, `Orchestrating`, `Pending`). Critically: once you broadcast the onchain stablecoin transfer — even if the transaction is still in `Pending` — the PFI will reconcile and progress to `Processing`, after which cancellation is no longer possible and the fiat leg will complete.

## Common pitfalls when generating code

- **Creating payment instructions on every withdrawal.** Reuse them. Store `paymentInstructionId` against the beneficiary in your database.
- **Treating `withdrawalOnchainInstruction` as optional.** It's the entire point of step 2. If it's missing, do not send stablecoins — poll or wait for the webhook.
- **Broadcasting the stablecoin transfer before persisting the transaction.** Save the Borderless transaction `id` and `withdrawalOnchainInstruction` to your database **before** broadcasting, so a crash mid-flight can be reconciled.
- **Forgetting the `fromAddress` guarantee.** If your wallet infrastructure can send from multiple addresses, pin the sender explicitly.
- **Not using `reference`.** The `reference` field surfaces in the transaction record and is useful for reconciliation against your own invoice or order IDs.

## Testing on sandbox

Sandbox base URL: `https://sandbox-api.borderless.xyz/v1`. Use sandbox PFI test accounts — don't send real stablecoins to sandbox deposit addresses. Status transitions are simulated; `Transaction_Updated` webhooks fire as expected.

Two habits that save time:

- **Sandbox can simulate terminal outcomes on demand** — specific transaction amounts trigger `Completed`, `Failed`, and `Refunded` paths so you can exercise failure handling without engineering a real failure. See [Testing in Sandbox](https://docs.borderless.xyz/docs/sandbox-testing.md) for the trigger amounts.
- **`Submitted` is not success.** Poll `GET /transactions/{id}` (or subscribe to webhooks) until a terminal status — corridors fail asynchronously with the real cause in `failureReason.details[].pfiErrorMessage`.

## Reference implementation

See `/examples/withdrawal-usdc-to-us-ach/` in this repo for an implementation covering auth, payment instruction creation, withdrawal submission, polling for `withdrawalOnchainInstruction`, and the `onchain-guard.ts` safety check. The example intentionally **stops short of broadcasting** — you hand the validated `PlannedTransfer` to your wallet provider. Webhook-driven status reconciliation lives in the separate `/examples/webhooks/` example.

## Full reference

- Withdrawal endpoints: https://docs.borderless.xyz/llms.txt (search for `transaction-withdrawals` and `payment-instructions`)
- Quick-start walkthrough: https://docs.borderless.xyz/docs/quick-start-guide.md
