// src/placeholder-png.ts
// Generates a valid PNG of configurable dimensions using only Node's zlib.
// No external image library. Used to produce a sandbox-acceptable placeholder
// ID document image.
//
// PNG structure: 8-byte signature + IHDR chunk + IDAT chunk(s) + IEND chunk.
// Each chunk: length (4 bytes BE) + type (4 bytes ASCII) + data + CRC32 of
// (type + data). Pixel data for grayscale is: one filter byte (0 = None) per
// row, then `width` bytes of sample values, zlib-deflated.

import { deflateSync } from 'node:zlib';

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/**
 * Generate a solid-gray PNG of the given dimensions. Returns a Buffer of
 * valid PNG bytes — base64-encode and prefix with `data:image/png;base64,`
 * for the Borderless /documents endpoint.
 */
export function generateGrayPng(width: number, height: number, gray = 200): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // color type: grayscale
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method: adaptive
  ihdr[12] = 0; // interlace: none

  const rowLength = 1 + width; // filter byte + one sample per pixel
  const raw = Buffer.alloc(rowLength * height);
  for (let y = 0; y < height; y++) {
    const offset = y * rowLength;
    raw[offset] = 0; // filter: None
    raw.fill(gray, offset + 1, offset + rowLength);
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function generateGrayPngDataUri(width: number, height: number, gray = 200): string {
  return `data:image/png;base64,${generateGrayPng(width, height, gray).toString('base64')}`;
}
