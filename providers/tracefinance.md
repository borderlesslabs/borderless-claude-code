# TraceFinance — integration notes

> Last verified: 2026-07 · Scope: provider-dependent unless noted. Routing is org-dependent — confirm with `GET /organizations/network?status=active`.

Corridors observed: **BR/PIX**.

## Compliance behavior

- **TraceFinance is a business-only (KYB) provider.** Personal identities are not supported — initiating a personal check returns `Personal identity is not supported for this option`. Design your TraceFinance integration around business identities; route consumer/end-user flows to a personal-capable provider.
- Business KYB is initiated per check (`POST /identities/{id}/compliance-checks/{slug}` with `idempotency-key`).
- **TraceFinance uses org-provided credentials that must be provisioned before its rails work.** Until they are in place, initiation returns `Provider credentials are invalid`. This is a one-time org setup, not a per-request condition.

## Sandbox notes

- A personal identity returns an empty `/requirements` (`{}`) — because the provider does not serve individuals, there is nothing to satisfy. Treat an empty personal `/requirements` here as "not applicable", and drive business identities only. *(sandbox-only)*
- New orgs need TraceFinance credentials provisioned before discovery and compliance work. Coordinate through support@borderless.xyz. *(org-dependent)*

## Message signatures

| Message | Meaning → next step |
|---|---|
| `Personal identity is not supported for this option. Please contact support team to clarify the reason` | TraceFinance is KYB-only → drive business identities; route individuals elsewhere |
| `Provider credentials are invalid` | Org credentials not yet provisioned → support@borderless.xyz |
