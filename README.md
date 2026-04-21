# borderless-claude-code

A Claude Code workspace for building against the [Borderless](https://borderless.xyz) stablecoin payments API. Clone it, run `/borderless-onboard`, and you'll have a working sandbox transaction in your dashboard in about 15 minutes.

This repo is both your first-run sandbox and a permanent toolbox — skills, commands, reference examples, and prompt templates you keep using as you build your integration.

## Get started

```bash
git clone https://github.com/borderless-xyz/borderless-claude-code.git
cd borderless-claude-code
claude
```

Then, inside Claude Code:

```
/borderless-onboard
```

That command authenticates against sandbox, creates an identity, runs compliance, creates an account, and submits a real deposit. You will see the transaction in the [Borderless sandbox dashboard](https://sandbox-dashboard.borderless.xyz) when it's done.

## Prerequisites

- Node 20+ on your machine.
- [Claude Code](https://claude.com/claude-code) installed and authenticated.
- **Borderless sandbox client ID and secret.** You should have received these at onboarding. If not, ask your Borderless contact or email `support@borderless.xyz`.
- **Your sandbox org comes pre-configured with PFI coverage.** Borderless provisions PFIs server-side before your sandbox account is handed over — you don't configure them yourself. Run `/borderless-coverage` to see exactly which countries, fiats, payment methods, and assets are available. If a corridor you need isn't listed, contact support@borderless.xyz.

`/borderless-onboard` checks all of this and prompts for anything missing.

## What's in the repo

- `.claude/skills/` — four flow skills (compliance, deposit, withdrawal, webhooks) that Claude auto-loads when relevant.
- `.claude/commands/` — slash commands including `/borderless-onboard`, `/borderless-scaffold`, `/borderless-lint`, `/borderless-coverage`, `/borderless-test-webhook`, `/borderless-install-into`.
- `.claude/agents/borderless-integration-reviewer.md` — a reviewer subagent you invoke for PR audits.
- `examples/` — five runnable TypeScript references that chain: `compliance-personal/` → `account-setup/` → `deposit-us-ach-to-usdc/` → `withdrawal-usdc-to-us-ach/`, plus a standalone `webhooks/` Express handler. Each prints the env-var values the next step needs. Fork whichever one matches your integration.
- `cookbook/` — short guides for post-onboarding situations (reconciliation, webhook replay, compliance testing, amount handling).
- `prompts/` — copy-paste prompt templates for larger tasks (build an integration in your stack, audit your integration, migrate from another vendor).
- `CLAUDE.md` — the workspace context Claude reads on every session. Covers base URLs, auth, the Identity → Compliance → Account → Transaction mental model, and hard rules.
- `CUSTOMIZE.md` — what to edit, what to leave alone, what to delete.
- `.mcp.json` — MCP server config so Claude can fetch docs pages on demand.

## After your first sandbox call

You have two paths, and most customers do both:

1. **Keep prototyping in this repo.** The `examples/` directory is where you explore corridors, try different PFIs, and build out the flows you need. Each example has a `FORK HERE` comment on the corridor constant — change it to match a corridor your organization has configured.

2. **Install the toolbox into your own app.** Run `/borderless-install-into <path>` and it copies `CLAUDE.md`, the skills, the flow commands, and the MCP config into your project. The runnable examples stay here in the toolbox as reference. Now your own codebase has the Borderless guardrails and context baked in.

## Not using Claude Code?

The repo is still useful without it. Each example under `examples/` is a standalone TypeScript project — `cd` in, `cp .env.example .env`, fill in your credentials, `npm install`, `npm run <script>`. The skill docs under `.claude/skills/*/SKILL.md` are readable as standalone references for each flow.

The full API reference lives at [docs.borderless.xyz](https://docs.borderless.xyz). Append `.md` to any page URL for a Markdown version (e.g., `/docs/quick-start-guide.md`). There's also an [llms.txt index](https://docs.borderless.xyz/llms.txt) of every docs page.

## Support

- Docs: https://docs.borderless.xyz
- Email: support@borderless.xyz
- Sandbox dashboard: https://sandbox-dashboard.borderless.xyz
