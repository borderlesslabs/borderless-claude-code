// src/compliance.ts
// End-to-end compliance orchestration: slug discovery → requirements →
// document upload → ToS → start → poll to terminal.

import { borderless } from './client.js';
import { uploadPlaceholderDocument } from './documents.js';
import { enforceTosIfNeeded } from './tos.js';

export type Corridor = {
  country: string;
  fiat: string;
  asset: string;
  paymentMethod: string;
  type: 'Deposit' | 'Withdrawal';
};

type RequiredDocument = {
  mode: 'oneOf' | 'allOf';
  documents: string[];
};

type Requirements = {
  missingFields?: string[];
  requiredDocuments?: RequiredDocument[];
};

type ComplianceCheck = {
  slug: string;
  // Status values observed in the wild + documented: NotStarted, Started,
  // InProgress, UnderReview, Completed, Approved, Rejected.
  // `Completed` and `Approved` are both terminal success; depending on PFI
  // and code path the field may hold either.
  status: string;
  rejectionReasons?: string[];
  incompleteReasons?: string[];
  metadata?: {
    tosLink?: string | null;
    hasAcceptedTos?: boolean;
  };
};

export async function runCompliance(args: {
  identityId: string;
  corridor: Corridor;
}): Promise<ComplianceCheck> {
  const { identityId, corridor } = args;

  // 1. Discover slug.
  const candidates = await borderless<ComplianceCheck[]>(
    `/identities/${identityId}/compliance-checks`,
    {
      query: {
        country: corridor.country,
        asset: corridor.asset,
        fiat: corridor.fiat,
        paymentMethod: corridor.paymentMethod,
        type: corridor.type,
      },
    },
  );

  if (!candidates.length) {
    throw new Error(
      `No compliance slug returned for corridor ${JSON.stringify(corridor)}. Your sandbox org may not have a PFI configured for this corridor — contact support@borderless.xyz or adjust the corridor in src/index.ts.`,
    );
  }

  const chosen = candidates[0]!;
  const slug = chosen.slug;
  console.log(`Compliance slug for this corridor: ${slug}`);

  // 2. Requirements. Read so the customer sees what production would demand.
  const reqs = await borderless<Requirements>(
    `/identities/${identityId}/compliance-checks/${slug}/requirements`,
  );
  if (reqs.missingFields?.length) {
    console.log(`  missingFields: ${reqs.missingFields.join(', ')}`);
    console.log(
      '  (Patch these onto the identity and re-run. See src/identity.ts for the body shape.)',
    );
  }
  if (reqs.requiredDocuments?.length) {
    const types = reqs.requiredDocuments
      .flatMap((d) => d.documents.map((t) => `${t} (${d.mode})`))
      .join(', ');
    console.log(`  requiredDocuments: ${types}`);
  } else {
    console.log('  requiredDocuments: none for this corridor');
  }

  // 3. Upload placeholder docs if required. Sandbox accepts any valid PNG.
  if (reqs.requiredDocuments?.length) {
    const first = reqs.requiredDocuments[0]!;
    const docType = first.documents[0]!;
    await uploadPlaceholderDocument({
      identityId,
      issuingCountry: corridor.country,
      documentType: docType,
    });
  }

  // 4. ToS acceptance if required.
  await enforceTosIfNeeded({ identityId, corridor, check: chosen });

  // 5. Start the check.
  await borderless(`/identities/${identityId}/compliance-checks/${slug}`, {
    method: 'POST',
    operation: `compliance:start:${identityId}:${slug}`,
  });
  console.log('Started compliance check. Polling for terminal status…');

  // 6. Poll to terminal (2-min timeout).
  // Read state via the list endpoint with corridor query — the singular
  // GET /identities/{id}/compliance-checks/{slug} returns 404.
  const check = await pollUntil(
    () => fetchComplianceCheck(identityId, corridor),
    (c) => isTerminal(c.status),
    { intervalMs: 5_000, timeoutMs: 120_000, label: 'compliance status' },
  );

  if (check.status === 'Rejected') {
    console.log(`✗ Rejected. Reasons: ${check.rejectionReasons?.join('; ') ?? '(none listed)'}`);
  } else if (isTerminal(check.status)) {
    console.log(`✓ Compliance ${check.status}.`);
  } else {
    const query = complianceQuery(corridor);
    console.log(
      `  Still ${check.status}. Re-run with BORDERLESS_IDENTITY_ID set to resume monitoring, or GET /identities/${identityId}/compliance-checks?${query} directly.`,
    );
  }

  return check;
}

export async function fetchComplianceCheck(
  identityId: string,
  corridor: Corridor,
): Promise<ComplianceCheck> {
  const list = await borderless<ComplianceCheck[]>(
    `/identities/${identityId}/compliance-checks`,
    { query: corridorToQuery(corridor) },
  );
  const first = list[0];
  if (!first) {
    throw new Error(
      `Compliance check disappeared for corridor ${JSON.stringify(corridor)}.`,
    );
  }
  return first;
}

function corridorToQuery(corridor: Corridor): Record<string, string> {
  return {
    country: corridor.country,
    asset: corridor.asset,
    fiat: corridor.fiat,
    paymentMethod: corridor.paymentMethod,
    type: corridor.type,
  };
}

function complianceQuery(corridor: Corridor): string {
  return new URLSearchParams(corridorToQuery(corridor)).toString();
}

function isTerminal(status: string): boolean {
  return status === 'Completed' || status === 'Approved' || status === 'Rejected';
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
      console.log(`Polling for ${opts.label} exceeded ${opts.timeoutMs / 1000}s.`);
      return result;
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
}
