# Kotanipay — integration notes

> Last verified: 2026-07 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Kotanipay brings African mobile-money and bank coverage. Compliance behavior is verified below; the payment rails were not yet exercisable on the tested sandbox org (see Feature enablement), so PI shapes and limits are not yet documented. Confirm provisioning with support@borderless.xyz before building against this provider.

## Compliance behavior

- **`PreApproved`** for the identity types tested — a US business (KYB) and a US personal identity (KYC) both self-approved with a complete profile, no ToS and no document uploads beyond a complete identity. Compliance was never the bottleneck.

## Corridors advertised

These corridors surfaced for Kotanipay in discovery on the tested org. They were not exercised end-to-end (rails were not yet provisioned — see below), so treat this as a coverage map to confirm against live discovery, not as verified execution.

- **EFT:** ZA/ZAR.
- **MobileMoney:** XOF zone (BJ, CI, SN), ZM/ZMW, CD/CDF, CM/XAF, GH/GHS, KE/KES, MW/MWK, RW/RWF, TZ/TZS, UG/UGX.

## Feature enablement (org-level)

- **Kotanipay provider connectivity is enabled per org during provisioning.** On the tested sandbox org it was not yet configured, so every discovery/quote call scoped to Kotanipay returned unavailable (`available: false`, `error: "Invalid API Key"`, `unavailableReason: "Other"`), and `/withdrawals/institutions` scoped to Kotanipay returned a `400`. The same calls unscoped, or scoped to other PFIs, succeeded normally in the same response — so this is an org-level enablement item, not an API-contract or auth problem on your side. Coordinate enablement with support@borderless.xyz before building. *(org-dependent)*
- Because the block occurs at the discovery/quote step — before any PI or transaction exists — there is nothing to poll or retry client-side until provisioning is confirmed.

## Payment instruction notes

- **Not yet documented.** No PI, deposit, or withdrawal was created on the tested org because provisioning blocked the flow ahead of the PI step. This section will be filled in once rails are exercised on a provisioned org.

## Message signatures

| Message | Meaning → next step |
|---|---|
| Kotanipay entry in a quote array with `available: false`, `error: "Invalid API Key"`, `unavailableReason: "Other"` | Kotanipay connectivity not yet provisioned on your org → support@borderless.xyz |
| `{"message":"Invalid API Key","error":"Bad Request","statusCode":400}` on `/withdrawals/institutions?...&pfiName=Kotanipay` | Same — provider not yet provisioned on your org → support@borderless.xyz |

## Sandbox notes

- **Assets:** this provider's `assetOptions` include `CUSD_CELO` and `USDC_CELO` alongside the standard EVM / SOL / TRON set. CELO is EVM-compatible, so an existing EVM account address covers it — add the asset with `POST /accounts/{id}/assets` if it isn't already on the account, once the provider is provisioned.
- **Debugging, not routing:** don't branch integration logic on `pfiName`. On several of the advertised corridors, live default routing on the tested org steered to other PFIs — expected, and orthogonal to whether Kotanipay is provisioned. When a record names Kotanipay and a quote comes back unavailable, check provisioning first.
