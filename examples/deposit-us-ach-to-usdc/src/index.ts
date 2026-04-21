// src/index.ts
// Entry point. Reads env, sets corridor, runs a deposit.

import 'dotenv/config';
import { runDeposit, type Corridor } from './deposit.js';

// FORK HERE — change this corridor to match the PFI your organization has
// configured. Run /borderless-coverage to see what's available.
const CORRIDOR: Corridor = {
  country: 'US',
  fiat: 'USD',
  asset: 'USDC_POLYGON',
  paymentMethod: 'ACH',
};

async function main(): Promise<void> {
  const accountId = requireEnv('BORDERLESS_ACCOUNT_ID');
  const amount = process.env.DEPOSIT_AMOUNT ?? '10.00';

  // Use a stable operation name so repeated runs reuse the same idempotency
  // key and don't create duplicate transactions. In a real system, use your
  // own order / invoice / payout id.
  const operation = `example-deposit:${accountId}:${amount}`;

  await runDeposit({
    corridor: CORRIDOR,
    amount,
    accountId,
    operation,
  });
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
