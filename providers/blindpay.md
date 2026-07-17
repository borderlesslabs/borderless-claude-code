# BlindPay — integration notes

> Last verified: 2026-07 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Corridors observed: **US/USD (ACH, Wire, RTP)**, **BR/PIX**, **MX/SPEI**, **CO/ACH**, **AR/ARS (Transfers30)**. Single settlement asset: **USDB_BASE** (USDB on Base).

## Withdrawals use a pull model — read first

**BlindPay withdrawals settle by pulling funds from the source wallet, so that wallet must first grant an on-chain ERC-20 `approve()` allowance to BlindPay.** Until the approval is signed, the withdrawal sits at status `Orchestrating` and never reaches a terminal state — the payment instruction is fine, nothing is wrong with your request, it is waiting on an unsigned approval.

- Inspect the transaction record: `withdrawalOnchainInstruction.type` is `Approval` — an unsigned ERC-20 `approve()` call (selector `0x095ea7b3`) targeting a BlindPay spender contract, from the account's wallet address. **The spender address, the source wallet address, and the approval calldata all come from the transaction record** — read them there, do not hardcode them.
- In a real integration, this is the moment the customer's own wallet (MetaMask, WalletConnect, etc.) signs the approval — BlindPay is a customer-owned-credential, non-custodial provider. Once the allowance exists on-chain, BlindPay can pull and the withdrawal progresses.
- **Practical consequence:** withdrawal-direction testing needs a wallet whose key you can sign with. A shared, non-custodial placeholder test wallet has no signer and will leave every withdrawal stuck at `Orchestrating` *(org-dependent — coordinate the test-wallet setup with support@borderless.xyz)*. Deposits are unaffected: they require no client-side signing.

## Account setup

- **Add USDB_BASE to the account before any discovery or quote call for BlindPay resolves:** `POST /accounts/{accountId}/assets`. Without the asset present, BlindPay does not surface on discovery. USDB_BASE is EVM (Base) — use a standard EVM address.

## Compliance behavior

- One compliance profile (`BlindPay_base`) covers deposit, withdrawal, and virtual accounts across every currency and method — no per-rail compliance gating observed.
- **Personal KYC approves cleanly** and personal identities can transact: accept the BlindPay ToS (per identity, single-use link), upload a `Selfie`, and use a real phone number. A fictional `555`-prefixed number is rejected as `invalid_phone_number`, and a `ProofOfAddress` with a valid `subType` satisfies the proof-of-address requirement.
- **KYB is not yet drivable via the API.** Business initiation requires owner tax-type data (SSN vs ITIN for US owners) that has no corresponding field in the Borderless identity API today — `taxIdType`/`taxType` are both rejected, and the owner object carries no tax field. The same initiation also asks for the owner's proof-of-address document type. Until owner tax-type is expressible, run BlindPay on a personal identity and coordinate KYB enablement with support@borderless.xyz *(org-dependent)*.

## Payment instruction notes

- **US ACH / Wire / RTP require `recipientRelationship` in `details`.** Omitting it lets the PI *create* (client-side schema does not require it) but the withdrawal then fails at the PFI: `paymentInstruction.recipient_relationship … received null`. Supply the value in **space-separated casing** — `"first party"`, not `"first_party"`. The PFI error message shows underscore casing, but the Borderless schema accepts only the space-separated enum: `first party, employee, independent contractor, vendor or supplier, subsidiary or affiliate, merchant or partner, customer, landlord, family, other`. Deposits do not need this field.
- **US Wire needs `bankAccountType`** (Checking/Savings), same as ACH — omitting it returns a `422`.
- **`POST /deposits` requires an explicit `paymentMethod` in the body**, and does **not** accept `paymentPurpose` (sending it returns `paymentPurpose should not exist`). Withdrawals infer the method from the PI.
- **`paymentPurpose` is lowercase** on withdrawals — `"other"`, not `"Other"`.
- **BR/PIX:** `{identifierType, identifierValue, address}` — no `bankName` field.
- **MX/SPEI and CO/ACH both require `bankSlug`** (`allInstitutionsSupported:false`). Slugs are provider-specific opaque hashes, not human-readable bank codes. Call `/deposits/institutions` or `/withdrawals/institutions?...&pfiName=BlindPay` to get **BlindPay's own** slug list — do not reuse another provider's slug for the same bank.
- **AR/ARS (Transfers30):** base shape matches COELSA (`bankName`, `accountHolderName`, `bankAccountNumber` = 22-digit CBU, `bankAccountType`, `address`; no `bankSlug`). It also requires **`bankAccountNumberType`** set to match your account number — `CVU`, `CBU`, or `ALIAS`. This field is functionally required even though client-side validation does not force it: without it the withdrawal fails at the PFI with `paymentInstruction.transfersType: Required`, which names a field that does not exist in the Borderless schema. Do not try to send `transfersType`/`transferType` directly (both return `should not exist`) — set `bankAccountNumberType` instead.

## Limits

Transaction bands observed (fiat side):

- **US/USD:** 10.00 – 10,000.00 USD
- **BR/BRL:** 51.15 – 51,154.00 BRL
- **MX/MXN:** 174.13 – 174,130.00 MXN
- **CO/COP:** 32,130.00 – 32,130,000.00 COP
- **AR/ARS:** 15,564.90 – 15,564,900.00 ARS

## Message signatures

| Message | Meaning → next step |
|---|---|
| `paymentInstruction.recipient_relationship … received null` | Add `recipientRelationship` to the US PI, space-separated casing (`"first party"`) |
| `must be one of the following values: first party, employee, …` | Use space-separated enum casing, not the underscore form the PFI error implies |
| `bankAccountType should not be null or undefined` | US Wire needs `bankAccountType` (Checking/Savings), same as ACH |
| `paymentPurpose should not exist` (on deposits) | Deposits take `paymentMethod`, not `paymentPurpose` |
| `quote.payment_method: Required` (RTP deposit) | Known RTP deposit-direction quote-construction issue — ACH/Wire deposits work; coordinate with support@borderless.xyz |
| `paymentInstruction.transfersType: Required` (AR/Transfers30) | Set `bankAccountNumberType` (CVU/CBU/ALIAS) to match the account number |
| `transfersType should not exist` / `transferType should not exist` | Don't send it directly — use `bankAccountNumberType` |
| Withdrawal stuck at `Orchestrating`, `withdrawalOnchainInstruction.type: Approval` | Source wallet must sign the ERC-20 `approve()` to BlindPay's spender before funds can be pulled |

## Sandbox notes

- **Deposits auto-complete** (Submitted → Pending → Completed in ~20–30s); `instructions` populate at the Pending step. Verified on US/ACH, US/Wire, BR/PIX, MX/SPEI.
- USD deposit instructions name an underlying USD rail partner's beneficiary details. Treat these as sandbox values, not necessarily representative of production.
- **US/RTP deposit** returned `quote.payment_method: Required` from the PFI across repeated attempts, while ACH and Wire deposits with the identical request shape completed — the RTP deposit-direction quote appears to omit the method field. RTP *withdrawal* is unaffected. Coordinate with support@borderless.xyz.
- `pfiName=BlindPay` pinning held on every discovery, quote, PI, and transaction call — no rerouting to the org default once pinned.
