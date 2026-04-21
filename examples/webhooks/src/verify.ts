// src/verify.ts
// Verifies Borderless webhook signatures against raw request bytes.

import crypto from 'node:crypto';

export function verifySignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  publicKeyPem: string,
): boolean {
  if (!signatureHeader) return false;

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(rawBody);
  verifier.end();

  try {
    return verifier.verify(publicKeyPem, signatureHeader, 'base64');
  } catch {
    return false;
  }
}
