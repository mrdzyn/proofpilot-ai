// C3-B2B P2 — Zone P: strict, read-only loader and exact validator for a stored proposal artifact.
//
// Reads exactly `.proofpilot/evidence/proposals/<runId>/proposal.json` as untrusted data and validates it
// against the closed `ProposalArtifact` schema (specification section 3.2). Refuses symlinks, non-regular
// files, files not owned by the current user or visible to group/other, files over 8 KiB, malformed JSON,
// duplicate keys, prototype-pollution keys and nesting deeper than 3. Rebuilds the canonical JSON from the
// validated adjustments only, runs it through the host closed-grammar parser and requires the freshly
// rendered CSS to equal the stored `renderedCss` byte for byte (section 3.4). Returns a frozen plain object
// of validated triples plus provenance labels; nothing here executes, stages or verifies a proposal.
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { MAX_ADJUSTMENTS, type CssAdjustment } from '../../core/src/css-adjustments.ts';
import { parseProposal } from '../../core/src/patch-proposal.ts';
import { isValidRunId } from '../../intake/src/consent.ts';

export type ArtifactErrorCode =
  | 'ARTIFACT_RUN_ID_INVALID' | 'ARTIFACT_NOT_FOUND' | 'ARTIFACT_SYMLINK' | 'ARTIFACT_NOT_REGULAR'
  | 'ARTIFACT_OWNERSHIP_UNVERIFIABLE' | 'ARTIFACT_OWNERSHIP' | 'ARTIFACT_PERMISSIONS' | 'ARTIFACT_TOO_LARGE'
  | 'ARTIFACT_MALFORMED' | 'ARTIFACT_DUPLICATE_KEY' | 'ARTIFACT_PROTO_KEY' | 'ARTIFACT_MAX_DEPTH'
  | 'ARTIFACT_UNKNOWN_FIELD' | 'ARTIFACT_MISSING_FIELD' | 'ARTIFACT_BAD_TYPE' | 'ARTIFACT_BAD_VALUE'
  | 'ARTIFACT_RUN_ID_MISMATCH' | 'ARTIFACT_GRAMMAR' | 'ARTIFACT_RENDER_MISMATCH' | 'ARTIFACT_UNSTABLE'
  | 'ARTIFACT_CHANGED';

export class ArtifactError extends Error {
  readonly code: ArtifactErrorCode;
  constructor(code: ArtifactErrorCode, message: string) {
    super(message);
    this.name = 'ArtifactError';
    this.code = code;
  }
}
const fail = (code: ArtifactErrorCode, message: string): never => {
  throw new ArtifactError(code, message);
};

/** Refuse anything but a small regular file: symlinks, directories and oversized files are not artifacts. */
const MAX_ARTIFACT_BYTES = 8 * 1024;
/** Defensive string bounds; the closed grammar is the real gate for triple values. */
const MAX_TRIPLE_CHARS = 200;
const MAX_RENDERED_CSS_CHARS = 4_096;
const MAX_STAMP_CHARS = 100;

const TOP_KEYS = ['schemaVersion', 'label', 'provenance', 'runId', 'providerId', 'requestedModel', 'respondedModel', 'inputSha256', 'outputSha256', 'outputBytes', 'status', 'reason', 'forbiddenClass', 'adjustments', 'renderedCss', 'requestId', 'usage', 'lifecycle', 'limits', 'slot', 'createdAt'];
const USAGE_KEYS = ['inputTokens', 'outputTokens', 'totalTokens', 'reasoningTokens', 'videoFramesProcessed'];
const LIFECYCLE_KEYS = ['status', 'errorCode', 'incompleteReason', 'refusal', 'completed'];
const LIMITS_KEYS = ['maxInputChars', 'maxOutputTokens'];
const TRIPLE_KEYS = ['selector', 'property', 'value'];

const PROPOSAL_LABEL = 'UNTRUSTED PROPOSAL — NOT VERIFIED';
const HEX64 = /^[0-9a-f]{64}$/;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,100}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const POLLUTED = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 3;

export type ValidatedAdjustment = { readonly selector: string; readonly property: string; readonly value: string };
export type ValidatedUsage = { readonly inputTokens: number | null; readonly outputTokens: number | null; readonly totalTokens: number | null; readonly reasoningTokens: number | null; readonly videoFramesProcessed: number | null };

/** Frozen validated triples plus provenance labels (strings and numbers only). */
/**
 * Portable identity snapshot for TOCTOU binding: device + inode pin the filesystem object,
 * size/mode/owner/mtime pin its state. Pure data, no handles: the binding decision below is a
 * pure function of snapshots, so adversarial orderings are unit-testable without timing.
 */
export type PathIdentity = { dev: number; ino: number; size: number; mode: number; uid: number; mtimeMs: number };
export const identitySnapshotOf = (st: { dev: number; ino: number; size: number; mode: number; uid: number; mtimeMs: number }): PathIdentity =>
  ({ dev: st.dev, ino: st.ino, size: st.size, mode: st.mode, uid: st.uid, mtimeMs: st.mtimeMs });

/**
 * Verify the post-read binding: every ancestor must still be the same filesystem object as at
 * pre-open time (catches a directory renamed or replaced mid-read), the open descriptor must be
 * unchanged, and the descriptor must be the same object the trusted path resolves to now
 * (catches a swap installed after the pre-open checks and reverted before the post-read
 * checks). Returns null when bound, otherwise the fail-closed refusal code.
 *
 * What this cannot do: authenticate CONTENT against a same-UID writer. A pre-installed swap, a
 * same-path file replacement, or a direct rewrite with restored metadata passes every stat
 * comparison by construction. Content authenticity needs an external trust root (a signature)
 * or OS isolation (read-only snapshot, separate UID); see the SEC-P2-01 findings.
 */
export function verifyReadBinding(
  pre: { ancestors: PathIdentity[]; handle: PathIdentity },
  post: { ancestors: PathIdentity[]; handle: PathIdentity; resolved: PathIdentity | null },
): ArtifactErrorCode | null {
  if (pre.ancestors.length !== post.ancestors.length) return 'ARTIFACT_UNSTABLE';
  for (let i = 0; i < pre.ancestors.length; i++) {
    const a = pre.ancestors[i]!;
    const b = post.ancestors[i]!;
    if (a.dev !== b.dev || a.ino !== b.ino) return 'ARTIFACT_UNSTABLE';
  }
  if (!sameIdentity(pre.handle, post.handle)) return 'ARTIFACT_UNSTABLE';
  if (post.resolved === null || !sameIdentity(post.handle, post.resolved)) return 'ARTIFACT_UNSTABLE';
  return null;
}

export type ValidatedProposal = {
  readonly runId: string;
  readonly providerId: 'meta';
  readonly requestedModel: string;
  readonly respondedModel: string;
  readonly inputSha256: string;
  readonly outputSha256: string | null;
  readonly outputBytes: number | null;
  readonly requestId: string | null;
  readonly usage: ValidatedUsage;
  readonly slot: number;
  readonly createdAt: string;
  readonly adjustments: readonly ValidatedAdjustment[];
  readonly renderedCss: string;
  /** SHA-256 of the exact file bytes that were validated. */
  readonly artifactHash: string;
};

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------- strict structural pre-scan

type Cursor = { i: number };
type ScanResult = { ok: true } | { ok: false; code: ArtifactErrorCode; message: string };
const scanFail = (code: ArtifactErrorCode, message: string): ScanResult => ({ ok: false, code, message });

function scanWs(text: string, c: Cursor): void {
  while (c.i < text.length) {
    const ch = text[c.i]!;
    if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') return;
    c.i++;
  }
}

/** Decode one JSON string starting at its opening quote; null when the literal is malformed. */
function scanString(text: string, c: Cursor): string | null {
  let out = '';
  c.i++; // opening quote
  for (;;) {
    const ch = text[c.i];
    if (ch === undefined) return null;
    if (ch === '"') { c.i++; return out; }
    if (ch === '\\') {
      const e = text[c.i + 1];
      if (e === undefined) return null;
      if (e === 'u') {
        const hex = text.slice(c.i + 2, c.i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
        const hi = parseInt(hex, 16);
        c.i += 6;
        if (hi >= 0xd800 && hi <= 0xdbff) {
          const lo = /^\\u([0-9a-fA-F]{4})/.exec(text.slice(c.i, c.i + 6));
          if (!lo) return null;
          const low = parseInt(lo[1]!, 16);
          if (low < 0xdc00 || low > 0xdfff) return null;
          out += String.fromCodePoint((hi - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000);
          c.i += 6;
          continue;
        }
        if (hi >= 0xdc00 && hi <= 0xdfff) return null;
        out += String.fromCodePoint(hi);
        continue;
      }
      const simple: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
      const rep = simple[e];
      if (rep === undefined) return null;
      out += rep;
      c.i += 2;
      continue;
    }
    if (ch < ' ') return null;
    out += ch;
    c.i++;
  }
}

function scanNumber(text: string, c: Cursor): boolean {
  const rest = text.slice(c.i);
  const m = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(rest);
  if (!m) return false;
  c.i += m[0].length;
  return true;
}

function scanLiteral(text: string, c: Cursor): boolean {
  for (const lit of ['true', 'false', 'null']) {
    if (text.startsWith(lit, c.i)) {
      c.i += lit.length;
      return true;
    }
  }
  return false;
}

/** Scan one JSON value; `depth` is the nesting level of the container being entered (root = 1). */
function scanValue(text: string, c: Cursor, depth: number): ScanResult {
  scanWs(text, c);
  const ch = text[c.i];
  if (ch === undefined) return scanFail('ARTIFACT_MALFORMED', 'the file ends mid-value');
  if (ch === '{' || ch === '[') {
    if (depth + 1 > MAX_DEPTH) return scanFail('ARTIFACT_MAX_DEPTH', 'the file nests deeper than 3 levels');
    return scanContainer(text, c, ch, depth + 1);
  }
  if (ch === '"') return scanString(text, c) === null ? scanFail('ARTIFACT_MALFORMED', 'a string literal is malformed') : { ok: true };
  if (ch === '-' || (ch >= '0' && ch <= '9')) return scanNumber(text, c) ? { ok: true } : scanFail('ARTIFACT_MALFORMED', 'a number literal is malformed');
  return scanLiteral(text, c) ? { ok: true } : scanFail('ARTIFACT_MALFORMED', `unexpected character ${JSON.stringify(ch)}`);
}

function scanContainer(text: string, c: Cursor, open: '{' | '[', depth: number): ScanResult {
  const close = open === '{' ? '}' : ']';
  const seen = new Set<string>();
  c.i++; // opening bracket
  scanWs(text, c);
  if (text[c.i] === close) { c.i++; return { ok: true }; }
  for (;;) {
    if (open === '{') {
      scanWs(text, c);
      if (text[c.i] !== '"') return scanFail('ARTIFACT_MALFORMED', 'an object key is not a string');
      const key = scanString(text, c);
      if (key === null) return scanFail('ARTIFACT_MALFORMED', 'an object key is malformed');
      if (POLLUTED.has(key)) return scanFail('ARTIFACT_PROTO_KEY', `forbidden object key ${JSON.stringify(key)}`);
      if (seen.has(key)) return scanFail('ARTIFACT_DUPLICATE_KEY', `duplicate object key ${JSON.stringify(key)}`);
      seen.add(key);
      scanWs(text, c);
      if (text[c.i] !== ':') return scanFail('ARTIFACT_MALFORMED', 'an object entry misses its colon');
      c.i++;
    }
    const v = scanValue(text, c, depth);
    if (!v.ok) return v;
    scanWs(text, c);
    const next = text[c.i];
    if (next === ',') { c.i++; continue; }
    if (next === close) { c.i++; return { ok: true }; }
    return scanFail('ARTIFACT_MALFORMED', 'an array or object is not closed as expected');
  }
}

/** Fail-closed structural scan: the whole text must be exactly one JSON value within the depth bound,
 *  with decoded duplicate and pollution keys refused. Values are still built by `JSON.parse`. */
function scanStructure(text: string): ScanResult {
  const c: Cursor = { i: 0 };
  const v = scanValue(text, c, 0);
  if (!v.ok) return v;
  scanWs(text, c);
  if (c.i !== text.length) return scanFail('ARTIFACT_MALFORMED', 'trailing characters after the JSON value');
  return { ok: true };
}

// ---------------------------------------------------------------- read-only loader (section 3.1)

const artifactPathFor = (repoRoot: string, runId: string): string => join(repoRoot, '.proofpilot/evidence/proposals', runId, 'proposal.json');

/** Identity of the current user for the ownership check; null when it cannot be determined (fail closed). */
function currentUid(): number | null {
  try {
    const get = (process as NodeJS.Process & { getuid?: () => number }).getuid;
    return typeof get === 'function' ? get.call(process) : null;
  } catch {
    return null;
  }
}

/** Descriptor-pinned identity: dev, inode, size, mode, owner and mtime must not change mid-read. */
type FileIdentity = PathIdentity;
const sameIdentity = (a: FileIdentity, b: FileIdentity): boolean =>
  a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mode === b.mode && a.uid === b.uid && a.mtimeMs === b.mtimeMs;

const checkDescriptorStat = (st: { isFile(): boolean; size: number; mode: number; uid: number }): void => {
  if (!st.isFile()) return fail('ARTIFACT_NOT_REGULAR', 'the artifact must be a regular file');
  if (st.size > MAX_ARTIFACT_BYTES) return fail('ARTIFACT_TOO_LARGE', `the artifact exceeds ${MAX_ARTIFACT_BYTES} bytes`);
  if ((st.mode & 0o077) !== 0) return fail('ARTIFACT_PERMISSIONS', 'the artifact must not be visible to group or other');
  const uid = currentUid();
  if (uid === null) return fail('ARTIFACT_OWNERSHIP_UNVERIFIABLE', 'the current user cannot be determined');
  if (st.uid !== uid) return fail('ARTIFACT_OWNERSHIP', 'the artifact is not owned by the current user');
};

export type PinnedReadHandle = Awaited<ReturnType<typeof open>>;

/**
 * Open a fixed path read-only without following a final-component symlink (shared by the
 * artifact reader and the authentication sidecars, so every Zone P read pins a descriptor
 * before any check). A platform without numeric no-follow flags is refused instead of
 * silently downgraded. Errno maps to artifact codes; authentication callers translate a
 * refusal into `AUTH_UNSIGNED` since a missing or hostile sidecar means unauthenticated.
 */
export async function openNoFollowReadOnly(file: string, notFoundMessage: string): Promise<PinnedReadHandle> {
  // Race-resistant open: a no-follow read-only descriptor pins the file; every check runs
  // against the open descriptor, never the pathname. The flags come from the
  // capability-free `fs.constants` table (the only `node:fs` use in Zone P).
  if (typeof fsConstants.O_RDONLY !== 'number' || typeof fsConstants.O_NOFOLLOW !== 'number' || typeof fsConstants.O_NONBLOCK !== 'number') {
    return fail('ARTIFACT_UNSTABLE', 'this platform cannot open files without following symlinks');
  }
  // O_NONBLOCK keeps a FIFO at the final path from blocking the open; the descriptor stat refuses it.
  try {
    return await open(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
  } catch (e) {
    const errno = (e as NodeJS.ErrnoException)?.code;
    if (errno === 'ELOOP') return fail('ARTIFACT_SYMLINK', 'the path must not be a symlink');
    if (errno === 'EACCES') return fail('ARTIFACT_PERMISSIONS', 'the path is not accessible');
    return fail('ARTIFACT_NOT_FOUND', notFoundMessage);
  }
}

async function readArtifactBytes(repoRoot: string, runId: string): Promise<{ bytes: Buffer; path: string }> {
  if (!isValidRunId(runId) || runId === '.' || runId === '..' || runId.includes('/') || runId.includes('\\')) {
    return fail('ARTIFACT_RUN_ID_INVALID', 'the run id is malformed');
  }
  if (typeof repoRoot !== 'string' || repoRoot.length === 0 || !isAbsolute(repoRoot)) {
    return fail('ARTIFACT_RUN_ID_INVALID', 'the repository root must be an absolute path');
  }
  // Every ancestor component must exist and must not be a symlink; otherwise the fixed path resolves elsewhere.
  // Identities are pinned: the post-read binding refuses any ancestor renamed or replaced mid-read.
  const preAncestors: PathIdentity[] = [];
  let dir = repoRoot;
  const anchor = await lstat(dir).catch(() => null);
  if (!anchor) return fail('ARTIFACT_NOT_FOUND', 'the repository root is missing');
  if (anchor.isSymbolicLink()) return fail('ARTIFACT_SYMLINK', 'the repository root must not be a symlink');
  preAncestors.push(identitySnapshotOf(anchor));
  for (const part of ['.proofpilot', 'evidence', 'proposals', runId]) {
    dir = join(dir, part);
    const st = await lstat(dir).catch(() => null);
    if (!st) return fail('ARTIFACT_NOT_FOUND', `evidence path component ${part} is missing`);
    if (st.isSymbolicLink()) return fail('ARTIFACT_SYMLINK', `evidence path component ${part} must not be a symlink`);
    preAncestors.push(identitySnapshotOf(st));
  }
  const file = artifactPathFor(repoRoot, runId);
  // Race-resistant read: a no-follow read-only descriptor pins the file; every check below runs against
  // the open descriptor, and the post-read identity must match the pre-read one.
  let handle: PinnedReadHandle | null = null;
  try {
    handle = await openNoFollowReadOnly(file, `no proposal artifact at .proofpilot/evidence/proposals/${runId}/proposal.json`);
  } catch (e) {
    const errno = (e as NodeJS.ErrnoException)?.code;
    if (errno === 'ELOOP') return fail('ARTIFACT_SYMLINK', 'the artifact must not be a symlink');
    if (errno === 'EACCES') return fail('ARTIFACT_PERMISSIONS', 'the artifact is not accessible');
    throw e;
  }
  try {
    const before = await handle.stat();
    checkDescriptorStat(before);
    const pinned = identitySnapshotOf(before);
    const bytes = await readBoundedBytes(handle, MAX_ARTIFACT_BYTES);
    if (bytes.length > MAX_ARTIFACT_BYTES) return fail('ARTIFACT_TOO_LARGE', 'the artifact exceeds 8192 bytes while reading');
    if (bytes.length !== pinned.size) return fail('ARTIFACT_UNSTABLE', 'the artifact changed while it was read');
    const after = identitySnapshotOf(await handle.stat());
    if (!sameIdentity(pinned, after)) return fail('ARTIFACT_UNSTABLE', 'the artifact changed while it was read');
    // Post-read binding: no ancestor may have become a symlink, every ancestor must still be the
    // same filesystem object, and the open descriptor must be the object the trusted path resolves
    // to now. This catches mid-read ancestor interference, persistent or reverted. What remains is
    // a same-UID writer controlling file content: a pre-installed swap, a same-path content
    // replacement, or an in-place rewrite with restored metadata. None is detectable by stat
    // comparisons through portable Node APIs (there is no openat); that residual needs an external
    // trust root or OS isolation, not a broader import. See SEC-P2-01 findings.
    const components = ['.proofpilot', 'evidence', 'proposals', runId];
    const postAncestors: PathIdentity[] = [];
    const anchorNow = await lstat(repoRoot).catch(() => null);
    if (!anchorNow) return fail('ARTIFACT_UNSTABLE', 'the repository root vanished while reading');
    postAncestors.push(identitySnapshotOf(anchorNow));
    let dir = repoRoot;
    for (const part of components) {
      dir = join(dir, part);
      const st = await lstat(dir).catch(() => null);
      if (!st) return fail('ARTIFACT_UNSTABLE', `evidence path component ${part} vanished while reading`);
      if (st.isSymbolicLink()) return fail('ARTIFACT_SYMLINK', `evidence path component ${part} must not be a symlink`);
      postAncestors.push(identitySnapshotOf(st));
    }
    const resolvedRoot = await realpath(repoRoot).catch(() => null);
    const resolvedFile = await realpath(file).catch(() => null);
    const expected = resolvedRoot ? join(resolvedRoot, '.proofpilot', 'evidence', 'proposals', runId, 'proposal.json') : null;
    if (!resolvedFile || resolvedFile !== expected) {
      return fail('ARTIFACT_SYMLINK', 'the artifact path does not resolve inside the repository root');
    }
    const resolvedStat = await stat(resolvedFile).catch(() => null);
    const binding = verifyReadBinding(
      { ancestors: preAncestors, handle: pinned },
      { ancestors: postAncestors, handle: after, resolved: resolvedStat ? identitySnapshotOf(resolvedStat) : null },
    );
    if (binding !== null) return fail(binding, 'the artifact path binding changed while it was read');
    return { bytes, path: file };
  } finally {
    await handle.close().catch(() => undefined);
  }
}

/**
 * Read at most `maxTotal + 1` bytes from an open descriptor, so the 8-KiB bound limits allocation even if
 * the file grows after the pre-read stat. The extra probe byte distinguishes exact-size files from growth.
 */
export async function readBoundedBytes(
  handle: { read(buffer: Buffer, offset: number, length: number, position: number): Promise<{ bytesRead: number }> },
  maxTotal: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const want = Math.min(4096, maxTotal + 1 - total);
    if (want <= 0) break;
    const buf = Buffer.alloc(want);
    const { bytesRead } = await handle.read(buf, 0, want, total);
    if (bytesRead === 0) break;
    chunks.push(buf.subarray(0, bytesRead));
    total += bytesRead;
  }
  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------- exact schema validation (section 3.2)

const record = (v: unknown, what: string): Record<string, unknown> => {
  if (!isRecord(v)) return fail('ARTIFACT_BAD_TYPE', `${what} must be an object`);
  return v;
};

const exactKeys = (v: Record<string, unknown>, keys: readonly string[], what: string): void => {
  for (const k of Object.keys(v)) {
    if (!keys.includes(k)) return fail('ARTIFACT_UNKNOWN_FIELD', `${what} has an unexpected field ${JSON.stringify(k)}`);
  }
  for (const k of keys) {
    if (!(k in v)) return fail('ARTIFACT_MISSING_FIELD', `${what} misses required field ${JSON.stringify(k)}`);
  }
};

const boundedString = (v: unknown, max: number, what: string): string => {
  if (typeof v !== 'string') return fail('ARTIFACT_BAD_TYPE', `${what} must be a string`);
  if (v.length > max) return fail('ARTIFACT_BAD_VALUE', `${what} exceeds its bound`);
  return v;
};

const countOrNull = (v: unknown, what: string): number | null => {
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > 1_000_000_000) {
    return fail('ARTIFACT_BAD_VALUE', `${what} must be a non-negative safe integer at most 1000000000 or null`);
  }
  return v;
};

const isAdjustment = (v: unknown): v is CssAdjustment => isRecord(v);

function freeze<T>(v: T): T {
  if (Array.isArray(v)) {
    for (const e of v) freeze(e);
    return Object.freeze(v);
  }
  if (isRecord(v)) {
    for (const e of Object.values(v)) freeze(e as T);
    return Object.freeze(v);
  }
  return v;
}

/** Validate the parsed artifact against the closed schema and rebuild the CSS through the host grammar. */
function validateArtifact(doc: unknown, runId: string, artifactHash: string): ValidatedProposal {
  const top = record(doc, 'the artifact');
  exactKeys(top, TOP_KEYS, 'the artifact');
  if (top.schemaVersion !== 1) return fail('ARTIFACT_BAD_VALUE', 'schemaVersion must be the integer 1');
  if (top.label !== PROPOSAL_LABEL) return fail('ARTIFACT_BAD_VALUE', 'the label is not the untrusted-proposal label');
  if (top.provenance !== 'model-hypothesis') return fail('ARTIFACT_BAD_VALUE', 'provenance must be model-hypothesis');
  if (typeof top.runId !== 'string' || !isValidRunId(top.runId)) return fail('ARTIFACT_BAD_VALUE', 'runId is malformed');
  if (top.runId !== runId) return fail('ARTIFACT_RUN_ID_MISMATCH', 'the artifact answers a different run id');
  if (top.providerId !== 'meta') return fail('ARTIFACT_BAD_VALUE', 'providerId must be meta');
  if (top.requestedModel !== 'muse-spark-1.3' || top.respondedModel !== 'muse-spark-1.3') {
    return fail('ARTIFACT_BAD_VALUE', 'the proposal model must be exactly muse-spark-1.3');
  }
  if (typeof top.inputSha256 !== 'string' || !HEX64.test(top.inputSha256)) return fail('ARTIFACT_BAD_VALUE', 'inputSha256 must be 64 lowercase hex');
  if (!(typeof top.outputSha256 === 'string' ? HEX64.test(top.outputSha256) : top.outputSha256 === null)) {
    return fail('ARTIFACT_BAD_VALUE', 'outputSha256 must be 64 lowercase hex or null');
  }
  if (!(typeof top.outputBytes === 'number' && Number.isSafeInteger(top.outputBytes) && top.outputBytes >= 0 && top.outputBytes <= 2_048) && top.outputBytes !== null) {
    return fail('ARTIFACT_BAD_VALUE', 'outputBytes must be an integer from 0 to 2048 or null');
  }
  if (top.status !== 'PROPOSAL_ACCEPTED') return fail('ARTIFACT_BAD_VALUE', 'status must be PROPOSAL_ACCEPTED');
  if (top.reason !== null || top.forbiddenClass !== null) return fail('ARTIFACT_BAD_VALUE', 'reason and forbiddenClass must be null');
  if (!(typeof top.requestId === 'string' ? REQUEST_ID.test(top.requestId) : top.requestId === null)) {
    return fail('ARTIFACT_BAD_VALUE', 'requestId must match the request-id grammar or be null');
  }
  const usageRaw = record(top.usage, 'usage');
  exactKeys(usageRaw, USAGE_KEYS, 'usage');
  const usage: ValidatedUsage = {
    inputTokens: countOrNull(usageRaw.inputTokens, 'usage.inputTokens'),
    outputTokens: countOrNull(usageRaw.outputTokens, 'usage.outputTokens'),
    totalTokens: countOrNull(usageRaw.totalTokens, 'usage.totalTokens'),
    reasoningTokens: countOrNull(usageRaw.reasoningTokens, 'usage.reasoningTokens'),
    videoFramesProcessed: countOrNull(usageRaw.videoFramesProcessed, 'usage.videoFramesProcessed'),
  };
  const life = record(top.lifecycle, 'lifecycle');
  exactKeys(life, LIFECYCLE_KEYS, 'lifecycle');
  if (life.status !== 'completed' || life.errorCode !== null || life.incompleteReason !== null || life.refusal !== false || life.completed !== true) {
    return fail('ARTIFACT_BAD_VALUE', 'the lifecycle must be exactly completed with no error, refusal or incompleteness');
  }
  const limits = record(top.limits, 'limits');
  exactKeys(limits, LIMITS_KEYS, 'limits');
  if (limits.maxInputChars !== 12_000 || limits.maxOutputTokens !== 3_072) {
    return fail('ARTIFACT_BAD_VALUE', 'limits must equal the approved bounds');
  }
  if (typeof top.slot !== 'number' || !Number.isSafeInteger(top.slot) || top.slot < 1) {
    return fail('ARTIFACT_BAD_VALUE', 'slot must be an integer at least 1');
  }
  const createdAt = boundedString(top.createdAt, MAX_STAMP_CHARS, 'createdAt');
  if (!ISO_UTC.test(createdAt)) return fail('ARTIFACT_BAD_VALUE', 'createdAt must be an ISO-8601 UTC timestamp');
  const instant = Date.parse(createdAt);
  if (Number.isNaN(instant)) return fail('ARTIFACT_BAD_VALUE', 'createdAt must be an ISO-8601 UTC timestamp');
  // Strict round-trip: Date.parse normalizes impossible calendar dates, so the parsed instant must
  // re-emit exactly the stored stamp (allowing the omitted millisecond form).
  const roundTrip = new Date(instant).toISOString();
  const withMillis = /\.\d+Z$/.test(createdAt) ? createdAt : createdAt.replace(/Z$/, '.000Z');
  if (roundTrip !== createdAt && roundTrip !== withMillis) {
    return fail('ARTIFACT_BAD_VALUE', 'createdAt is not a real UTC instant');
  }
  if (!Array.isArray(top.adjustments) || top.adjustments.length < 1 || top.adjustments.length > MAX_ADJUSTMENTS) {
    return fail('ARTIFACT_BAD_VALUE', `adjustments must hold 1 to ${MAX_ADJUSTMENTS} entries`);
  }
  const triples: ValidatedAdjustment[] = top.adjustments.map((entry, n) => {
    if (!isAdjustment(entry)) return fail('ARTIFACT_BAD_TYPE', `adjustments[${n}] must be an object`);
    exactKeys(entry, TRIPLE_KEYS, `adjustments[${n}]`);
    return freeze({
      selector: boundedString(entry.selector, MAX_TRIPLE_CHARS, `adjustments[${n}].selector`),
      property: boundedString(entry.property, MAX_TRIPLE_CHARS, `adjustments[${n}].property`),
      value: boundedString(entry.value, MAX_TRIPLE_CHARS, `adjustments[${n}].value`),
    });
  });

  // section 3.4: the canonical JSON built from the triples only must parse clean and render byte-identical CSS
  const canonical = JSON.stringify({ adjustments: triples.map((t) => ({ selector: t.selector, property: t.property, value: t.value })) });
  const parsed = parseProposal(canonical);
  if (!parsed.ok) return fail('ARTIFACT_GRAMMAR', `the adjustments fail the closed grammar: ${parsed.reason}`);
  const renderedCss = boundedString(top.renderedCss, MAX_RENDERED_CSS_CHARS, 'renderedCss');
  if (renderedCss !== parsed.renderedCss) return fail('ARTIFACT_RENDER_MISMATCH', 'renderedCss differs from the host-rendered CSS');

  return freeze({
    runId: top.runId,
    providerId: 'meta',
    requestedModel: top.requestedModel as string,
    respondedModel: top.respondedModel as string,
    inputSha256: top.inputSha256 as string,
    outputSha256: top.outputSha256 as string | null,
    outputBytes: top.outputBytes as number | null,
    requestId: top.requestId as string | null,
    usage,
    slot: top.slot as number,
    createdAt,
    adjustments: freeze(triples) as readonly ValidatedAdjustment[],
    renderedCss,
    artifactHash,
  });
}

/**
 * Load and validate one stored proposal artifact (sections 3.1, 3.2, 3.4). Synthetic callers only:
 * `repoRoot` is an absolute path and `runId` selects exactly one file under the fixed evidence directory.
 */
/**
 * Re-load and re-validate the artifact and bind it to an earlier read: the reloaded
 * `artifactHash` must equal the hash the caller already validated and registered. A same-UID
 * substitution between two pipeline phases (load → register → run) is refused here instead of
 * silently flowing downstream. Each individual load still enforces the full read binding above.
 */
export async function reloadAndBindArtifact(repoRoot: string, runId: string, expectedHash: string): Promise<ValidatedProposal> {
  const reloaded = await loadAndValidateProposalArtifact({ repoRoot, runId });
  if (reloaded.artifactHash !== expectedHash) return fail('ARTIFACT_CHANGED', 'the artifact changed between validation and use');
  return reloaded;
}

export async function loadAndValidateProposalArtifact(opts: { repoRoot: string; runId: string }): Promise<ValidatedProposal> {
  const { repoRoot, runId } = opts;
  const { bytes } = await readArtifactBytes(repoRoot, runId);
  const text = bytes.toString('utf8');
  const structural = scanStructure(text);
  if (!structural.ok) throw new ArtifactError(structural.code, structural.message);
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return fail('ARTIFACT_MALFORMED', 'the file is not strict JSON');
  }
  return validateArtifact(doc, runId, sha256(bytes));
}
