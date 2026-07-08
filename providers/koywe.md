# Koywe — integration notes

> Last verified: 2026-02 · Scope: provider-dependent unless noted. Routing is org-dependent and corridors can move between PFIs over time — confirm with `GET /organizations/network?status=active` before assuming any of this applies to your org.

Corridors observed: **AR (COELSA)**, **CO (PSE)**, CL, PE.

Koywe runs some of the most thorough data validation in the network — real local tax-ID formats, exact account-number formats, and destination-account ownership verification. That rigor is a feature: a payout that passes Koywe validation is a payout going to the right person. It does mean sandbox test data has to be realistic. Details below.

## Compliance behavior

- Compliance is initiated per slug (`POST /identities/{id}/compliance-checks/{slug}` with `idempotency-key`); approves in sandbox once identity data passes validation.
- **Identity `address.country` must match the withdrawal destination country.** A Colombian identity can't originate an Argentina payout — the transaction reports "country code does not match". Plan **one identity per Koywe-served country**.

## Identity requirements

- **Tax IDs are validated against real local formats:**
  - Argentina: CUIT with a valid **mod-11 check digit** (11 digits; prefixes 20/23/24/27 individuals, 30/33/34 businesses). Fabricated digits won't pass — compute a valid check digit for test data.
  - Colombia: NIT format.
- Document `issuingCountry` should match the identity's `address.country`.

## Payment instruction notes

- **`bankSlug` AND `bankAccountType` are both required** for AR/COELSA and CO/PSE. Missing slug → "bankCode is required"; missing type → "accountType is required and must be one of: checking,savings,interbanking". Send `Checking`/`Savings` (PascalCase) — Borderless translates.
- **AR account numbers are a 22-digit CBU/CVU**, exactly.
- **Destination-account ownership is verified**: the CBU must belong to the tax-ID holder — a strong protection against misdirected payouts. Fabricated sandbox data won't pass this check by design; request PFI-issued test credentials through support@borderless.xyz for end-to-end AR/CO sandbox testing.

## Message signatures

| Message | Meaning → next step |
|---|---|
| `identity.document.idNumber: format is invalid: CUIT-…` | Tax ID needs a valid mod-11 check digit |
| `Account number must be 22 digits long (CBU or CVU)` | Use the exact 22-digit AR format |
| `country code does not match` | Identity country ≠ destination → separate identity per country |
| `accountType is required and must be one of: checking,savings,interbanking` | Add `bankAccountType` to PI details |
| `Failed to validate if bank account … belongs to …` | Ownership verification vs test data → request test credentials via support |
