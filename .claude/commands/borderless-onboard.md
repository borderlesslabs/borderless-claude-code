---
description: Zero-to-first-transaction sandbox walkthrough. Authenticates, creates an identity + compliance + account, then submits a real sandbox deposit so the customer sees it in their dashboard.
---

This is the customer's first run. The goal is **one working sandbox deposit visible in the sandbox dashboard in about 15 minutes**, driven entirely by this command. You are walking them through a real sequence of API calls on `https://sandbox-api.borderless.xyz/v1`.

Execute the flow one step at a time. Do not batch requests or skip ahead. At each step, make the API call, show the outcome, and only then describe the next step.

## Guardrails — follow these throughout

- **Never ask the customer for architecture, framework, or scope decisions up front.** Authenticate first (the hook), then expand scope only after they say yes.
- **Show the first API call (Step 2 `/auth/m2m/token`) in full** — the curl command (with secrets redacted as `$BORDERLESS_CLIENT_SECRET`), the HTTP status, and the response body. For subsequent calls, summarize — one line for the call, key fields from the response, skip the full JSON.
- **Two-minute timeout per polling step** (Step 4 compliance, Step 6 deposit instructions). If the step exceeds the timeout, print the transaction / compliance-check ID, tell the customer it will continue in the background, give them the single `GET` call to resume monitoring, and exit cleanly. Do not hang.
- **Never print, log, or echo** `BORDERLESS_CLIENT_SECRET`, `accessToken`, full identity payloads, `taxId`, `dateOfBirth`, `imageFront`, or `imageBack`. Use `$VAR` references or `<redacted>` placeholders.
- **Every mutating call carries a UUID v4 `idempotency-key` header.** Generate with `uuidgen` or an equivalent.
- **Read `BORDERLESS_BASE_URL` from env.** Never hardcode URLs in the commands you emit.
- **If any call returns 4xx/5xx, stop.** Print the status, the response body (redacted of any echoed secrets), and ask the customer how to proceed. Do not retry automatically, do not skip to the next step.

---

## Step 1 — Environment check

Check the repo root for a `.env` file.

- If `.env` does not exist and `.env.example` does, copy `.env.example` to `.env` and tell the customer.
- If neither exists, create `.env` with the following keys empty:
  ```
  BORDERLESS_BASE_URL=https://sandbox-api.borderless.xyz/v1
  BORDERLESS_CLIENT_ID=
  BORDERLESS_CLIENT_SECRET=
  ```

Read the file and check that `BORDERLESS_CLIENT_ID` and `BORDERLESS_CLIENT_SECRET` are both non-empty. If either is empty, ask the customer for the value and write it back to `.env`. Explain that these come from their Borderless onboarding email, or can be generated at `https://sandbox-dashboard.borderless.xyz` under API keys. Do not echo the values after they paste them.

Confirm `BORDERLESS_BASE_URL` is set. Default to `https://sandbox-api.borderless.xyz/v1` if missing.

Check that `uuidgen` is on the PATH — you'll use it for idempotency keys. It's native on macOS and Linux. If it's missing (rare; some minimal containers), `python3 -c 'import uuid;print(uuid.uuid4())'` is an acceptable substitute.

---

## Step 2 — First API call: authenticate

This is the hook. It proves the customer's credentials work before you ask them anything else.

Run and show in full:

```bash
curl -sS -w "\nHTTP %{http_code}\n" -X POST "$BORDERLESS_BASE_URL/auth/m2m/token" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"$BORDERLESS_CLIENT_ID\",\"clientSecret\":\"$BORDERLESS_CLIENT_SECRET\"}"
```

On 200, extract `accessToken` and `expiresIn`, store them in shell variables (`ACCESS_TOKEN`, `TOKEN_EXPIRES_AT=$(($(date +%s) + EXPIRES_IN - 60))`), and print:

```
✓ Authenticated. You have a working Borderless sandbox connection.
  Token expires in ~<expiresIn>s. We'll refresh on 401 if needed.
```

On non-200, print the status and body (redacting any echoed secrets) and stop. Most common cause: wrong credentials, or sandbox keys being used against a production base URL.

After success, ask the customer:

> Want to continue into a full sandbox deposit? I'll create an identity, run compliance, create an account, and submit a real deposit. Should take about 10 minutes and you'll see the transaction in the sandbox dashboard when it's done. [y/n]

If they say no, exit with:

```
No problem. Whenever you're ready:
  - /borderless-deposit-flow walks through the deposit steps individually.
  - /borderless-coverage lists the corridors your org already has configured.
  - CLAUDE.md has the full mental model.
```

---

## Step 3 — PFI + corridor

Fetch the **active** provider network on this sandbox organization — this is the authoritative read of what the org can do right now (configured-but-inactive providers are excluded):

```bash
curl -sS "$BORDERLESS_BASE_URL/organizations/network?status=active" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Each element is an active provider with `options` per operation type (`deposit` / `withdrawal`), carrying `assets: [{asset, countries[]}]` and `fiats: [{fiat, paymentMethods: [{method, countries[]}]}]`. Summarize (not full JSON):

```
Active providers on your sandbox org:
  1. Bridge    (deposits: US/USD/ACH, US/USD/Wire · withdrawals: US/USD/ACH, US/USD/Wire)
  2. Bitso     (deposits: MX/MXN/SPEI, BR/BRL/PIX · …)
  ...
```

Do **not** infer coverage from `GET /organizations/integrations/config-info` — `isConfigured: true` does not mean a provider is active (see `cookbook/discovery.md`).

If the call returns non-200 or the list is empty, fall back to this hardcoded list and say so:

> Couldn't read `/organizations/network` — falling back to the standard PFI list. If none of these are active on your org, the subsequent calls will fail. Contact support@borderless.xyz to configure PFI credentials.
>
> Bridge, Bitso, Yellowcard, Trace Finance, Finity, HoneyCoin, Koywe, Walapay, Infinia, KotaniPay.

Ask the customer which PFI to use. Default to **Bridge** if they don't express a preference — it's the most common sandbox starting point.

Then fetch the supported deposit corridors, scoped to the PFI's country. **Always pass `country=` — the unfiltered call pages/truncates and hides common countries like US:**

```bash
curl -sS "$BORDERLESS_BASE_URL/deposits/options?country=$COUNTRY" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Cross-check the chosen `{fiat, method, asset}` against the active-network response from the start of this step — `/deposits/options` also lists configs belonging to inactive providers, and an asset that only an inactive provider serves will fail at transaction time.

Pick the first corridor that matches the PFI — e.g., for Bridge, `{country: US, fiat: USD, asset: USDC_POLYGON, paymentMethod: ACH}`. Note: `method` values in the response use the casing the API expects back (`ACH`, `Wire`, `Sepa`, `PIX`, `SPEI`, `PSE`, `EFT`, `MobileMoney`, `BankTransfer`) — pass them through unchanged. Summarize and offer to change:

> Default corridor for Bridge: US / USD / ACH → USDC on Polygon.
> Change it? [type a different country/fiat/asset/paymentMethod, or press enter to accept]

Save the chosen corridor as shell variables: `PFI`, `COUNTRY`, `FIAT`, `ASSET`, `PAYMENT_METHOD`.

---

## Step 4 — Identity + compliance

Ask:

> Personal or Business identity? [Personal] — Personal has fewer required fields and completes faster on sandbox. Production would use whichever matches your real end user.

Default to **Personal** if no answer.

Ask whether to use placeholder data or the customer's real name:

> Use placeholder data, or your real name? Using your real name makes the identity findable in the sandbox dashboard. Other PII (address, DOB, tax ID) will be placeholders regardless. [real/placeholder, default placeholder]

Generate the identity body. For Personal:

```json
{
  "firstName": "<placeholder or real>",
  "lastName": "<placeholder or real>",
  "email": "sandbox-<short-uuid>@example.com",
  "dateOfBirth": "1990-01-15",
  "taxId": "123-45-6789",
  "address": { "street1": "123 Market St", "city": "San Francisco", "state": "CA", "country": "US", "postalCode": "94103" }
}
```

Notes:
- Do **not** include `phoneNumber` — the schema rejects it with `property should not exist`. Phone lives on the identity as `phone` if you need to patch it later (`PATCH /identities/personal/{id}`).
- Do **not** use a taxId starting with `9` — Bridge validates US SSNs and rejects the `9xx-xx-xxxx` range (reserved for ITINs).

Adjust the address country code to match `$COUNTRY` if it isn't US.

Submit (generate a fresh idempotency key):

```bash
IDEM=$(uuidgen)
curl -sS -X POST "$BORDERLESS_BASE_URL/identities/personal" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "idempotency-key: $IDEM" \
  -d @/tmp/borderless-identity.json
```

Extract `id` → `IDENTITY_ID`. Do not print the full request body (PII). Do print: `Created identity <IDENTITY_ID>.`

Discover the compliance slug for this corridor:

```bash
curl -sS "$BORDERLESS_BASE_URL/identities/$IDENTITY_ID/compliance-checks?country=$COUNTRY&asset=$ASSET&fiat=$FIAT&paymentMethod=$PAYMENT_METHOD&type=Deposit" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Extract `slug` → `COMPLIANCE_SLUG` (keep it as the identifier for POSTing the check later). Also note `metadata.tosLink` and `metadata.hasAcceptedTos`.

**Read-state endpoint.** There is no singular `GET /identities/{id}/compliance-checks/{slug}` — it returns 404. To read current state (ToS, status, kycStatus, incompleteReasons), re-call the **list endpoint with the corridor query params** and take the first element. Every poll in Step 4 uses this shape:

```bash
curl -sS "$BORDERLESS_BASE_URL/identities/$IDENTITY_ID/compliance-checks?country=$COUNTRY&asset=$ASSET&fiat=$FIAT&paymentMethod=$PAYMENT_METHOD&type=Deposit" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Terms of Service — enforce acceptance

If `metadata.tosLink` is present **and** `metadata.hasAcceptedTos` is not already `true`, the customer must accept the ToS before compliance can proceed. Block here until they do.

Print the link clearly so it's easy to copy if auto-open fails:

```
This PFI requires Terms of Service acceptance before we can start compliance.

Open this link and accept:

  <metadata.tosLink>
```

Then try to open it in their default browser. Detect the OS and run the right command:

- macOS: `open "<tosLink>"`
- Linux: `xdg-open "<tosLink>"` (fall back to `python3 -m webbrowser "<tosLink>"` if `xdg-open` is missing)
- Windows / WSL: `cmd.exe /C start "" "<tosLink>"`

If the open command fails for any reason, do not treat it as a hard error — just tell the customer to copy the link above and paste it into a browser manually.

Poll the list endpoint (shown above) every 5 seconds for up to **5 minutes**, reading `[0].metadata.hasAcceptedTos`. Print a single status line each poll: `  waiting for ToS acceptance…`.

- On `hasAcceptedTos === true` → print `✓ ToS accepted.` and continue.
- On 5-min timeout → graceful exit:
  ```
  Still waiting for ToS acceptance. No rush — once you've accepted in the browser,
  resume with:

    curl "$BORDERLESS_BASE_URL/identities/$IDENTITY_ID/compliance-checks?country=$COUNTRY&asset=$ASSET&fiat=$FIAT&paymentMethod=$PAYMENT_METHOD&type=Deposit" \
      -H "Authorization: Bearer $ACCESS_TOKEN"

  When `[0].metadata.hasAcceptedTos` is true, re-run /borderless-onboard (idempotency
  keys are persisted) or continue with /borderless-compliance-flow.
  ```

If `metadata.tosLink` is not present, skip this sub-step and continue.

### Requirements

Fetch the requirements so the customer sees what production would demand:

```bash
curl -sS "$BORDERLESS_BASE_URL/identities/$IDENTITY_ID/compliance-checks/$COMPLIANCE_SLUG/requirements" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Summarize: list `missingFields` and `requiredDocuments[].documents` (document types) — don't dump the full schema. Tell the customer this is what their production UI would collect.

If `requiredDocuments` is non-empty, upload placeholder PNGs. Generate two 200×200 PNGs — a solid color is fine (signature-valid JPEG/PNG magic bytes, not text). You can generate inline with Node:

```bash
node -e '
  const b = Buffer.alloc(200*200*3, 0x80);
  const { PNG } = require("pngjs");
  // or use a pre-built base64 placeholder — sandbox does not OCR the image
' > /dev/null 2>&1 || true
```

Simpler approach that always works: use a hardcoded ~1KB valid PNG base64 string. Keep one inline in the command output. The sandbox does not run real OCR — any valid 200×200 PNG is accepted.

Upload:

```bash
IDEM=$(uuidgen)
curl -sS -X PUT "$BORDERLESS_BASE_URL/identities/$IDENTITY_ID/documents" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "idempotency-key: $IDEM" \
  -d '{"issuingCountry":"'$COUNTRY'","type":"Passport","issuedDate":"2024-01-01","expiryDate":"2030-01-01","imageFront":"data:image/png;base64,<redacted>","imageBack":"data:image/png;base64,<redacted>"}'
```

Print: `Uploaded placeholder documents.`

Start the compliance check:

```bash
IDEM=$(uuidgen)
curl -sS -X POST "$BORDERLESS_BASE_URL/identities/$IDENTITY_ID/compliance-checks/$COMPLIANCE_SLUG" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "idempotency-key: $IDEM"
```

Poll every 5 seconds for up to **2 minutes**, using the same list endpoint as above and reading `[0].status`:

```bash
curl -sS "$BORDERLESS_BASE_URL/identities/$IDENTITY_ID/compliance-checks?country=$COUNTRY&asset=$ASSET&fiat=$FIAT&paymentMethod=$PAYMENT_METHOD&type=Deposit" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Print the status on each poll as a single line: `  compliance: NotStarted → Started → InProgress → UnderReview → Completed`.

Terminal states: `Completed`, `Rejected`. Non-terminal: `NotStarted`, `Started`, `InProgress`, `UnderReview`.

- On `Completed` → continue to Step 5.
- On `Rejected` → print `rejectionReasons` and stop.
- On 2-min timeout in any non-terminal state → print the graceful-exit message below and stop. **Do not** continue to Step 5 silently; ask the customer whether to wait longer or exit.

**Graceful exit for compliance timeout:**

```
Compliance is still <status>. Sandbox usually reaches Completed within 30s, but
some PFI runs (especially first-ever KYCs) sit in UnderReview longer. Resume
monitoring with:

  curl "$BORDERLESS_BASE_URL/identities/$IDENTITY_ID/compliance-checks?country=$COUNTRY&asset=$ASSET&fiat=$FIAT&paymentMethod=$PAYMENT_METHOD&type=Deposit" \
    -H "Authorization: Bearer $ACCESS_TOKEN"

Once `[0].status` is Completed, re-run /borderless-onboard (it's idempotent via the
keys we've stored) or continue manually with /borderless-deposit-flow.
```

---

## Step 5 — Account

Create a Standalone account **with the corridor's asset attached in the same call**. This is the only shape that works — posting to `/accounts/{id}/assets` after the fact returns 500, and `type` is rejected (the server defaults to `web3Provider: Standalone` when the body doesn't specify).

For sandbox, use a placeholder Polygon address (the PFI doesn't validate it owns funds at this stage). For production, the customer would pass the address of a wallet they actually control (Fireblocks / Utila / Dfns / Circle / MetaMask / etc.):

```bash
IDEM=$(uuidgen)
FROM_ADDRESS="${BORDERLESS_FROM_ADDRESS:-0x742d35cc6634c0532925a3b844bc454e4438f44e}"
curl -sS -X POST "$BORDERLESS_BASE_URL/accounts" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "idempotency-key: $IDEM" \
  -d '{
    "identityId":"'$IDENTITY_ID'",
    "name":"Sandbox account",
    "assets":[{"asset":"'$ASSET'","address":"'$FROM_ADDRESS'"}]
  }'
```

Extract `id` → `ACCOUNT_ID`, and extract `assets[0].address` → `FROM_ADDRESS` (the server echoes it back, sometimes re-normalized). Print:

```
Created Standalone account <ACCOUNT_ID> with <ASSET> attached.
  fromAddress: <FROM_ADDRESS>

Note: Standalone accounts are sandbox convenience. In production you would swap
in your real wallet provider (Fireblocks, Utila, Dfns, Circle, etc.) via the
wallet-provider-specific account creation flow, and `fromAddress` would be the
real wallet address the PFI expects withdrawals to originate from.
```

**Do not** send a `type` field in the create body — the schema rejects it with `property should not exist`. **Do not** try to attach assets with a follow-up `POST /accounts/{id}/assets` — that endpoint currently returns 500 on Standalone accounts; the one-shot shape above is the working pattern.

---

## Step 6 — Deposit

Show a quote first:

```bash
curl -sS "$BORDERLESS_BASE_URL/deposits/quotes?country=$COUNTRY&fiat=$FIAT&asset=$ASSET&paymentMethod=$PAYMENT_METHOD&fromAmount=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Summarize `toAmount`, `exchangeRate`, `totalFee`, `orchestrationFee`. Print:

```
Quote for 10 $FIAT: ~$toAmount $ASSET, fee ~$totalFee.
Reminder: quotes are estimates, not firm. Never persist them as settlement amounts.
```

Create the deposit:

```bash
IDEM=$(uuidgen)
curl -sS -X POST "$BORDERLESS_BASE_URL/deposits" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "idempotency-key: $IDEM" \
  -d '{"fiat":"'$FIAT'","amount":"10","asset":"'$ASSET'","accountId":"'$ACCOUNT_ID'","paymentMethod":"'$PAYMENT_METHOD'","country":"'$COUNTRY'"}'
```

Extract `id` → `DEPOSIT_ID`. Print: `Created deposit <DEPOSIT_ID>.`

If `instructions` and `depositInstruction` are both null, poll `GET /transactions/$DEPOSIT_ID` every 5 seconds for up to **2 minutes** until one of them populates. On each poll, print a one-line status update.

- On populated → print the payment instructions verbatim. Tell the customer:
  ```
  These are the payment instructions the originator would follow to complete
  the deposit in production. In sandbox you don't need to actually send fiat —
  the transaction will progress to Completed on its own shortly.

  Check the sandbox dashboard now — your deposit is there:
  https://sandbox-dashboard.borderless.xyz
  ```
- On 2-min timeout → graceful exit:
  ```
  Instructions haven't populated yet — KYC/KYB at the PFI may still be
  finalizing. Resume with:

    curl "$BORDERLESS_BASE_URL/transactions/$DEPOSIT_ID" \
      -H "Authorization: Bearer $ACCESS_TOKEN"

  Or subscribe to Transaction_Updated webhooks (see
  .claude/skills/borderless-webhook-verifier/SKILL.md).
  ```

---

## Step 7 — Next steps

Print:

```
✓ Onboarding complete. You have:
  - Identity:     <IDENTITY_ID>
  - Compliance:   <COMPLIANCE_SLUG> (<status>)
  - Account:      <ACCOUNT_ID>
  - From address: <FROM_ADDRESS>
  - Deposit:      <DEPOSIT_ID>

What's next:
  - CLAUDE.md is the workspace context. Skim it.
  - /borderless-withdrawal-flow for off-ramps (needs a payment instruction first).
  - /borderless-webhook-verifier to wire up signed event handlers.
  - cookbook/ for reconciliation, webhook replay, and amount handling.
  - /borderless-install-into <path> when you're ready to move the Borderless
    guardrails (CLAUDE.md + skills + flow commands) into your own app.
```

Persist the IDs into a `.borderless-onboard.json` at the repo root so re-runs can resume idempotently:

```json
{
  "identityId": "...",
  "complianceSlug": "...",
  "accountId": "...",
  "fromAddress": "...",
  "depositId": "...",
  "paymentInstructionId": "...",   // optional — populated by the withdrawal flow
  "withdrawalId": "...",           // optional — populated by the withdrawal flow
  "corridor": { "pfi": "...", "country": "...", "fiat": "...", "asset": "...", "paymentMethod": "..." }
}
```

Add `.borderless-onboard.json` and `.env` to `.gitignore` if not already there.

---

## Do not

- Do not invent endpoints or parameters not documented in the skills or at `docs.borderless.xyz`. When in doubt, fetch `https://docs.borderless.xyz/docs/quick-start-guide.md` via the fetch MCP server.
- Do not continue past a failed step. The customer will be confused about which resource is in what state.
- Do not suggest production URLs, production credentials, or "switch to production when you're ready" — this command is sandbox-only.
- Do not dump full JSON bodies for every call. One full example (Step 2), summaries after that.
- Do not bypass the 2-minute per-step timeout. Exit cleanly instead.
