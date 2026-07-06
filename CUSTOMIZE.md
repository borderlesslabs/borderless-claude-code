# Customize

What to edit, what to leave alone, what to delete. This repo is meant to be forked or installed into your own app — treat it as your starting point, not a read-only reference.

## Leave alone

These are the Borderless guardrails. Changing them usually means breaking a hard rule the integration reviewer will flag:

- **`.claude/skills/`** — the four flow skills. They encode the correct API sequence and failure modes for compliance, deposit, withdrawal, and webhooks.
- **`providers/` and `data/corridors.json`** — verified integration observations with provenance dates. If your org's live behavior disagrees, trust the live signal and report it to support@borderless.xyz rather than editing.
- **`.claude/agents/`** — the `borderless-integration-reviewer` subagent.
- **`.claude/commands/`** — the existing slash commands. Add new ones freely; don't modify the shipped ones.
- **`.mcp.json`** — the fetch MCP server lets Claude pull docs pages on demand. The optional OpenAPI bridge is commented out — uncomment to expose the sandbox API as callable tools during development.
- **The hard-rules list in `CLAUDE.md`.** If you disagree with one, talk to Borderless support before changing it.

## Edit freely

- **The corridor constant in each `examples/*/src/index.ts`.** Look for the `FORK HERE` comment. Change it to match a corridor your organization has configured (e.g., `BR/BRL/PIX` with Bitso, `NG/NGN/MOBILE_MONEY` with Yellowcard, etc.).
- **`.env` files** (created from `.env.example`). Your sandbox credentials and account IDs go here. These are gitignored by convention — never commit real values.
- **`CLAUDE.md` after installing into your own project.** The template comes with the hard rules and mental model; add project-specific conventions to the "Project-specific conventions" section.
- **Anything under your own app code** once you've run `/borderless-install-into <path>`. The installed files are yours — rename, restructure, rewrite as you need.

## Delete freely

- **Examples you don't need.** If you only care about deposits, delete `examples/withdrawal-usdc-to-us-ach/` and `examples/webhooks/`. If you only use webhooks, delete the two flow examples.
- **Cookbook entries** that don't apply to your setup. They're standalone prose — no cross-references to break.
- **Prompts** you won't use. They're copy-paste templates; removing them is harmless.

## When in doubt

- `/borderless-lint` flags most breakage. Run it after any significant change to the flow code.
- The `borderless-integration-reviewer` subagent is stricter than `/borderless-lint` and is what you'd want blocking PRs. Invoke it on diffs you're about to merge.
- Ask in the chat: "is it safe to delete X?" Claude has the skills loaded and will tell you what depends on what.
