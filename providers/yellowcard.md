# Yellow Card — integration notes

> Last verified: 2026-06 · Scope: provider-dependent unless noted. Routing is org-dependent — NGN has been observed routing through different PFIs on different orgs. Confirm with `GET /organizations/network?status=active`.

Corridors observed: **NG/NGN (BankTransfer)**, **ZA/ZAR (EFT)**, other African corridors. Yellow Card brings licensed coverage across a wide set of African markets.

## Compliance behavior

- **`PreApproved` for foreign business identities** — e.g. a US business offramping to NGN transacts with no additional documents.
- **Local residents follow local KYC requirements:** an NG-resident *personal* identity requires **`BVN_NG`** (Bank Verification Number) and **`NationalId`** documents — the local regulatory standard. The `requirements` endpoint surfaces this per identity; query it per identity rather than generalizing from the business identity's requirements.

## Payment instruction notes

- **`bankSlug` is required** (`allInstitutionsSupported: false`). Slugs are provider-specific: after any routing change on a corridor, re-run `/withdrawals/institutions` and recreate the PI with the fresh slug — a slug minted under a different PFI returns "Invalid bank code".
- Method is `BankTransfer` (not `NIP`).

## Feature enablement (org-level)

- **Omnibus configuration is set up per org** during provisioning. Until it's in place, withdrawals report **"Yellowcard omnibus not configured for organization"** — coordinate with support@borderless.xyz; it's an org-setup item, not an integration issue.

## Limits

- **~$3,164 USD per transaction** on NGN (the same cap also appears denominated as 30M NGN). Keep sandbox test amounts at ≤3,000 USDC.

## Sandbox notes

- **"Failed to assign address for payment: address unavailable"** means sandbox deposit-address provisioning isn't enabled for your org's configuration. It appears regardless of amount or asset choice, so don't spend time varying your payload — ask support@borderless.xyz to check provisioning.
- `partner rate does not exist for local and crypto currencies` — the asset/currency pair isn't enabled on the routed configuration; try the corridor's other listed assets or confirm with support.

## Message signatures

| Message | Meaning → next step |
|---|---|
| `No bankSlug found for payment instruction` | PI created without a slug → discover + recreate PI |
| `Invalid bank code` | Slug minted under a different PFI → re-discover |
| `Yellowcard omnibus not configured for organization` | Org provisioning → support@borderless.xyz |
| `amount must be less than 3164 USD` | Per-txn cap → reduce amount |
| `Failed to assign address for payment: address unavailable` | Sandbox address provisioning → support@borderless.xyz |
