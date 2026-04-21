// src/index.ts
// Entry point. Creates a personal identity (or reuses one from env) and runs
// compliance for a specific corridor.

import 'dotenv/config';
import { getOrCreateIdentity } from './identity.js';
import { runCompliance, type Corridor } from './compliance.js';

// FORK HERE — change this corridor to match the PFI your organization has
// configured. Run /borderless-coverage to see what's available. Note that
// compliance is slug-scoped to a specific {country, asset, fiat, paymentMethod,
// type} combination — if you plan to deposit AND withdraw on the same corridor,
// run this example twice (once with type: 'Deposit', once with 'Withdrawal').
const CORRIDOR: Corridor = {
  country: 'US',
  fiat: 'USD',
  asset: 'USDC_POLYGON',
  paymentMethod: 'ACH',
  type: 'Deposit',
};

async function main(): Promise<void> {
  const identity = await getOrCreateIdentity();
  const check = await runCompliance({ identityId: identity.id, corridor: CORRIDOR });

  console.log('\nNext:');
  console.log(`  1. Set BORDERLESS_IDENTITY_ID=${identity.id} in the .env files of`);
  console.log('     ../account-setup/, ../deposit-us-ach-to-usdc/, and');
  console.log('     ../withdrawal-usdc-to-us-ach/.');
  console.log('  2. Run ../account-setup/ to create a Standalone account and add the asset.');
  console.log('  3. Run ../deposit-us-ach-to-usdc/ or ../withdrawal-usdc-to-us-ach/.');

  if (check.status !== 'Completed' && check.status !== 'Approved') {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
