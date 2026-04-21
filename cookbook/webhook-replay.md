# Webhook replay — re-enabling an auto-disabled webhook

Borderless auto-disables a webhook after it exhausts its delivery retry budget — non-200 responses, timeouts, or network errors. You see this as `enabled: false` on the webhook settings record. No further events are delivered until you re-enable.

## Re-enable

```bash
curl -X PATCH "$BORDERLESS_BASE_URL/notifications/webhooks/settings/$WEBHOOK_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://yourapp.com/webhooks/borderless","enabled":true}'
```

Re-enabling **does not replay missed events**. You need to reconcile the gap separately — poll `GET /transactions` and `GET /identities/{id}/compliance-checks` for anything that changed state during the disabled window. See `cookbook/reconciliation.md`.

## Before re-enabling — fix what disabled you

Re-enabling a broken endpoint will get you auto-disabled again. Check first:

- **Endpoint returns 200 on valid payloads.** Use `/borderless-test-webhook` to emit a signed payload locally and confirm your handler responds 200. Anything other than 2xx counts as a delivery failure.
- **Endpoint responds quickly.** Borderless waits a bounded time per delivery. If your handler does heavy work inline (DB writes, third-party calls), it may time out. Ack with 200 first, then enqueue for async processing.
- **Endpoint verifies signatures correctly.** If you recently rotated keys via `POST /notifications/webhooks/settings/public-key`, your cached public key is stale — fetch and redeploy. Stale keys silently fail every delivery.
- **Endpoint is actually reachable from the public internet.** Check DNS, TLS cert validity, WAF / IP allowlist rules, and any recent infra changes.

## Prevent it next time

- **Alert on `enabled: false`.** Poll `GET /notifications/webhooks/settings` on a schedule and page if any record flips. The transition happens silently from your side otherwise.
- **Decouple work from ack.** Handler writes the event to a queue (or DB row) and returns 200. A worker processes. Deliveries stay fast and ack regardless of downstream issues.
- **Monitor error rate on your endpoint.** Don't wait for Borderless's retry budget to exhaust; if your endpoint's error rate ticks up, you want to know well before the disable fires.

## Related

- Webhook skill: `.claude/skills/borderless-webhook-verifier/SKILL.md` covers verification, dedupe, and event types.
- Reconciliation after a gap: `cookbook/reconciliation.md`.
- Test locally without a real delivery: `/borderless-test-webhook`.
