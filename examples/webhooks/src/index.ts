// src/index.ts
// Entry point. Reads env, starts the server.

import 'dotenv/config';
import { createServer } from './server.js';

const PORT = Number(process.env.PORT ?? 3000);
const PUBLIC_KEY = process.env.BORDERLESS_WEBHOOK_PUBLIC_KEY;

if (!PUBLIC_KEY) {
  console.error(
    'Missing BORDERLESS_WEBHOOK_PUBLIC_KEY. Fetch it from GET /v1/notifications/webhooks/settings/public-key and set it in .env.',
  );
  process.exit(1);
}

const app = createServer(PUBLIC_KEY);

app.listen(PORT, () => {
  console.log(`Borderless webhook handler listening on :${PORT}/webhooks/borderless`);
});
