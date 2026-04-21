# borderless-claude-code

A Claude Code workspace for building against the [Borderless](https://borderless.xyz) stablecoin payments API. Clone it, run `/borderless-onboard`, and you'll have a working sandbox transaction in your dashboard in about 15 minutes.

This repo is both your first-run sandbox and a permanent toolbox — skills, slash commands, reference examples, and prompt templates you keep using as you build your integration.

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
3. **Pick a corridor** — defaults to Bridge US/USD/ACH → USDC on Polygon. Customizable; `/borderless-coverage` shows alternatives.
4. **Identity + compliance** — creates a Personal identity with placeholder PII, discovers the compliance slug for the corridor, handles ToS acceptance if the PFI requires it, starts the KYC check, polls to terminal.
5. **Account** — creates a Standalone account with the corridor's stablecoin attached. (Production wallets — Fireblocks, Utila, Dfns, Circle — swap in via their own account-creation flows.)
6. **Deposit** — shows a quote, creates the deposit, polls until the PFI returns payment instructions, prints them verbatim for the originator.
7. **Persist state** — writes IDs to `.borderless-onboard.json` so you can resume idempotently if anything times out.

### Sample output

Abridged from a real sandbox run — IDs are real CUIDs from that session; PII and secrets are redacted in the actual output, not here:

```
Step 1 — Environment check
✓ .env present; credentials loaded.

Step 2 — Authenticate
  POST /auth/m2m/token → HTTP 201
✓ Authenticated. Token expires in ~86399s.

Step 3 — PFI + corridor
  Configured PFIs (default set): Bridge, Bitso, Yellowcard, Trace Finance, …
  Default corridor for Bridge: US / USD / ACH → USDC on Polygon. [enter to accept]

Step 4 — Identity + compliance
  Created identity cmo8wpdk204a722p9o9au0viv
  Compliance slug: compliance-fee5483c
    requiredDocuments: none for this corridor
  ✓ ToS already accepted.
  Started compliance check. Polling for terminal status…
    compliance: NotStarted → Started → UnderReview → Approved
  ✓ Compliance Approved.

Step 5 — Account
  Created Standalone account cmo8x8owd04ae22p9x4lkp521 with USDC_POLYGON attached.
    fromAddress: 0x742d35cc6634c0532925a3b844bc454e4438f44e

Step 6 — Deposit
  Quote for 10 USD: ~10 USDC_POLYGON, fee ~0.
  Created deposit cmo8x9s5d04ag22p9xxf102ll (Bridge, Submitted).
    status=Submitted   instructions=null
    status=Pending     instructions=yes   depositInstruction=yes
  ✓ Instructions populated.

  Payment instructions (the originator would follow these verbatim):
    paymentMethod:        ACH
    bankName:              Bank of Nowhere
    bankAccountNumber:     11223344556677
    bankRoutingNumber:     123456789
    bankBeneficiaryName:   Bridge Ventures Inc
    depositMessage:        BRGMJCCUVSYUAPPYT5RK

  (In sandbox you don't need to actually send fiat — the transaction
   progresses to Completed on its own shortly.)

Step 7 — Next steps
✓ Onboarding complete.
  - Identity:     cmo8wpdk204a722p9o9au0viv
  - Compliance:   compliance-fee5483c (Approved)
  - Account:      cmo8x8owd04ae22p9x4lkp521
  - From address: 0x742d35cc6634c0532925a3b844bc454e4438f44e
  - Deposit:      cmo8x9s5d04ag22p9xxf102ll (Completed)

  IDs persisted to .borderless-onboard.json.
```

In sandbox, deposits auto-reconcile without real fiat — the transaction walks through `Submitted → Pending → Processing → Completed` on its own over a few minutes. Check https://sandbox-dashboard.borderless.xyz to see it land.

## See what corridors are available — `/borderless-coverage`

Your sandbox org comes pre-configured by Borderless with PFI coverage across dozens of countries. `/borderless-coverage` reads the live API and shows you exactly what's available — countries, fiats, payment rails, stablecoins, and whether each corridor supports deposits, withdrawals, or both.

Pass a country code to scope: `/borderless-coverage US`, `/borderless-coverage BR`, etc.

### Sample output

Truncated — the default sandbox has 100+ countries, so the actual output is ~250 rows:

```
Borderless coverage on this org
  Deposits:     577 corridors across 71 countries
  Withdrawals:  1,079 corridors across 107 countries

Countries:
  AE  AED  NPSS           [D/W]  USDC_BASE, USDC_ETHEREUM, USDC_POLYGON, USDC_SOLANA, USDT_ETHEREUM, USDT_POLYGON, USDT_SOLANA, USDT_TRON
  AE  USD  Swift          [  W]  USDC_BASE, USDC_ETHEREUM, USDC_POLYGON, USDC_SOLANA, USDT_ETHEREUM, USDT_OPTIMISM, USDT_SOLANA, USDT_TRON
  BR  BRL  PIX            [D/W]  USDC_ETHEREUM, USDC_POLYGON, USDT_ETHEREUM, USDT_POLYGON
  CO  COP  PSE            [D/W]  USDC_BASE, USDC_ETHEREUM, USDC_POLYGON, USDT_ETHEREUM, USDT_POLYGON
  DE  EUR  Sepa           [D/W]  USDC_BASE, USDC_ETHEREUM, USDC_POLYGON, USDC_SOLANA, USDT_ETHEREUM, USDT_POLYGON, USDT_SOLANA, USDT_TRON
  KE  KES  MobileMoney    [D  ]  USDC_CELO, USDC_ETHEREUM, USDC_POLYGON, USDC_SOLANA, USDT_ETHEREUM, USDT_POLYGON, USDT_SOLANA, USDT_TRON
  MX  MXN  SPEI           [D/W]  USDC_ETHEREUM, USDC_POLYGON, USDT_ETHEREUM, USDT_POLYGON
  NG  NGN  BankTransfer   [D/W]  USDC_CELO, USDC_ETHEREUM, USDC_POLYGON, USDC_SOLANA, USDT_ETHEREUM, USDT_POLYGON, USDT_SOLANA, USDT_TRON
  US  USD  ACH            [D/W]  ETH, USDC_BASE, USDC_ETHEREUM, USDC_OPTIMISM, USDC_POLYGON, USDC_SOLANA, USDT_ETHEREUM
  US  USD  Wire           [D/W]  ETH, USDC_BASE, USDC_ETHEREUM, USDC_OPTIMISM, USDC_POLYGON, USDC_SOLANA, USDT_ETHEREUM
  …

Legend: D = deposit supported, W = withdrawal supported
```

Flag column tells you at a glance: `[D/W]` = both directions, `[D  ]` = deposit-only, `[  W]` = withdrawal-only. Withdrawal coverage is typically ~2× deposit coverage on a provisioned org.

## Typical customer workflow

1. **Prove everything works: `/borderless-onboard`.** One command, ~15 minutes, takes you from zero credentials to a completed sandbox deposit. See the walkthrough above.
2. **Map the terrain: `/borderless-coverage`.** See every corridor your org has configured. Pick the one your product needs. If something you need isn't listed, email `support@borderless.xyz`.
3. **Fork an example.** The five runnable projects under `examples/` chain in order — `compliance-personal/` → `account-setup/` → `deposit-us-ach-to-usdc/` → `withdrawal-usdc-to-us-ach/`, plus a standalone `webhooks/` Express handler. Each has a `FORK HERE` comment on the corridor constant — change it to match your chosen corridor and you're off.
4. **Move the toolbox into your app: `/borderless-install-into <path>`.** When you're ready to build the real integration, this command copies `CLAUDE.md`, the skills, and the flow commands into your own codebase. Claude then has the Borderless guardrails and mental model baked into every session you run inside your project. The runnable examples stay here in this repo as reference.

## Prerequisites

- Node 20+ on your machine.
- [Claude Code](https://claude.com/claude-code) installed and authenticated.
- **Borderless sandbox client ID and secret.** You should have received these at onboarding. If not, email `support@borderless.xyz`.
- **Your sandbox org comes pre-configured with PFI coverage.** Borderless provisions PFIs server-side before your sandbox account is handed over — you don't configure them yourself. If a corridor you need isn't in `/borderless-coverage`, contact `support@borderless.xyz`.

`/borderless-onboard` checks all of this and prompts for anything missing.

## What's in the repo

- `.claude/skills/` — four flow skills (compliance, deposit, withdrawal, webhooks) that Claude auto-loads when relevant.
- `.claude/commands/` — slash commands: `/borderless-onboard`, `/borderless-coverage`, `/borderless-scaffold`, `/borderless-lint`, `/borderless-test-webhook`, `/borderless-install-into`.
- `.claude/agents/borderless-integration-reviewer.md` — a reviewer subagent you invoke for PR audits.
- `examples/` — five runnable TypeScript references that chain: `compliance-personal/` → `account-setup/` → `deposit-us-ach-to-usdc/` → `withdrawal-usdc-to-us-ach/`, plus a standalone `webhooks/` Express handler. Each prints the env-var values the next step needs.
- `cookbook/` — short guides for post-onboarding situations (reconciliation, webhook replay, compliance testing, amount handling).
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
