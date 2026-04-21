// src/onchain-guard.ts
// Safety check: validates the planned on-chain transfer matches the PFI's
// withdrawalOnchainInstruction before broadcasting.
//
// Lost stablecoins are not refundable. Any withdrawal code in your codebase
// must call this before signing / broadcasting a transfer. The
// borderless-integration-reviewer agent flags withdrawal paths that skip it.

import Decimal from 'decimal.js';

export type PlannedTransfer = {
  fromAddress: string;
  toAddress: string;
  amount: string; // decimal string in natural units
  asset: string;  // e.g., "USDC_POLYGON" — must include chain suffix
};

export type PfiInstruction = {
  fromAddress: string;
  toAddress: string;
  amount: string;
  asset: string;
};

export class OnchainGuardError extends Error {
  constructor(public readonly field: string, expected: string, actual: string) {
    super(`Onchain guard: ${field} mismatch — expected '${expected}', got '${actual}'. Refusing to broadcast.`);
    this.name = 'OnchainGuardError';
  }
}

export function assertWithdrawalOnchainMatch(
  planned: PlannedTransfer,
  pfi: PfiInstruction,
): void {
  // Asset + chain — exact string match. Chain is encoded as the suffix.
  if (planned.asset !== pfi.asset) {
    throw new OnchainGuardError('asset', pfi.asset, planned.asset);
  }

  // From address. Case-insensitive for EVM; preserve case for chains that need it.
  if (normalizeAddress(planned.asset, planned.fromAddress) !== normalizeAddress(pfi.asset, pfi.fromAddress)) {
    throw new OnchainGuardError('fromAddress', pfi.fromAddress, planned.fromAddress);
  }

  // Destination address (the PFI's receiving address for this withdrawal).
  if (normalizeAddress(planned.asset, planned.toAddress) !== normalizeAddress(pfi.asset, pfi.toAddress)) {
    throw new OnchainGuardError('toAddress', pfi.toAddress, planned.toAddress);
  }

  // Amount. Decimal comparison — never string / float.
  if (!new Decimal(planned.amount).eq(new Decimal(pfi.amount))) {
    throw new OnchainGuardError('amount', pfi.amount, planned.amount);
  }
}

function normalizeAddress(asset: string, address: string): string {
  // EVM chains: addresses are 40-hex, case-insensitive. Polygon, Base,
  // Ethereum, Arbitrum, Optimism, Avalanche, etc.
  if (isEvm(asset)) return address.toLowerCase();

  // Non-EVM (Solana, Tron, Stellar, etc.): case matters. Compare as-is.
  return address;
}

function isEvm(asset: string): boolean {
  // Assets are "<TOKEN>_<CHAIN>" — pick off the chain suffix.
  const suffix = asset.split('_').slice(1).join('_');
  const evmChains = new Set(['POLYGON', 'BASE', 'ETHEREUM', 'ARBITRUM', 'OPTIMISM', 'AVALANCHE', 'BSC']);
  return evmChains.has(suffix);
}
