// src/index.ts
// Creates a Standalone account for an existing identity with one asset
// attached. Reads the confirmed per-asset address from the response and
// prints the env-var values the deposit / withdrawal examples need.

import 'dotenv/config';
import { borderless } from './client.js';

type AccountAsset = { id: string; asset: string; address: string };

type Account = {
  id: string;
  type: string;
  web3Provider: string;
  name: string;
  identityId: string;
  assets: AccountAsset[];
};

async function main(): Promise<void> {
  const identityId = requireEnv('BORDERLESS_IDENTITY_ID');
  const address = requireEnv('BORDERLESS_STANDALONE_ADDRESS');
  const asset = process.env.ASSET ?? 'USDC_POLYGON';
  const name = process.env.ACCOUNT_NAME ?? 'Sandbox account';

  const account = await borderless<Account>('/accounts', {
    method: 'POST',
    operation: `account:standalone:${identityId}:${asset}`,
    body: {
      name,
      identityId,
      assets: [{ asset, address }],
    },
  });

  const confirmed = account.assets.find((a) => a.asset === asset);
  const fromAddress = confirmed?.address ?? address;

  console.log(`\n✓ Created Standalone account ${account.id}.`);
  console.log(`  asset:       ${asset}`);
  console.log(`  fromAddress: ${fromAddress}`);

  console.log('\nSet these in the downstream examples:\n');
  console.log(`  BORDERLESS_ACCOUNT_ID=${account.id}`);
  console.log(`  BORDERLESS_FROM_ADDRESS=${fromAddress}`);
  console.log('\nThen:');
  console.log('  cd ../deposit-us-ach-to-usdc && npm run deposit');
  console.log('  cd ../withdrawal-usdc-to-us-ach && npm run withdrawal');
  console.log('\nNote: fromAddress is what onchain-guard.ts will enforce on withdrawals.');
  console.log('Sending from a different address results in lost funds the PFI cannot recover.');
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
