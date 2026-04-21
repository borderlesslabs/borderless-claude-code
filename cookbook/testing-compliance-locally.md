# Testing compliance locally

Sandbox compliance is **not real KYC**. It simulates the state machine but doesn't actually validate documents, verify identity, or enforce real regulatory rules. This is great for fast iteration, confusing if you're expecting production behavior.

## What sandbox actually does

- **Completes quickly.** Typically seconds to a few minutes. Real KYC takes hours; real KYB takes days. Sandbox compresses both.
- **Accepts any valid document image.** A 200×200 PNG of a solid color passes. No OCR, no face match, no address verification.
- **Simulates the state transitions.** You get `Transaction_Updated` and `IdentityComplianceCheck_Updated` webhooks at realistic-looking cadences. Enough to exercise your handler code paths.
- **Does not enforce PFI-specific ToS.** Some PFIs require the end user to visit a `metadata.tosLink` and accept in production. On sandbox this is usually short-circuited; check `metadata.hasAcceptedTos` behavior against the specific PFI you're testing.

## Edge cases you need to exercise

Sandbox happy-path completes in one call. Your production flow needs to survive rejections, RFIs, and ToS friction. Force those paths using the test-webhook command:

```
/borderless-test-webhook
```

Pick `IdentityComplianceCheck_Updated`, then pick a terminal status of `Rejected` (or `InProgress` with `rejectionReasons` populated, or `Completed` but with `incompleteReasons`). The command generates a signed payload you `curl` at your local handler. Now you're testing your UI path, not just the happy path.

Cases worth scripting:

- `Rejected` with `rejectionReasons: ["Identity verification failed"]` — your UI should surface the rejection and re-prompt.
- `InProgress` stuck with `missingFields: ["address.postalCode"]` — your UI should patch the identity and resubmit.
- `IdentityComplianceCheck_Updated` arriving before `IdentityComplianceCheck_Completed` — your handler should tolerate both orderings.
- Duplicate delivery of the same event `id` — your dedupe should skip the second.

## What sandbox will not teach you

- **Real rejection reasons.** PFIs use their own language. You'll see placeholder strings in sandbox. Production copy is what your UI will actually render — fetch a few from the docs or a real PFI and hardcode them as test inputs.
- **RFI latency.** Real RFIs come back 24–48 hours later via manual PFI review. Sandbox will never actually block you for a day. If your UX depends on the RFI timing being weeks-long, test against production.
- **PFI-specific document requirements.** `GET /identities/{id}/compliance-checks/{slug}/requirements` returns the *declared* requirements. Sandbox accepts the placeholder docs regardless. Production will reject a 200×200 solid-color PNG.

Before a production cutover, run through the compliance flow once with a real document on at least one PFI. Sandbox tells you nothing about OCR quality.
