# Prompt: audit my Borderless integration

Copy the prompt below into a Claude Code session running in the project you want reviewed. The `borderless-integration-reviewer` subagent must be installed (either directly cloned from the toolbox repo or via `/borderless-install-into`).

---

Audit my Borderless integration against the hard rules. Use the `borderless-integration-reviewer` subagent; do not review the code yourself.

Point the subagent at these directories / files specifically:

- **Borderless client / auth:** {e.g., `src/lib/borderless/`, `app/services/borderless/`, `internal/borderless/`}
- **Flow orchestrators:** {e.g., `src/jobs/compliance.ts`, `src/services/deposit.ts`, `src/services/withdrawal.ts`}
- **Webhook handler:** {e.g., `src/routes/webhooks/borderless.ts`, `app/controllers/webhooks_controller.rb`}
- **Database schema for webhook dedupe:** {e.g., `migrations/2026_02_create_borderless_events.sql`}
- **Env / config:** {e.g., `src/config.ts`, `.env.example`}
- **Any tests that exercise the flows:** {e.g., `tests/borderless/`}

If I haven't listed a directory the reviewer should also look at, stop and ask — don't scan the whole repo.

## What I want flagged

Use the reviewer's default priority order:

1. Fund-safety issues (withdrawal `fromAddress` mismatches, sending before persisting, asset/chain mismatches, quote-as-settlement).
2. Security issues (webhook signature handling, leaked secrets or PII, hardcoded prod creds).
3. Compliance correctness (requirements check, ToS flow, `NotStarted` handling, doc re-uploads).
4. Idempotency (missing keys, generated-per-retry, webhook dedupe on event id).
5. Amount handling (float arithmetic, string compares, unit mixing).
6. Auth & environment (token refresh, sandbox/prod mixing, base URLs).
7. Resilience (`instructions: null` handling, ordering assumptions, blocking inside webhook 200).

## Output

Single report in the reviewer's standard format — Critical / High / Medium / Low / Nits, each finding with file:lines, issue, impact, fix. End with an ordered list of the 3–5 to address first.

Do not edit anything. This is a report only.

If any finding depends on runtime behavior I haven't given you (e.g., "is this retried from a queue on failure?"), list it separately as "needs confirmation" rather than assuming.
