// src/index.ts
// Entry point. Reads env, sets corridor, runs a withdrawal up to (not
// including) on-chain broadcast.

import 'dotenv/config';
import { getOrCreatePaymentInstruction } from './payment-instruction.js';
import { runWithdrawal, type Corridor } from './withdrawal.js';

// FORK HERE — change this corridor to match the PFI your organization has
// configured. Run /borderless-coverage to see what's available.
const CORRIDOR: Corridor = {
  country: 'US',
  fiat: 'USD',
  asset: 'USDC_POLYGON',
  paymentMethod: 'ACH',
};

async function main(): Promise<void> {
  const identityId = requireEnv('BORDERLESS_IDENTITY_ID');
  const accountId = requireEnv('BORDERLESS_ACCOUNT_ID');
  const fromAddress = requireEnv('BORDERLESS_FROM_ADDRESS');
  const amount = process.env.WITHDRAWAL_AMOUNT ?? '10';

  const pi = await getOrCreatePaymentInstruction(identityId);

  const operation = `example-withdrawal:${accountId}:${pi.id}:${amount}`;

  const { transaction, planned } = await runWithdrawal({
    corridor: CORRIDOR,
    amount,
    accountId,
    fromAddress,
    paymentInstructionId: pi.id,
    operation,
  });

  console.log('\nExample stops here. To complete the withdrawal:\n');
  console.log('  1. Persist the Borderless transaction id and the planned transfer to your DB:');
  console.log(`     transactionId: ${transaction.id}`);
  console.log(`     planned: ${JSON.stringify(planned)}`);
  console.log('  2. Hand the planned transfer to your wallet provider (Fireblocks, Utila, Dfns, etc.)');
  console.log('     to sign and broadcast on Polygon.');
  console.log('  3. Listen for Transaction_Updated webhooks or poll GET /transactions/{id}');
  console.log('     until status is Completed.');
  console.log('\nDo not broadcast without calling onchain-guard on the planned transfer first.');
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
