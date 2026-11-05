// src/withdrawal.ts
// End-to-end withdrawal orchestration: payment instruction → quote → create →
// capture onchain instruction → validate with onchain-guard → stop.

import Decimal from 'decimal.js';
import { borderless } from './client.js';
import { assertWithdrawalOnchainMatch, type PlannedTransfer } from './onchain-guard.js';

export type Corridor = {
  country: string;
  fiat: string;
  asset: string;
  paymentMethod: string;
};

type Quote = {
  fromAmount: string;
  toAmount: string;
  exchangeRate: string;
  totalFee: string;
};

type WithdrawalOnchainInstruction = {
  asset: string;
  amount: string;
  toAddress: string;
  fromAddress: string;
};

type Withdrawal = {
  id: string;
  type: string;
  status: string;
  withdrawalOnchainInstruction: WithdrawalOnchainInstruction | null;
};

// Enum accepted by POST /withdrawals. Pick the value that matches the
// end-user's actual reason — PFIs use this for AML/travel-rule filings.
export type PaymentPurpose =
  | 'salary payment'
  | 'personal remittance'
  | 'rent payment'
  | 'property purchase'
  | 'owned account abroad'
  | 'advertising expenses'
  | 'advisory fees'
  | 'business insurance'
  | 'construction'
  | 'delivery fees'
  | 'education'
  | 'exports'
  | 'donation'
  | 'hotel'
  | 'loan payment'
  | 'maintenance expenses'
  | 'medical expense'
  | 'office expenses'
  | 'royalty fees'
  | 'service charge'
  | 'shares investment'
  | 'tax payment'
  | 'transportation fees'
  | 'travel'
  | 'utility bills'
  | 'other';

export async function runWithdrawal(args: {
  corridor: Corridor;
  amount: string;
  accountId: string;
  fromAddress: string;
  paymentInstructionId: string;
  operation: string;
  paymentPurpose?: PaymentPurpose;
}): Promise<{ transaction: Withdrawal; planned: PlannedTransfer }> {
  const {
    corridor,
    amount,
    accountId,
    fromAddress,
    paymentInstructionId,
    operation,
    paymentPurpose = 'personal remittance',
  } = args;

  // 1. Quote (estimate only).
  const quote = await borderless<Quote>('/withdrawals/quotes', {
    query: {
      country: corridor.country,
      fiat: corridor.fiat,
      asset: corridor.asset,
      paymentMethod: corridor.paymentMethod,
      fromAmount: amount,
    },
  });
  console.log(
    `Estimated: ${new Decimal(amount).toString()} ${corridor.asset} → ~${new Decimal(quote.toAmount).toString()} ${corridor.fiat} (fee ~${new Decimal(quote.totalFee).toString()})`,
  );

  // 2. Create withdrawal. paymentPurpose is required — the PFI uses it for
  // AML / travel-rule filings.
  const created = await borderless<Withdrawal>('/withdrawals', {
    method: 'POST',
    operation: `${operation}:create`,
    body: {
      fiat: corridor.fiat,
      country: corridor.country,
      asset: corridor.asset,
      amount,
      accountId,
      paymentInstructionId,
      paymentPurpose,
    },
  });
  console.log(`Created withdrawal ${created.id} (status: ${created.status})`);

  // 3. withdrawalOnchainInstruction starts null and populates asynchronously.
  // Poll the transaction until it's present. Never broadcast without it.
  const tx = await waitForOnchainInstruction(created);

  // 4. Build planned transfer and validate.
  const planned: PlannedTransfer = {
    fromAddress,
    toAddress: tx.withdrawalOnchainInstruction!.toAddress,
    amount: tx.withdrawalOnchainInstruction!.amount,
    asset: corridor.asset,
  };

  assertWithdrawalOnchainMatch(planned, tx.withdrawalOnchainInstruction!);
  console.log('✓ Onchain guard passed. Planned transfer matches PFI instruction.');

  return { transaction: tx, planned };
}

async function waitForOnchainInstruction(
  tx: Withdrawal,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<Withdrawal> {
  if (tx.withdrawalOnchainInstruction) return tx;

  const intervalMs = opts.intervalMs ?? 5_000;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const latest = await borderless<Withdrawal>(`/transactions/${tx.id}`);
    if (latest.withdrawalOnchainInstruction) return latest;
    if (Date.now() >= deadline) {
      throw new Error(
        `withdrawalOnchainInstruction did not populate within ${timeoutMs / 1000}s for ${tx.id}. Do not broadcast. Resume with GET /transactions/${tx.id} or subscribe to Transaction_Updated webhooks.`,
      );
    }
    console.log('  waiting for withdrawalOnchainInstruction…');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
