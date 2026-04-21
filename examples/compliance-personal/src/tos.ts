// src/tos.ts
// Enforces PFI Terms of Service acceptance. Prints the link, tries to open
// it in the default browser, then polls until metadata.hasAcceptedTos is true
// or the timeout is reached.

import { spawn } from 'node:child_process';
import type { Corridor } from './compliance.js';
import { fetchComplianceCheck } from './compliance.js';

type ComplianceCheck = {
  slug: string;
  metadata?: {
    tosLink?: string | null;
    hasAcceptedTos?: boolean;
  };
};

export async function enforceTosIfNeeded(args: {
  identityId: string;
  corridor: Corridor;
  /** Initial compliance-check response containing metadata. */
  check: ComplianceCheck;
  /** How long to wait for the customer to accept, in ms. Default 5 min. */
  timeoutMs?: number;
  /** Polling interval in ms. Default 5 s. */
  intervalMs?: number;
}): Promise<void> {
  const { identityId, corridor, check } = args;
  const timeoutMs = args.timeoutMs ?? 5 * 60_000;
  const intervalMs = args.intervalMs ?? 5_000;

  const link = check.metadata?.tosLink;
  if (!link) return;

  if (check.metadata?.hasAcceptedTos) {
    console.log('✓ ToS already accepted.');
    return;
  }

  console.log('\nThis PFI requires Terms of Service acceptance before compliance can proceed.');
  console.log(`Open this link and accept:\n\n  ${link}\n`);
  openInBrowser(link);

  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const latest = await fetchComplianceCheck(identityId, corridor);
    if (latest.metadata?.hasAcceptedTos) {
      console.log('✓ ToS accepted.');
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `ToS not accepted within ${timeoutMs / 1000}s. Accept in the browser and re-run with BORDERLESS_IDENTITY_ID=${identityId} set.`,
      );
    }
    process.stdout.write('  waiting for ToS acceptance…\n');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

function openInBrowser(url: string): void {
  // Detect platform and use the native "open URL in default browser" command.
  // Failures are non-fatal — the link is also printed for manual copy.
  const cmds: Array<[string, string[]]> =
    process.platform === 'darwin'
      ? [['open', [url]]]
      : process.platform === 'win32'
        ? [['cmd.exe', ['/C', 'start', '', url]]]
        : [
            ['xdg-open', [url]],
            ['python3', ['-m', 'webbrowser', url]],
          ];

  for (const [cmd, args] of cmds) {
    try {
      const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
      child.on('error', () => {});
      child.unref();
      return;
    } catch {
      // try the next fallback
    }
  }
}
