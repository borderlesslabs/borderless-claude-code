# Finity — integration notes

> Last verified: 2026-07 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Corridors observed: **CO (PSE)**. A single-corridor provider in the observations so far — Colombian peso payouts over PSE.

## Compliance behavior

- **`PreApproved`** — no ToS, no initiation loop. A personal identity approves once a supported ID document is on file (see Identity requirements). Coverage under `Finity_base` includes `Withdrawal / PSE / COP / CO` across USDC and USDT on the major chains.
- Finity uses org-provided credentials (`finityCredentials`); these are configured during org provisioning.

## Identity requirements

- Personal KYC needs one of `NationalId` or `ResidencePermit` on the identity, plus the org's Finity credentials. Upload the document (`PUT /identities/{id}/documents`) and the check resolves to `PreApproved` — no separate initiation needed.

## Payment instruction notes

- **CO/PSE requires a `bankSlug`.** Discovery returns `allInstitutionsSupported:false` for Finity/PSE, and the slug is provider-specific — pull Finity's own value from `GET /withdrawals/institutions?...&pfiName=Finity` rather than reusing a slug (or a null-slug PI) built for another provider. A PI carrying `bankSlug: null`, or another provider's slug, will not validate against Finity.
- Standard bank shape otherwise: `bankSlug`, `bankName`, `accountHolderName`, `bankAccountNumber`, `bankAccountType`, `address`. Creation succeeds first try (`201`) with this shape.
- **Withdrawal `paymentPurpose`** comes from the closed enum shared across the API; `other` (lowercase) is accepted as a safe default.

## Limits

- Deposit/withdrawal minimum observed: **5,000 COP**. Quotes return a realistic exchange rate (≈4,175 COP/USDC at 2026-07 sandbox rates). Withdrawal `amount` is in source-asset units (e.g. USDC).

## Sandbox notes

- **`Orchestrating` is a distinct, non-terminal transaction status** — separate from `Submitted` / `Pending` / `Processing` / `Completed` / `Failed`. A withdrawal has been observed sitting in `Orchestrating` with a static `updatedAt` (no movement across repeated polls over several minutes) and `failureReason: null`. Because it never flips to `Failed`, the usual "re-poll past `Failed`" heuristic doesn't apply — there's nothing to re-poll past.
- Treat an `Orchestrating` transaction whose `updatedAt` hasn't advanced across multiple poll cycles as stuck, not merely slow. This looks like a sandbox completion-simulation gap rather than anything client-fixable — if a withdrawal stays in `Orchestrating` past a few minutes, flag it to support@borderless.xyz with the transaction ID. *(Sandbox.)*
