// src/server.ts
// Express app wiring raw-body capture → signature verification → dedupe → handler.

import express from 'express';
import { verifySignature } from './verify.js';
import { markSeen } from './dedupe.js';
import { routeEvent } from './handlers.js';

export function createServer(publicKeyPem: string): express.Application {
  const app = express();

  // Raw body capture. Do NOT put a JSON parser in front of this route —
  // signature verification is over the exact bytes Borderless signed.
  app.post(
    '/webhooks/borderless',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      const signature = req.header('x-signature');
      const rawBody = req.body as Buffer;

      if (!verifySignature(rawBody, signature, publicKeyPem)) {
        return res.status(401).send('Invalid signature');
      }

      let event: { id?: string; event_type?: string; operation_type?: string };
      try {
        event = JSON.parse(rawBody.toString('utf8'));
      } catch {
        // Valid signature but malformed JSON — treat as a bug on the sender
        // side, return 400 so it's not retried forever.
        return res.status(400).send('Malformed JSON');
      }

      if (!event.id || !event.event_type) {
        return res.status(400).send('Missing id or event_type');
      }

      if (!markSeen(event.id)) {
        // Already processed on a prior delivery. Ack without reprocessing.
        return res.status(200).send('duplicate');
      }

      try {
        await routeEvent(event as Required<Pick<typeof event, 'id' | 'event_type'>>);
        return res.status(200).send('ok');
      } catch (err) {
        // Surface 500 so Borderless retries. Log the event id (never the
        // payload), the error, and return.
        console.error(
          JSON.stringify({
            msg: 'handler error',
            id: event.id,
            event_type: event.event_type,
            error: err instanceof Error ? err.message : String(err),
          }),
        );
        return res.status(500).send('handler error');
      }
    },
  );

  app.get('/health', (_req, res) => res.status(200).send('ok'));

  return app;
}
