// Minimal read-only ZIP reader (stored + deflate, no ZIP64, no encryption). It exists so the
// harness can read Playwright trace archives without an extra dependency or an `unzip` binary.
// Central-directory sizes are authoritative; inflated size is bounded and checked.
import { inflateRawSync } from 'node:zlib';

export type ZipEntry = { name: string; method: number; compressedSize: number; size: number; offset: number };

export const ZIP_LIMITS = { maxEntries: 5_000, maxEntryBytes: 64 * 1024 * 1024 } as const;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

export function listZipEntries(buf: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('end of central directory not found');
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new ZipError('ZIP64 is not supported');
  if (count > ZIP_LIMITS.maxEntries) throw new ZipError('too many entries');
  const out: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ZipError('bad central directory entry');
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    out.push({ name, method, compressedSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export function readZipEntry(buf: Buffer, entry: ZipEntry): Buffer {
  if (entry.size > ZIP_LIMITS.maxEntryBytes) throw new ZipError('entry too large');
  const o = entry.offset;
  if (o + 30 > buf.length || buf.readUInt32LE(o) !== 0x04034b50) throw new ZipError('bad local header');
  const start = o + 30 + buf.readUInt16LE(o + 26) + buf.readUInt16LE(o + 28);
  const raw = buf.subarray(start, start + entry.compressedSize);
  if (raw.length !== entry.compressedSize) throw new ZipError('truncated entry');
  let data: Buffer;
  if (entry.method === 0) data = Buffer.from(raw);
  else if (entry.method === 8) data = inflateRawSync(raw, { maxOutputLength: ZIP_LIMITS.maxEntryBytes });
  else throw new ZipError(`unsupported compression method ${entry.method}`);
  if (data.length !== entry.size) throw new ZipError('entry size mismatch');
  return data;
}
