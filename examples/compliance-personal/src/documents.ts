// src/documents.ts
// Uploads a placeholder document to the identity. Sandbox does not OCR, so
// any valid 200×200 PNG is accepted.

import { borderless } from './client.js';
import { generateGrayPngDataUri } from './placeholder-png.js';

export async function uploadPlaceholderDocument(args: {
  identityId: string;
  issuingCountry: string;
  documentType: string;
}): Promise<void> {
  const imageDataUri = generateGrayPngDataUri(200, 200);

  await borderless(`/identities/${args.identityId}/documents`, {
    method: 'PUT',
    operation: `document:${args.identityId}:${args.documentType}`,
    body: {
      issuingCountry: args.issuingCountry,
      type: args.documentType,
      issuedDate: '2024-01-01',
      expiryDate: '2030-01-01',
      imageFront: imageDataUri,
      imageBack: imageDataUri,
    },
  });

  console.log(`Uploaded placeholder ${args.documentType} (${args.issuingCountry}).`);
}
