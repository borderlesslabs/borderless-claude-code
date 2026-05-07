---
name: borderless-webhook-verifier
description: Use when building, debugging, or reviewing a webhook endpoint that receives Borderless events. Covers signature verification with RSA-SHA256 using the organization's public key, idempotency via event ID deduplication, the supported event and operation types, and the retry / auto-disable behavior. Triggers on mentions of webhooks, x-signature, webhook verification, webhook security, or Borderless event handling.
---

# Borderless Webhook Verifier

Borderless sends webhook notifications via HTTP POST for transaction and compliance events. Every payload is signed with RSA-SHA256 using a private key held by Borderless; you verify it using the corresponding public key.

**Security rule:** Unverified webhooks must be rejected with 401. Never trust a webhook payload that hasn't passed signature verification.

## How signatures work

- Borderless generates an RSA key pair per organization when your first webhook is registered.
- Each webhook request carries the signature in the `x-signature` header.
- The signature is computed over the **raw request body** (before any JSON parsing).
- You verify using the **public key** fetched once via `GET /notifications/webhooks/settings/public-key`.

**Critical:** compute the signature check against the raw bytes of the body. If your framework auto-parses JSON and you re-serialize, byte-for-byte differences (key ordering, whitespace, Unicode escapes) will cause verification to fail.

## One-time setup

### 1. Register a webhook

```bash
POST /v1/notifications/webhooks/settings
Headers: Authorization, Content-Type
Body: { "url": "https://yourapp.com/webhooks/borderless" }
```

Response returns `{ id, url, enabled, createdAt, updatedAt }`. The key pair is auto-generated the first time you register a webhook.

### 2. Fetch the public key

```bash
GET /v1/notifications/webhooks/settings/public-key
```

Cache this in your app — typically as an env var (`BORDERLESS_WEBHOOK_PUBLIC_KEY`) or a secrets store. It changes only if you explicitly rotate it.

### 3. (When needed) Rotate keys

```bash
POST /v1/notifications/webhooks/settings/public-key
```

Regenerates the key pair. Update your cached public key immediately — old signatures will no longer verify.

## Verification — reference implementations

### Node.js (Express)

```javascript
import express from 'express';
import crypto from 'crypto';

const app = express();
const PUBLIC_KEY = process.env.BORDERLESS_WEBHOOK_PUBLIC_KEY; // PEM-formatted

// Capture the raw body for signature verification.
app.use('/webhooks/borderless', express.raw({ type: 'application/json' }));

app.post('/webhooks/borderless', (req, res) => {
  const signature = req.header('x-signature');
  if (!signature) return res.status(401).send('Missing signature');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(req.body); // Buffer of raw bytes
  verifier.end();

  const valid = verifier.verify(PUBLIC_KEY, signature, 'base64');
  if (!valid) return res.status(401).send('Invalid signature');

  const event = JSON.parse(req.body.toString('utf8'));
  // ... process event (see Idempotency below) ...

  return res.status(200).send('ok');
});
```

### Python (FastAPI)

```python
from fastapi import FastAPI, Request, HTTPException
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.exceptions import InvalidSignature
import base64
import os
import json

app = FastAPI()
PUBLIC_KEY = serialization.load_pem_public_key(
    os.environ["BORDERLESS_WEBHOOK_PUBLIC_KEY"].encode()
)

@app.post("/webhooks/borderless")
async def borderless_webhook(request: Request):
    signature = request.headers.get("x-signature")
    if not signature:
        raise HTTPException(401, "Missing signature")

    raw_body = await request.body()

    try:
        PUBLIC_KEY.verify(
            base64.b64decode(signature),
            raw_body,
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
    except InvalidSignature:
        raise HTTPException(401, "Invalid signature")

    event = json.loads(raw_body)
    # ... process event ...
    return {"ok": True}
```

### Go (net/http)

```go
package main

import (
    "crypto"
    "crypto/rsa"
    "crypto/sha256"
    "crypto/x509"
    "encoding/base64"
    "encoding/pem"
    "io"
    "net/http"
    "os"
)

var publicKey *rsa.PublicKey

func init() {
    block, _ := pem.Decode([]byte(os.Getenv("BORDERLESS_WEBHOOK_PUBLIC_KEY")))
    pub, _ := x509.ParsePKIXPublicKey(block.Bytes)
    publicKey = pub.(*rsa.PublicKey)
}

func borderlessWebhook(w http.ResponseWriter, r *http.Request) {
    sig := r.Header.Get("x-signature")
    if sig == "" {
        http.Error(w, "missing signature", http.StatusUnauthorized)
        return
    }
    body, _ := io.ReadAll(r.Body)

    sigBytes, err := base64.StdEncoding.DecodeString(sig)
    if err != nil {
        http.Error(w, "bad signature encoding", http.StatusUnauthorized)
        return
    }
    hashed := sha256.Sum256(body)
    if err := rsa.VerifyPKCS1v15(publicKey, crypto.SHA256, hashed[:], sigBytes); err != nil {
        http.Error(w, "invalid signature", http.StatusUnauthorized)
        return
    }
    // parse body and process event
    w.WriteHeader(http.StatusOK)
}
```

## Idempotency on your side

Borderless retries failed deliveries (non-200 response, network error, timeout). You may receive the **same event more than once**.

**Rule:** Use the event's `id` as an idempotency key. On receipt:

1. Insert the `id` into a dedupe table (unique constraint).
2. If the insert succeeds → process the event.
3. If the insert fails on unique violation → already processed; return 200 without reprocessing.

Process events transactionally so a mid-processing crash doesn't leave partial state with a consumed dedupe row.

## Delivery behavior

- **Expected response:** HTTP 200 within a reasonable timeout. Anything else is a failure.
- **Retries:** Borderless retries several times on failure.
- **Auto-disable:** After exhausting retries, the webhook is marked `enabled: false` and delivery stops. Re-enable via `PATCH /notifications/webhooks/settings/{id}` with `{ "url": "...", "enabled": true }`.
- **Ordering:** Not guaranteed. Design handlers to be tolerant of out-of-order events for the same transaction.
- **Filtering:** Not currently server-side configurable. You receive all events for your organization and must filter client-side by `event_type` and `operation_type`.

## Event and operation types

### Event types

The OpenAPI spec doesn't publish a closed event-type enum, so the list below is what's documented + observed. Treat unknown event types as **non-fatal** in your handler — log and 200, don't throw.

- `Transaction_Created`
- `Transaction_Updated`
- `VirtualAccount_Created`
- `VirtualAccount_CreationFailed`
- `IdentityComplianceCheck_Updated`
- `IdentityComplianceCheck_Completed`

### Operation types (for transaction events)

- `Deposit`
- `Withdrawal`
- `Transfer`
- `TransferToExternalWallet`
- `Swap`
- `Approval`

Branch your handler on `event_type` first, then on operation type for transaction events.

### Inspecting recent webhook deliveries

```bash
GET /v1/notifications/webhooks/events
```

Returns a paginated `{data: [WebhookEventEntity], hasMore}` log of recent deliveries with their status (`Pending` / `Retry` / `Failed` / `Completed`) and `failureReason`. Useful for debugging a misbehaving endpoint without standing up extra logging — you can see exactly which events Borderless tried to deliver and what came back.

## Handler skeleton

```javascript
async function handleEvent(event) {
  const already = await db.tryInsertEventId(event.id); // unique-constraint dedupe
  if (!already) return;

  switch (event.event_type) {
    case 'Transaction_Updated':
    case 'Transaction_Created':
      await handleTransaction(event);
      break;
    case 'IdentityComplianceCheck_Updated':
    case 'IdentityComplianceCheck_Completed':
      await handleCompliance(event);
      break;
    case 'VirtualAccount_Created':
    case 'VirtualAccount_CreationFailed':
      await handleVirtualAccount(event);
      break;
    default:
      // Log unknown event type, still return 200.
      logger.warn({ event_type: event.event_type }, 'unknown event');
  }
}
```

## Common pitfalls when generating code

- **Parsing JSON before verifying.** Signature is over raw bytes. Parse only after verification.
- **Re-serializing the body.** `JSON.parse(req.body).then(JSON.stringify)` changes bytes. Always verify against the original request body buffer.
- **Treating auto-disable as an error.** It's expected if your endpoint is unreachable. Add monitoring for the `enabled` flag.
- **Ignoring the event ID.** Without dedupe, retries will double-process events — especially dangerous for ledger entries or user notifications.
- **Blocking the response on downstream work.** Acknowledge with 200 quickly, then do heavy processing asynchronously (queue + worker). Webhooks that take >5–10s risk timing out and triggering retries.
- **Hardcoding the public key in source.** It can be rotated. Read from env/config.

## Testing

For local development, use a tunneling service (ngrok, Cloudflare Tunnel) to expose your local webhook endpoint to Borderless sandbox. Sandbox PFIs simulate state transitions that fire real webhook events.

## Reference implementation

See `/examples/webhooks/` in this repo for a complete Express handler with raw-body signature verification, in-memory event-id dedupe (with a note on swapping for a DB unique constraint in production), and event-type routing.

## Full reference

- Webhook docs: https://docs.borderless.xyz/docs/webhooks.md
- Webhook API endpoints: https://docs.borderless.xyz/llms.txt (search for `webhooks`)
