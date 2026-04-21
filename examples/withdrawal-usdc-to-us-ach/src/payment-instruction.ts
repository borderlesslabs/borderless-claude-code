// src/payment-instruction.ts
// Creates a US/USD/ACH payment instruction, or returns one already persisted
// in env. Payment instructions can be reused for repeat payouts to the same
// beneficiary — don't re-create on every withdrawal.

import { borderless } from './client.js';

type PaymentInstruction = {
  id: string;
  country: string;
  currency: string;
  paymentMethod: string;
  name: string;
};

export async function getOrCreatePaymentInstruction(
  identityId: string,
): Promise<PaymentInstruction> {
  const existing = process.env.BORDERLESS_PAYMENT_INSTRUCTION_ID;
  if (existing) {
    const pi = await borderless<PaymentInstruction>(
      `/identities/${identityId}/payment-instructions/${existing}`,
    );
    console.log(`Reusing payment instruction ${pi.id} (${pi.name})`);
    return pi;
  }

  const pi = await borderless<PaymentInstruction>(
    `/identities/${identityId}/payment-instructions`,
    {
      method: 'POST',
      operation: `payment-instruction:${identityId}:primary-us-ach`,
      body: {
        country: 'US',
        currency: 'USD',
        name: 'Primary US ACH',
        paymentMethod: 'ACH',
        details: {
          bankName: 'Example Bank',
          accountHolderName: 'Sandbox Beneficiary',
          bankAccountNumber: '123456789012',
          bankRoutingNumber: '123456789',
          bankAccountType: 'Checking',
          address: {
            street1: '123 Market St',
            city: 'San Francisco',
            state: 'CA',
            country: 'US',
            postalCode: '94103',
          },
        },
      },
    },
  );

  console.log(
    `Created payment instruction ${pi.id}. Persist this id and set BORDERLESS_PAYMENT_INSTRUCTION_ID=${pi.id} in your .env to reuse on subsequent runs.`,
  );
  return pi;
}
