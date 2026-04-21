---
description: Copy the Borderless toolbox (CLAUDE.md, skills, flow commands, reviewer agent, .mcp.json) into a target project so its own Claude Code sessions have Borderless context.
---

Install the Borderless toolbox into another project. The argument is the absolute or relative path to that project's root: `$ARGUMENTS`.

If `$ARGUMENTS` is empty, ask the user which project to install into and stop until they answer.

## Before copying anything

1. **Verify the target exists.** Run `test -d <path>` (or equivalent). If not, print the path you tried and ask for the correct one. Never create a target directory — if it doesn't exist, the user typed the wrong path.

2. **Detect the target's stack.** Look for, in order:
   - `package.json` → Node / TypeScript
   - `pyproject.toml`, `requirements.txt`, `Pipfile`, `setup.py` → Python
   - `go.mod` → Go
   - `Cargo.toml` → Rust
   - `Gemfile` → Ruby
   - None of the above → ask the user.

   This only affects what you tell them at the end — the skills themselves are language-agnostic.

3. **Detect an existing `CLAUDE.md` at the target root.** Plan the merge strategy before touching anything — see "Handling an existing CLAUDE.md" below.

## What to copy

Source is this repo (the directory `/borderless-claude-code` lives in). Destination is `$ARGUMENTS`.

Copy:

- `CLAUDE.md` → `<target>/CLAUDE.md` (with the transformation described below).
- `.claude/skills/` → `<target>/.claude/skills/` (merge; don't overwrite unrelated skills the project already has).
- `.claude/agents/borderless-integration-reviewer.md` → `<target>/.claude/agents/borderless-integration-reviewer.md`.
- `.claude/commands/borderless-scaffold.md` → `<target>/.claude/commands/`.
- `.claude/commands/borderless-lint.md` → `<target>/.claude/commands/`.
- `.claude/commands/borderless-test-webhook.md` → `<target>/.claude/commands/`.
- `.claude/commands/borderless-coverage.md` → `<target>/.claude/commands/`.
- `.mcp.json` → `<target>/.mcp.json` (with merge logic below).

Do **not** copy:

- `examples/`, `cookbook/`, `prompts/` — these stay in the toolbox repo as reference.
- `README.md`, `CUSTOMIZE.md` — toolbox-facing, not project-facing.
- `.claude/commands/borderless-onboard.md` — sandbox walkthrough, not useful inside a live project.
- `.claude/commands/borderless-install-into.md` — this command. Never copy itself.

## Handling an existing CLAUDE.md

If `<target>/CLAUDE.md` already exists, ask the user:

> `<target>/CLAUDE.md` already exists. What should I do?
>
>   1. **Append** — add a `## Borderless integration` section to the end with the Borderless context. (recommended)
>   2. **Overwrite** — replace it with the Borderless toolbox CLAUDE.md. (destructive)
>   3. **Skip** — leave their CLAUDE.md alone, still copy skills/commands/agents. They can read `.claude/skills/*/SKILL.md` directly.

Default to **append** if they don't pick.

When appending, prefix the appended section with a single `---` horizontal rule and the heading `## Borderless integration`, then include the API essentials, mental model, hard rules, failure modes, and skills/commands list from this repo's `CLAUDE.md` — minus the opening paragraph about working inside the toolbox repo.

When overwriting or writing for the first time, also strip or rewrite the toolbox-specific paragraph that starts with "You're working inside the `borderless-claude-code` toolbox repo…" — replace with one sentence naming the target project and pointing at `/borderless-scaffold` for first-time setup. If you can detect the project name from `package.json` / `pyproject.toml` / `go.mod`, use it.

## Handling an existing .mcp.json

If `<target>/.mcp.json` exists, parse both files as JSON and merge the `mcpServers` object. If the target already has a `fetch` server, leave it alone. If it has the commented-out `_borderless_api_example_` stub already, leave it alone. Only add keys that aren't already present.

If parsing fails (malformed JSON), stop and tell the user — don't overwrite a file you can't parse.

## Handling existing skills / commands / agents

For each file you're about to copy, check if it already exists at the destination. If it does and the contents differ, ask the user per file:

> `.claude/skills/borderless-deposit-flow/SKILL.md` already exists at the target and differs from the toolbox version. Overwrite, keep existing, or show me the diff?

Default to **keep existing** if they don't pick — their local version may have project-specific edits.

## After copying

Report a summary:

```
Installed into <target>:
  ✓ CLAUDE.md (new / appended / overwritten / skipped)
  ✓ .claude/skills/borderless-compliance-flow/SKILL.md
  ✓ .claude/skills/borderless-deposit-flow/SKILL.md
  ✓ .claude/skills/borderless-withdrawal-flow/SKILL.md
  ✓ .claude/skills/borderless-webhook-verifier/SKILL.md
  ✓ .claude/agents/borderless-integration-reviewer.md
  ✓ .claude/commands/borderless-scaffold.md
  ✓ .claude/commands/borderless-lint.md
  ✓ .claude/commands/borderless-test-webhook.md
  ✓ .claude/commands/borderless-coverage.md
  ✓ .mcp.json (new / merged)
```

Then, based on the detected stack:

- **Node / TypeScript:** "The reference examples under `borderless-claude-code/examples/` are TS and will apply fairly directly. Run `/borderless-scaffold` inside `<target>` to generate a project-specific auth + client."
- **Python / Go / Rust / Ruby:** "The reference examples under `borderless-claude-code/examples/` are Node-specific, but the skills are language-agnostic. The `borderless-webhook-verifier` skill has Python and Go implementations inline. Run `/borderless-scaffold` inside `<target>` and Claude will detect your stack and generate idiomatic auth + client modules."
- **Unknown / none detected:** "No standard project file found. Run `/borderless-scaffold` once you know which stack you're building in."

End with:

```
Next step inside <target>:
  cd <target>
  claude
  /borderless-scaffold
```

## Do not

- Do not recursively copy the whole `.claude/` directory — cherry-pick the specific files listed above. The target may have unrelated skills/commands you'd clobber.
- Do not copy `.env`, `.env.example`, or anything under `examples/`. Credentials and runnable demos don't belong in the customer's own project.
- Do not modify or commit files on the customer's behalf. Just copy; let them review and commit.
- Do not delete anything at the target. This command is additive.
