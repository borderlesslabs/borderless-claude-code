---
description: Scaffold a new Borderless integration in the current project with env vars, auth helper, and a typed client.
---

Scaffold a minimal Borderless integration in the current project. Before writing any code:

1. **Detect the project's language and stack.** Look at files like `package.json`, `tsconfig.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`. If ambiguous, ask.
2. **Detect the env-var convention.** If there's a `.env`, `.env.example`, or config module, follow that pattern. Otherwise create `.env.example`.
3. **Detect the HTTP / decimal libraries in use.** Reuse what the project already has rather than adding dependencies.

Then create the following, keeping each file minimal and idiomatic to the project:

- A `.env.example` (or append to it) with:
  - `BORDERLESS_BASE_URL=https://sandbox-api.borderless.xyz/v1`
  - `BORDERLESS_CLIENT_ID=`
  - `BORDERLESS_CLIENT_SECRET=`
  - `BORDERLESS_WEBHOOK_PUBLIC_KEY=`
- An **auth module** that:
  - Calls `POST /auth/m2m/token` on first use.
  - Caches the token in memory with expiry tracked from the `expiresIn` field.
  - Refreshes on expiry or on 401.
  - Never logs the secret or token.
- A **client module** that:
  - Wraps the HTTP library with a base URL + bearer token injection.
  - Generates an `idempotency-key` (UUID v4) per mutating call, or accepts one passed in by the caller.
  - Uses decimal types (not float) for any amount fields.
  - Exposes typed helpers for the endpoints the project will actually use (ask the user which flows — compliance / deposit / withdrawal / webhooks — if not clear from context).
- A **README snippet** in the project explaining how to configure env vars and run.

**Do not:**
- Install a new HTTP or decimal library if the project already has one.
- Generate endpoints the user didn't ask for.
- Commit any real credentials.

Before writing files, tell the user what you're about to create and confirm the file locations fit their conventions. After scaffolding, suggest they review `CLAUDE.md.template` in this repo if they haven't already.
