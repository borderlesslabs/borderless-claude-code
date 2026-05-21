# borderless-claude-code

A Claude Code workspace for building against the [Borderless](https://borderless.xyz) stablecoin payments API. Clone it, run `/borderless-onboard`, and you'll have a working sandbox transaction in your dashboard in about 15 minutes.

This repo is both your first-run sandbox and a permanent toolbox — skills, slash commands, reference examples, and prompt templates you keep using as you build your integration.

## Prerequisites

- Node 20+ on your machine.
- [Claude Code](https://claude.com/claude-code) installed and authenticated.
- **Borderless sandbox client ID and secret.** Available on the Developers tab within your Borderless dashboard.
- **Your sandbox org is provisioned to your project's scope.** Borderless configures the PFIs and corridors for your account before handover — you don't set them up yourself. To extend scope or adjust configuration, work with your Borderless contact.

## Quick start

```bash
git clone https://github.com/borderlesslabs/borderless-claude-code.git
cd borderless-claude-code
claude
```

Then, inside Claude Code:

```
/borderless-onboard
```

You'll have a live sandbox deposit visible in the [Borderless sandbox dashboard](https://sandbox-dashboard.borderless.xyz) by the end.

## Your first run — what `/borderless-onboard` does

Seven steps, driven by Claude. You answer a few yes/no questions; Claude does the API calls.

1. **Environment check** — creates `.env` if missing, prompts for `BORDERLESS_CLIENT_ID` and `BORDERLESS_CLIENT_SECRET`.
2. **Authenticate** — `POST /auth/m2m/token`. Proves your credentials before anything else.
3. **Pick a corridor** — a `{country, fiat, asset, paymentMethod}` tuple. Claude proposes a default based on what your org has configured; change it to any of the other options. Run `/borderless-coverage` to see the full list.
4. **Identity + compliance** — creates a Personal identity with placeholder PII, discovers the compliance slug for the corridor, handles Terms-of-Service acceptance if the partner requires it, starts the KYC check, polls to terminal.
5. **Account** — creates a Standalone account with the corridor's stablecoin attached. (Production wallets — Fireblocks, Utila, Dfns — swap in via their own account-creation flows.)
6. **Deposit** — shows a quote, creates the deposit, polls until the returned payment instructions populate, prints them verbatim for the originator.
7. **Persist state** — writes IDs to `.borderless-onboard.json` so you can resume idempotently if anything times out.

In sandbox, deposits auto-reconcile without real fiat — the transaction walks through `Submitted → Pending → Processing → Completed` on its own over a few minutes. Check the [sandbox dashboard](https://sandbox-dashboard.borderless.xyz) to see it land.

## See what corridors are configured — `/borderless-coverage`

Your sandbox org is provisioned to match the scope of your project — the corridors, fiats, and stablecoins your team needs. `/borderless-coverage` reads the live API and shows exactly what's configured: countries, fiats, payment rails, stablecoins, and whether each corridor supports deposits, withdrawals, or both.

Pass a country code to drill down: `/borderless-coverage US`, `/borderless-coverage BR`, etc.

### Sample output

Output reflects your org's configured scope — number of rows depends on how many corridors your team is using.

```
Borderless coverage on this org
  Deposits:     8 corridors across 3 countries
  Withdrawals:  14 corridors across 5 countries

Countries:
  BR  BRL  PIX            [D/W]  USDC_ETHEREUM, USDC_POLYGON
  CO  COP  PSE            [  W]  USDC_ETHEREUM, USDC_POLYGON
  MX  MXN  SPEI           [D/W]  USDC_ETHEREUM, USDC_POLYGON
  US  USD  ACH            [D/W]  USDC_BASE, USDC_ETHEREUM, USDC_POLYGON
  US  USD  Wire           [D/W]  USDC_BASE, USDC_ETHEREUM, USDC_POLYGON

Legend: D = deposit supported, W = withdrawal supported
```

Flag column tells you at a glance: `[D/W]` = both directions, `[D  ]` = deposit-only, `[  W]` = withdrawal-only.

## Flows covered

The toolbox auto-loads context for the six core Borderless flows. Each has a dedicated skill under `.claude/skills/` that Claude reads when you ask about that area — so prompts like *"add a payout to PIX"* or *"set up a recurring USDC funding account"* trigger the right context automatically.

| Flow | When to use | Skill |
|---|---|---|
| **Compliance** | Onboard a personal or business identity, run KYC/KYB for a corridor, handle ToS acceptance, upload documents | `borderless-compliance-flow` |
| **Deposit** (on-ramp) | One-off fiat → stablecoin transfers via ACH, Wire, PIX, SPEI, etc. | `borderless-deposit-flow` |
| **Withdrawal** (off-ramp) | Stablecoin → fiat to a customer's bank account. Includes the per-corridor `details` table covering 18+ corridors and the seven `details` DTO variants | `borderless-withdrawal-flow` |
| **Virtual accounts** | Named bank accounts created in the identity's name with stable deposit instructions for recurring first-party funding — the end user moves fiat from their own external accounts on a recurring basis without a per-deposit API call. First-party only; not for third-party collection. | `borderless-virtual-account-flow` |
| **Webhooks** | Signed event delivery: signature verification (TS/Python/Go), idempotency on event `id`, auto-disable handling, the `WebhookEventEntity` delivery log | `borderless-webhook-verifier` |

Operational reference content lives under `cookbook/`: the **error catalog** (every common sync 4xx and async PFI failure mapped to cause and fix, plus the full `TransactionStatus` and `ComplianceStatus` enums), the **sandbox-to-production checklist**, **reconciliation** (including the `/reconciliation/items` and `/orphaned-transactions` endpoints), webhook replay, amount-handling rules, and local compliance testing.

## Typical customer workflow

1. **Prove everything works: `/borderless-onboard`.** One command, ~15 minutes, takes you from zero credentials to a completed sandbox deposit. See the walkthrough above.
2. **Map the terrain: `/borderless-coverage`.** See every corridor your org has configured. Pick the one your product needs. If something you need isn't listed, email `support@borderless.xyz`.
3. **Fork an example.** The five runnable projects under `examples/` chain in order — `compliance-personal/` → `account-setup/` → `deposit-us-ach-to-usdc/` → `withdrawal-usdc-to-us-ach/`, plus a standalone `webhooks/` Express handler. Each has a `FORK HERE` comment on the corridor constant — change it to match your chosen corridor and you're off.
4. **Move the toolbox into your app: `/borderless-install-into <path>`.** When you're ready to build the real integration, this command copies `CLAUDE.md`, the skills, and the flow commands into your own codebase. Claude then has the Borderless guardrails and mental model baked into every session you run inside your project. The runnable examples stay here in this repo as reference.
5. **Audit before you ship: `/borderless-lint` and the `borderless-integration-reviewer` agent.** The lint command sweeps for the common anti-patterns (missing idempotency keys, hardcoded URLs, unverified webhook handlers, float arithmetic on amounts, leaked secrets). The reviewer agent does a Borderless-specific PR audit prioritized for fund-safety and webhook-verification issues — invoke it on your branch before merging anything that touches payments.
6. **Cut over to production.** Walk `cookbook/sandbox-to-production.md` end-to-end before flipping credentials — endpoints are identical between sandbox and production, but compliance, document validation, transaction limits, and PFI routing all change. When something fails in production, `cookbook/error-catalog.md` maps every common sync error and async `pfiErrorMessage` to its cause and fix.

## What's in the repo

- `.claude/skills/` — five flow skills (compliance, deposit, withdrawal, virtual accounts, webhooks) that Claude auto-loads when relevant. The withdrawal skill includes a per-corridor table of required and forbidden payment-instruction fields plus the seven `details` DTO variants the API accepts.
- `.claude/commands/` — slash commands: `/borderless-onboard`, `/borderless-coverage`, `/borderless-scaffold`, `/borderless-lint`, `/borderless-test-webhook`, `/borderless-install-into`.
- `.claude/agents/borderless-integration-reviewer.md` — a reviewer subagent you invoke for PR audits.
- `examples/` — five runnable TypeScript references that chain: `compliance-personal/` → `account-setup/` → `deposit-us-ach-to-usdc/` → `withdrawal-usdc-to-us-ach/`, plus a standalone `webhooks/` Express handler. Each prints the env-var values the next step needs.
- `cookbook/` — short guides for post-onboarding situations: amount handling, the error catalog (sync + async PFI failures, full status enums), reconciliation (including the `/reconciliation/items` and `/orphaned-transactions` endpoints), sandbox-to-production checklist, compliance testing, webhook replay.
- `prompts/` — copy-paste prompt templates for larger tasks (build an integration in your stack, audit your integration, migrate from another vendor).
- `CLAUDE.md` — the workspace context Claude reads on every session. Covers base URLs, auth, the Identity → Compliance → Account → Transaction mental model, and hard rules.
- `CUSTOMIZE.md` — what to edit, what to leave alone, what to delete.
- `.mcp.json` — MCP server config so Claude can fetch docs pages on demand.

## Trying without Claude Code

Each project under `examples/` is a standalone TypeScript app you can run directly:

```bash
cd examples/compliance-personal
cp .env.example .env         # fill in BORDERLESS_CLIENT_ID + BORDERLESS_CLIENT_SECRET
npm install
npm run compliance
```

The examples are sandbox-only — the base URL is hardcoded to `https://sandbox-api.borderless.xyz/v1`. The skill docs under `.claude/skills/*/SKILL.md` are readable as standalone references for each flow.

The full API reference lives at [docs.borderless.xyz](https://docs.borderless.xyz). Append `.md` to any page URL for a Markdown version (e.g. `/docs/quick-start-guide.md`). There's also an [llms.txt index](https://docs.borderless.xyz/llms.txt) of every docs page.

## Support

- Docs: https://docs.borderless.xyz
- Email: support@borderless.xyz
- Sandbox dashboard: https://sandbox-dashboard.borderless.xyz
