// src/identity.ts
// Creates a personal identity with sandbox-valid placeholder data, or returns
// the identity named by BORDERLESS_IDENTITY_ID.

import { borderless } from './client.js';

type Identity = {
  id: string;
  type: 'Personal';
  hasComplianceChecks: boolean;
};

export async function getOrCreateIdentity(): Promise<Identity> {
  const existing = process.env.BORDERLESS_IDENTITY_ID;
  if (existing) {
    const id = await borderless<Identity>(`/identities/${existing}`);
    console.log(`Reusing identity ${id.id}`);
    return id;
  }

  const firstName = process.env.FIRST_NAME ?? 'Sandbox';
  const lastName = process.env.LAST_NAME ?? 'Tester';

  const identity = await borderless<Identity>('/identities/personal', {
    method: 'POST',
    operation: `identity:personal:${firstName}:${lastName}`,
    body: {
      firstName,
      lastName,
      email: `sandbox+${Date.now()}@example.com`,
      dateOfBirth: '1990-01-15',
      taxId: '123-45-6789',
      phone: '+14155551234',
      citizenship: 'US',
      sourceOfFunds: 'Salary',
      accountPurpose: 'PersonalOrLivingExpenses',
      monthlyAmounts: 'LessThan5K',
      actingAsIntermediary: false,
      address: {
        street1: '123 Market St',
        city: 'San Francisco',
        state: 'CA',
        country: 'US',
        postalCode: '94103',
      },
    },
  });

  console.log(`Created personal identity ${identity.id}.`);
  console.log(`Set BORDERLESS_IDENTITY_ID=${identity.id} in your .env to reuse across examples.`);
  return identity;
}
