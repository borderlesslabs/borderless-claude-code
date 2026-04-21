// src/deposit.ts
// End-to-end deposit orchestration: quote → create → poll instructions →
// poll until status terminal.

import Decimal from 'decimal.js';
import { borderless } from './client.js';

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
  orchestrationFee: string;
};

type Transaction = {
  id: string;
  type: string;
  status:
    | 'Submitted'
    | 'Verifying'
    | 'Orchestrating'
    | 'Pending'
    | 'Processing'
    | 'Completed'
    | 'Failed'
    | 'Cancelled';
  instructions: unknown | null;
  depositInstruction: unknown | null;
  failureReason?: string;
};

export async function runDeposit(args: {
  corridor: Corridor;
  amount: string;
  accountId: string;
  /** Your own operation identifier — persisted as the idempotency-key namespace. */
  operation: string;
}): Promise<Transaction> {
  const { corridor, amount, accountId, operation } = args;

  // 1. Quote (estimate only — never used for settlement).
  const quote = await borderless<Quote>('/deposits/quotes', {
    query: {
      country: corridor.country,
      fiat: corridor.fiat,
      asset: corridor.asset,
      paymentMethod: corridor.paymentMethod,
      fromAmount: amount,
    },
  });
  console.log(
    `Estimated: ${new Decimal(amount).toString()} ${corridor.fiat} → ~${new Decimal(quote.toAmount).toString()} ${corridor.asset} (fee ~${new Decimal(quote.totalFee).toString()})`,
  );

  // 2. Create the deposit.
  const created = await borderless<Transaction>('/deposits', {
    method: 'POST',
    operation: `${operation}:create`,
    body: {
      fiat: corridor.fiat,
      amount,
      asset: corridor.asset,
      accountId,
      paymentMethod: corridor.paymentMethod,
      country: corridor.country,
    },
  });
  console.log(`Created deposit ${created.id} (status: ${created.status})`);

  // 3. Poll for instructions if KYC was still settling at the PFI.
  let tx = created;
  if (tx.instructions === null && tx.depositInstruction === null) {
    tx = await pollUntil(
      () => borderless<Transaction>(`/transactions/${tx.id}`),
      (t) => t.instructions !== null || t.depositInstruction !== null || isTerminal(t.status),
      { intervalMs: 5_000, timeoutMs: 120_000, label: 'instructions' },
    );
  }

  if (tx.instructions || tx.depositInstruction) {
    // Sandbox: these are the PFI's fake test bank details — safe to log so the
    // customer can see what a real originator would follow. In production, pipe
    // them to your UI instead of stdout.
    console.log('Payment instructions (forward these to the originator verbatim):');
    console.log(JSON.stringify(tx.instructions ?? tx.depositInstruction, null, 2));
  }

  // 4. Poll to terminal status.
  tx = await pollUntil(
    () => borderless<Transaction>(`/transactions/${tx.id}`),
    (t) => isTerminal(t.status),
    { intervalMs: 10_000, timeoutMs: 120_000, label: 'status' },
  );

  console.log(`Deposit ${tx.id} → ${tx.status}${tx.failureReason ? ` (${tx.failureReason})` : ''}`);
  return tx;
}

function isTerminal(status: Transaction['status']): boolean {
  return status === 'Completed' || status === 'Failed' || status === 'Cancelled';
}

async function pollUntil<T>(
  fetcher: () => Promise<T>,
  done: (t: T) => boolean,
  opts: { intervalMs: number; timeoutMs: number; label: string },
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const result = await fetcher();
    if (done(result)) return result;

    if (Date.now() - start >= opts.timeoutMs) {
      console.log(
        `Polling for ${opts.label} exceeded ${opts.timeoutMs / 1000}s — returning last known state. Resume via GET /transactions/{id} or webhooks.`,
      );
      return result;
    }

    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
}
