---
description: Generate a signed test webhook payload you can replay against a local Borderless handler during development.
---

Help the user test their Borderless webhook handler locally by generating a signed payload they can `curl` at their endpoint.

**Workflow:**

1. Ask the user three things:
   - The local endpoint URL (default: `http://localhost:3000/webhooks/borderless`).
   - Which event type to simulate: `Transaction_Created`, `Transaction_Updated`, `IdentityComplianceCheck_Updated`, `IdentityComplianceCheck_Completed`, `VirtualAccount_Created`, or `VirtualAccount_CreationFailed`.
   - For transaction events: which operation type (`Deposit`, `Withdrawal`, `Transfer`, etc.) and desired terminal status.

2. Generate a realistic JSON payload matching the structure Borderless actually sends, populated with plausible-looking IDs and timestamps.

3. **Sign it.** Because this is for local testing, the user needs a local key pair that their handler will verify against. Offer two options:

   **Option A (recommended for testing):** Generate a local test key pair.
   ```bash
   openssl genrsa -out test-private.pem 2048
   openssl rsa -in test-private.pem -pubout -out test-public.pem
   ```
   Have the user set `BORDERLESS_WEBHOOK_PUBLIC_KEY` in their `.env` to the contents of `test-public.pem` for the duration of local testing. Then sign the payload with `test-private.pem` using RSA-SHA256 and base64-encode the signature.

   **Option B:** If the user wants an unsigned payload to test their "missing signature" path, generate it without `x-signature`.

4. Emit a ready-to-run `curl` command:

   ```bash
   curl -X POST {endpoint} \
     -H "Content-Type: application/json" \
     -H "x-signature: {base64_signature}" \
     -d '{payload_json}'
   ```

5. Remind the user that after testing, they must:
   - Remove the test key pair.
   - Restore `BORDERLESS_WEBHOOK_PUBLIC_KEY` to the real value from `GET /v1/notifications/webhooks/settings/public-key`.

**Do not:**
- Generate payloads signed with made-up signatures that will fail verification silently — be explicit about the key-pair setup.
- Suggest disabling signature verification for testing. That defeats the whole point.
