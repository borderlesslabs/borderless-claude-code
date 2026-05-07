---
description: Scan the project for Borderless integration anti-patterns (missing idempotency keys, hardcoded URLs, unverified webhooks, float amounts, leaked secrets).
---

Audit this project's Borderless integration for common anti-patterns. For each finding, report the file path, line range, the specific issue, and a concrete fix.

**What to look for:**

1. **Hardcoded base URLs.** Any literal `api.borderless.xyz` (production) in code. Flag. A hardcoded `sandbox-api.borderless.xyz` is acceptable in example / test tooling when the file carries a clear comment that the module is sandbox-only; otherwise flag it too.

2. **Missing idempotency keys** on mutating POST / PUT requests to Borderless endpoints. The following paths should always carry an `idempotency-key` header:
   - `POST /identities/personal`, `POST /identities/business`
   - `PUT /identities/{id}/documents`
   - `POST /identities/{id}/compliance-checks/{slug}`
   - `POST /accounts`, `POST /accounts/{id}/assets`
   - `POST /deposits`, `POST /withdrawals`
   - `POST /identities/{id}/payment-instructions`

3. **Unverified webhook handlers.** Any Borderless webhook endpoint that parses the body without first verifying the `x-signature` header against the organization's RSA public key. Also flag handlers that JSON-parse the body before verifying (signature is over raw bytes).

4. **Webhook handlers without idempotency.** Handlers that process events without deduping on the event `id` — risk double-processing on retry.

5. **Float amount arithmetic.** Any use of native `Number` / `float` / `double` for fields named `amount`, `fromAmount`, `toAmount`, `fee`, `exchangeRate`. Should be a decimal type.

6. **Leaked secrets.** Any occurrence of `clientSecret`, `accessToken`, `imageFront`, `imageBack`, `taxId`, or full identity payloads in log calls (`console.log`, `logger.info`, `print`, etc.).

7. **Access token reuse without refresh.** Auth helpers that call `/auth/m2m/token` on every request (wasteful) or never refresh (will 401 after ~23 hours, the typical token lifetime — confirm against the `expiresIn` returned by the auth endpoint, do not hardcode).

8. **Quote-as-settlement.** Code that persists or displays `toAmount` from `/deposits/quotes` or `/withdrawals/quotes` as a final settlement amount. Quotes are estimates.

9. **Withdrawal `fromAddress` mismatches.** Code that sends stablecoins from a different address than the one declared on the account or returned in `withdrawalOnchainInstruction.fromAddress`.

10. **Treating `Transaction_Updated` as ordered.** Switch statements or state machines that assume events arrive in a specific order.

11. **Mixed sandbox / production config.** Env setups that allow production `clientId` + sandbox `BORDERLESS_BASE_URL` (or vice versa) without a guardrail.

**Output format:**

Group findings by severity (Critical / High / Medium / Low). For each:

```
[SEVERITY] {short title}
  File: path/to/file.ts:42-58
  Issue: {one-sentence description}
  Fix: {concrete suggestion, with code if helpful}
```

End with a summary count and a suggestion for which to fix first.

**Do not rewrite code automatically.** Report only. The user decides what to act on.
