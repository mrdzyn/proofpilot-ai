// C3-B2B real-run authorization: the ONLY minter of single-use execution authority (Zone E).
//
// The public E1 registry (`registerModelProposal`) is deliberately data-only: anyone with valid
// closed-grammar triples mints a registration without Ed25519 verification. The Zone P
// authenticated loader returns an `AuthenticatedArtifact` plain-data binding, never a capability.
// Neither can bridge to execution authority without becoming forgeable, so this separate module
// is the bridge: its mint function re-verifies the detached Ed25519 signature from raw bytes
// with `node:crypto`, requires the E1-registered proposal OBJECT IDENTITY (copies refused), and
// checks equality across proposal, manifest, authorization record and CLI-observed V. An exported
// helper trusting a caller boolean, an authenticated-looking object, or a publicly registered
// proposal is forbidden: only bytes that verify under the key named by the record mint.
//
// Zone E placement is load-bearing: this module imports `node:crypto` and the E1 identity only.
// No filesystem, no provenance code, no inference, no network, no environment, no child process.
// The trust roots arrive solely as a CLI argument read by the authenticated CLI from the fixed
// committed path; "pinned" holds only because that CLI is the sole permitted production importer
// (enforced by the importer allow-list test), plus the `trustRootsSha256` comparison, which makes
// substituted roots fail even when passed directly.
//
// `V` itself is NOT cryptographically bound: the manifest carries no V, so V equality is between
// the unsigned record and CLI-observed git strings. V's integrity rests on git parent-binding,
// the diff allowlist, D-R1/D-R5 and the single-writer window, never on the artifact signature.
//
// Membership is module-private, single-use, never exported and never serialized: the first
// successful authorization check deletes the membership, so a retry restarts from the full gate.
import { createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import { assertRegisteredModelProposal, type RegisteredModelProposal } from './model-proposal.ts';

/** The one reserved run id this module can ever authorize. Never caller-chosen. */
export const REAL_ARTIFACT_RUN_ID = 'c3-live-meta-001';
/** Fixed record path, relative to the repository root. No flag, no override. */
export const AUTHORIZATION_RECORD_PATH = 'config/c3-real-run-authorization.json';
/** Fixed trust-roots path, relative to the repository root. No flag, no override. */
export const AUTHORIZATION_TRUST_ROOTS_PATH = 'config/artifact-trust-roots.json';
/** The only V..HEAD diff a runnable checkout may carry: the record plus the enrollment. */
export const AUTHORIZATION_DIFF_ALLOWLIST = [AUTHORIZATION_RECORD_PATH, AUTHORIZATION_TRUST_ROOTS_PATH].sort();

/** Domain separator prefixed to the canonical manifest before signing (mirrors Zone P). */
const AUTH_DOMAIN = 'PP-ARTIFACT-AUTH-v1\n';
const MANIFEST_KEYS = [
  'authVersion',
  'keyId',
  'runId',
  'artifactSha256',
  'inputSha256',
  'sourceSha',
  'sourceFixtureTree',
  'sourceAnalysisId',
] as const;
const RECORD_KEYS = [
  'runId',
  'artifactSha256',
  'verificationParentSha',
  'trustRootsSha256',
  'sourceSha',
  'sourceFixtureTree',
  'sourceAnalysisId',
  'keyId',
  'approvalId',
] as const;

const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const POLLUTED = new Set(['__proto__', 'constructor', 'prototype']);
const SIGNATURE_B64_LENGTH = 88;

export type ModelAuthorizationErrorCode =
  | 'BAD_RECORD'
  | 'RECORD_MISMATCH'
  | 'REAL_ID_REQUIRED'
  | 'BAD_CLI_VALUES'
  | 'NOT_SINGLE_PARENT'
  | 'NOT_PARENT_CHILD'
  | 'DIRTY_TREE'
  | 'DIFF_NOT_ALLOWLISTED'
  | 'BAD_OBSERVED'
  | 'BAD_TRUST_ROOTS'
  | 'ROOTS_HASH_MISMATCH'
  | 'AUTH_MANIFEST_MALFORMED'
  | 'AUTH_MANIFEST_DUPLICATE_KEY'
  | 'AUTH_MANIFEST_PROTO_KEY'
  | 'AUTH_MANIFEST_UNKNOWN_FIELD'
  | 'AUTH_MANIFEST_MISSING_FIELD'
  | 'AUTH_MANIFEST_BAD_TYPE'
  | 'AUTH_MANIFEST_BAD_VALUE'
  | 'AUTH_MANIFEST_MISMATCH'
  | 'AUTH_SIGNATURE_MALFORMED'
  | 'AUTH_SIGNATURE_INVALID'
  | 'AUTH_UNKNOWN_KEY'
  | 'AUTH_KEY_MISMATCH';

export class ModelAuthorizationError extends Error {
  readonly code: ModelAuthorizationErrorCode;
  constructor(code: ModelAuthorizationErrorCode, detail: string) {
    super(`refused real-run authorization: ${detail} (${code})`);
    this.name = 'ModelAuthorizationError';
    this.code = code;
  }
}

const fail = (code: ModelAuthorizationErrorCode, detail: string): never => {
  throw new ModelAuthorizationError(code, detail);
};

export type AuthorizationRecord = {
  readonly runId: string;
  readonly artifactSha256: string;
  readonly verificationParentSha: string;
  readonly trustRootsSha256: string;
  readonly sourceSha: string;
  readonly sourceFixtureTree: string;
  readonly sourceAnalysisId: string;
  readonly keyId: string;
  readonly approvalId: string;
};

export type MintCliValues = {
  readonly runId: string;
  readonly sourceSha: string;
  readonly sourceFixtureTree: string;
  readonly sourceAnalysisId: string;
  readonly verificationSha: string;
};

export type ObservedGit = {
  /** `git rev-parse HEAD` as observed by the CLI. */
  readonly head: string;
  /** `HEAD~1` as observed by the CLI. */
  readonly parent: string;
  /** Number of parents of HEAD (must be exactly 1; merge commits are unobservable). */
  readonly parentCount: number;
  /** True only when `git status --porcelain` is empty. */
  readonly clean: boolean;
  /** `git diff --name-only V..HEAD` entries as observed by the CLI. */
  readonly diffNames: readonly string[];
};

export type MintArgs = {
  /** Must BE an E1-registered proposal (identity, not field equality). */
  readonly proposal: unknown;
  /** Raw `auth-manifest.json` bytes. */
  readonly manifestText: unknown;
  /** Raw `auth-manifest.sig` bytes. */
  readonly signatureText: unknown;
  /** Raw `config/artifact-trust-roots.json` bytes. */
  readonly trustRootsText: unknown;
  /** Raw `config/c3-real-run-authorization.json` bytes. */
  readonly recordText: unknown;
  /** The five CLI values the operator invoked with. */
  readonly cliValues: unknown;
  /** Git state as observed by the CLI under the single-writer window. */
  readonly observed: unknown;
};

// ---------------------------------------------------------------- strict JSON scanning (mirrors Zone P)

type TextCursor = { i: number };

const skipJsonWs = (text: string, c: TextCursor): void => {
  while (c.i < text.length) {
    const ch = text[c.i]!;
    if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') return;
    c.i++;
  }
};

/** Decode one JSON string literal starting at its opening quote; null when malformed. */
const decodeJsonString = (text: string, c: TextCursor): string | null => {
  let out = '';
  c.i++;
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
          if (!lo || lo[1] === undefined) return null;
          const low = parseInt(lo[1], 16);
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
};

/** Skip one JSON value of any shape (strings decoded, containers balanced); false when malformed. */
const skipJsonValue = (text: string, c: TextCursor, depth: number): boolean => {
  if (depth > 8) return false;
  skipJsonWs(text, c);
  const ch = text[c.i];
  if (ch === undefined) return false;
  if (ch === '"') return decodeJsonString(text, c) !== null;
  if (ch === '{' || ch === '[') {
    const close = ch === '{' ? '}' : ']';
    c.i++;
    skipJsonWs(text, c);
    if (text[c.i] === close) { c.i++; return true; }
    for (;;) {
      if (ch === '{') {
        skipJsonWs(text, c);
        if (text[c.i] !== '"') return false;
        if (decodeJsonString(text, c) === null) return false;
        skipJsonWs(text, c);
        if (text[c.i] !== ':') return false;
        c.i++;
      }
      if (!skipJsonValue(text, c, depth + 1)) return false;
      skipJsonWs(text, c);
      if (text[c.i] === ',') { c.i++; continue; }
      if (text[c.i] === close) { c.i++; return true; }
      return false;
    }
  }
  if (ch === '-' || (ch >= '0' && ch <= '9')) {
    const m = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(text.slice(c.i));
    if (!m) return false;
    c.i += m[0].length;
    return true;
  }
  for (const lit of ['true', 'false', 'null']) {
    if (text.startsWith(lit, c.i)) { c.i += lit.length; return true; }
  }
  return false;
};

/** Decoded top-level keys of a JSON object in order; null unless the text is exactly one object. */
const scanTopLevelKeys = (text: string): string[] | null => {
  const c: TextCursor = { i: 0 };
  const keys: string[] = [];
  skipJsonWs(text, c);
  if (text[c.i] !== '{') return null;
  c.i++;
  for (;;) {
    skipJsonWs(text, c);
    if (text[c.i] === '}' && keys.length === 0) { c.i++; skipJsonWs(text, c); return c.i === text.length ? keys : null; }
    if (text[c.i] !== '"') return null;
    const key = decodeJsonString(text, c);
    if (key === null) return null;
    keys.push(key);
    skipJsonWs(text, c);
    if (text[c.i] !== ':') return null;
    c.i++;
    if (!skipJsonValue(text, c, 1)) return null;
    skipJsonWs(text, c);
    if (text[c.i] === ',') { c.i++; continue; }
    if (text[c.i] === '}') { c.i++; skipJsonWs(text, c); return c.i === text.length ? keys : null; }
    return null;
  }
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const sameHex = (a: string, b: string): boolean => {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

// ---------------------------------------------------------------- strict manifest mirror (differentially tested vs Zone P)

type ParsedManifest = {
  readonly authVersion: 1;
  readonly keyId: string;
  readonly runId: string;
  readonly artifactSha256: string;
  readonly inputSha256: string;
  readonly sourceSha: string;
  readonly sourceFixtureTree: string;
  readonly sourceAnalysisId: string;
};

function parseManifest(text: string): ParsedManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('AUTH_MANIFEST_MALFORMED', 'manifest is not valid JSON');
  }
  if (!isRecord(parsed)) return fail('AUTH_MANIFEST_BAD_TYPE', 'manifest must be a JSON object');
  const topKeys = scanTopLevelKeys(text);
  if (topKeys === null) return fail('AUTH_MANIFEST_MALFORMED', 'manifest is not well-formed JSON');
  for (const key of topKeys) {
    if (POLLUTED.has(key)) return fail('AUTH_MANIFEST_PROTO_KEY', 'forbidden manifest key');
  }
  const seen = new Set<string>();
  for (const key of topKeys) {
    if (seen.has(key)) return fail('AUTH_MANIFEST_DUPLICATE_KEY', `duplicate manifest key ${JSON.stringify(key)}`);
    seen.add(key);
  }
  for (const key of Object.keys(parsed)) {
    if (!(MANIFEST_KEYS as readonly string[]).includes(key)) {
      return fail('AUTH_MANIFEST_UNKNOWN_FIELD', `unexpected manifest field ${JSON.stringify(key)}`);
    }
  }
  for (const key of MANIFEST_KEYS) {
    if (!(key in parsed)) return fail('AUTH_MANIFEST_MISSING_FIELD', `manifest is missing ${key}`);
  }
  const get = (key: string): unknown => (parsed as Record<string, unknown>)[key];
  if (typeof get('authVersion') !== 'number' || get('authVersion') !== 1) {
    return fail('AUTH_MANIFEST_BAD_VALUE', 'manifest authVersion must be exactly 1');
  }
  for (const key of ['keyId', 'runId', 'artifactSha256', 'inputSha256', 'sourceSha', 'sourceFixtureTree', 'sourceAnalysisId'] as const) {
    if (typeof get(key) !== 'string') return fail('AUTH_MANIFEST_BAD_TYPE', `manifest ${key} must be a string`);
  }
  const m = {
    authVersion: 1 as const,
    keyId: get('keyId') as string,
    runId: get('runId') as string,
    artifactSha256: get('artifactSha256') as string,
    inputSha256: get('inputSha256') as string,
    sourceSha: get('sourceSha') as string,
    sourceFixtureTree: get('sourceFixtureTree') as string,
    sourceAnalysisId: get('sourceAnalysisId') as string,
  };
  if (!KEY_ID.test(m.keyId)) return fail('AUTH_MANIFEST_BAD_VALUE', 'manifest keyId has invalid shape');
  if (!HEX64.test(m.artifactSha256) || !HEX64.test(m.inputSha256)) {
    return fail('AUTH_MANIFEST_BAD_VALUE', 'manifest hashes must be 64 lowercase hex characters');
  }
  if (!HEX40.test(m.sourceSha) || !HEX40.test(m.sourceFixtureTree)) {
    return fail('AUTH_MANIFEST_BAD_VALUE', 'manifest source revisions must be 40 lowercase hex characters');
  }
  if (m.sourceAnalysisId.length === 0 || m.sourceAnalysisId.length > 200) {
    return fail('AUTH_MANIFEST_BAD_VALUE', 'manifest sourceAnalysisId has invalid length');
  }
  return m;
}

/** Canonical bytes covered by the signature: domain separator plus sorted-key JSON. */
function canonicalManifestBytes(manifest: ParsedManifest): Buffer {
  const ordered: Record<string, unknown> = {};
  for (const key of [...MANIFEST_KEYS].sort()) ordered[key] = manifest[key];
  return Buffer.from(AUTH_DOMAIN + JSON.stringify(ordered), 'utf8');
}

// ---------------------------------------------------------------- strict trust-roots mirror

type ParsedTrustRoots = { readonly version: 1; readonly keys: ReadonlyArray<{ readonly keyId: string; readonly publicKeySpkiBase64: string }> };

function parseTrustRoots(text: string): ParsedTrustRoots {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('BAD_TRUST_ROOTS', 'trust roots file is not valid JSON');
  }
  if (!isRecord(parsed)) return fail('BAD_TRUST_ROOTS', 'trust roots must be a JSON object');
  for (const key of Object.keys(parsed)) {
    if (key !== 'version' && key !== 'keys') {
      return fail('BAD_TRUST_ROOTS', `unexpected trust roots field ${JSON.stringify(key)}`);
    }
  }
  if (parsed['version'] !== 1) return fail('BAD_TRUST_ROOTS', 'trust roots version must be exactly 1');
  if (!Array.isArray(parsed['keys'])) return fail('BAD_TRUST_ROOTS', 'trust roots keys must be an array');
  const keys: Array<{ keyId: string; publicKeySpkiBase64: string }> = [];
  const seenIds = new Set<string>();
  for (const entry of parsed['keys']) {
    if (!isRecord(entry)) return fail('BAD_TRUST_ROOTS', 'trust root key must be an object');
    for (const key of Object.keys(entry)) {
      if (key !== 'keyId' && key !== 'algorithm' && key !== 'publicKeySpkiBase64' && key !== 'status') {
        return fail('BAD_TRUST_ROOTS', `unexpected trust root key field ${JSON.stringify(key)}`);
      }
    }
    const raw = entry as Record<string, unknown>;
    if (typeof raw['keyId'] !== 'string' || !KEY_ID.test(raw['keyId'] as string)) {
      return fail('BAD_TRUST_ROOTS', 'trust root keyId has invalid shape');
    }
    if (raw['algorithm'] !== 'ed25519') {
      return fail('BAD_TRUST_ROOTS', 'trust root algorithm must be ed25519');
    }
    if (typeof raw['publicKeySpkiBase64'] !== 'string' || !BASE64.test(raw['publicKeySpkiBase64'] as string)) {
      return fail('BAD_TRUST_ROOTS', 'trust root public key must be strict base64');
    }
    if (raw['status'] !== 'active') {
      return fail('BAD_TRUST_ROOTS', 'trust root status must be active');
    }
    const keyId: string = raw['keyId'] as string;
    const publicKeySpkiBase64: string = raw['publicKeySpkiBase64'] as string;
    if (seenIds.has(keyId)) return fail('BAD_TRUST_ROOTS', 'duplicate trust root keyId');
    seenIds.add(keyId);
    let spki: Buffer;
    try {
      spki = Buffer.from(publicKeySpkiBase64, 'base64');
    } catch {
      return fail('BAD_TRUST_ROOTS', 'trust root public key is not decodable');
    }
    let imported: ReturnType<typeof createPublicKey>;
    try {
      imported = createPublicKey({ key: spki!, format: 'der', type: 'spki' });
    } catch {
      return fail('AUTH_KEY_MISMATCH', 'trust root public key is not a usable key');
    }
    if (imported.asymmetricKeyType !== 'ed25519') {
      return fail('AUTH_KEY_MISMATCH', 'trust root public key is not an Ed25519 key');
    }
    keys.push({ keyId, publicKeySpkiBase64 });
  }
  return { version: 1, keys };
}

// ---------------------------------------------------------------- strict record parse

function parseRecord(text: string): AuthorizationRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('BAD_RECORD', 'authorization record is not valid JSON');
  }
  if (!isRecord(parsed)) return fail('BAD_RECORD', 'authorization record must be a JSON object');
  const topKeys = scanTopLevelKeys(text);
  if (topKeys === null) return fail('BAD_RECORD', 'authorization record is not well-formed JSON');
  const seen = new Set<string>();
  for (const key of topKeys) {
    if (POLLUTED.has(key) || seen.has(key)) return fail('BAD_RECORD', `authorization record has a forbidden or duplicate key ${JSON.stringify(key)}`);
    seen.add(key);
  }
  for (const key of Object.keys(parsed)) {
    if (!(RECORD_KEYS as readonly string[]).includes(key)) {
      return fail('BAD_RECORD', `unexpected authorization record field ${JSON.stringify(key)}`);
    }
  }
  for (const key of RECORD_KEYS) {
    if (typeof parsed[key] !== 'string') return fail('BAD_RECORD', `authorization record ${key} must be a string`);
  }
  const r = parsed as Record<string, string>;
  if (!RUN_ID.test(r['runId']!)) return fail('BAD_RECORD', 'record runId has invalid shape');
  if (!HEX64.test(r['artifactSha256']!)) return fail('BAD_RECORD', 'record artifactSha256 must be 64 lowercase hex characters');
  if (!HEX40.test(r['verificationParentSha']!)) {
    return fail('BAD_RECORD', 'record verificationParentSha must be 40 lowercase hex characters');
  }
  if (!HEX64.test(r['trustRootsSha256']!)) {
    return fail('BAD_RECORD', 'record trustRootsSha256 must be 64 lowercase hex characters');
  }
  if (!HEX40.test(r['sourceSha']!) || !HEX40.test(r['sourceFixtureTree']!)) {
    return fail('BAD_RECORD', 'record source revisions must be 40 lowercase hex characters');
  }
  if (r['sourceAnalysisId']!.length === 0 || r['sourceAnalysisId']!.length > 200) {
    return fail('BAD_RECORD', 'record sourceAnalysisId has invalid length');
  }
  if (!KEY_ID.test(r['keyId']!)) return fail('BAD_RECORD', 'record keyId has invalid shape');
  if (r['approvalId']!.length === 0 || r['approvalId']!.length > 200) {
    return fail('BAD_RECORD', 'record approvalId has invalid length');
  }
  return {
    runId: r['runId']!,
    artifactSha256: r['artifactSha256']!,
    verificationParentSha: r['verificationParentSha']!,
    trustRootsSha256: r['trustRootsSha256']!,
    sourceSha: r['sourceSha']!,
    sourceFixtureTree: r['sourceFixtureTree']!,
    sourceAnalysisId: r['sourceAnalysisId']!,
    keyId: r['keyId']!,
    approvalId: r['approvalId']!,
  };
}

// ---------------------------------------------------------------- the capability

/** Module-private single-use membership. Never exported, never serialized. */
const AUTHORIZED = new WeakSet<object>();

function readCliValues(v: unknown): MintCliValues {
  if (!isRecord(v)) return fail('BAD_CLI_VALUES', 'CLI values must be an object');
  for (const key of ['runId', 'sourceSha', 'sourceFixtureTree', 'sourceAnalysisId', 'verificationSha'] as const) {
    if (typeof v[key] !== 'string' || (v[key] as string).length === 0) {
      return fail('BAD_CLI_VALUES', `CLI value ${key} must be a non-empty string`);
    }
  }
  return {
    runId: v['runId'] as string,
    sourceSha: v['sourceSha'] as string,
    sourceFixtureTree: v['sourceFixtureTree'] as string,
    sourceAnalysisId: v['sourceAnalysisId'] as string,
    verificationSha: v['verificationSha'] as string,
  };
}

function readObserved(v: unknown): ObservedGit {
  if (!isRecord(v)) return fail('BAD_OBSERVED', 'observed git state must be an object');
  if (typeof v['head'] !== 'string' || !HEX40.test(v['head'])) return fail('BAD_OBSERVED', 'observed head must be 40 lowercase hex characters');
  if (typeof v['parent'] !== 'string' || !HEX40.test(v['parent'])) {
    return fail('BAD_OBSERVED', 'observed parent must be 40 lowercase hex characters');
  }
  if (typeof v['parentCount'] !== 'number' || !Number.isInteger(v['parentCount'])) {
    return fail('BAD_OBSERVED', 'observed parent count must be an integer');
  }
  if (typeof v['clean'] !== 'boolean') return fail('BAD_OBSERVED', 'observed clean flag must be a boolean');
  if (!Array.isArray(v['diffNames']) || !(v['diffNames'] as unknown[]).every((d) => typeof d === 'string')) {
    return fail('BAD_OBSERVED', 'observed diff names must be a string list');
  }
  return {
    head: v['head'] as string,
    parent: v['parent'] as string,
    parentCount: v['parentCount'] as number,
    clean: v['clean'] as boolean,
    diffNames: [...(v['diffNames'] as string[])],
  };
}

/**
 * Mint single-use execution authority for the reserved real run id. Validates everything from
 * trusted primitives (parsed bytes, Ed25519, object identity, string equality) and never trusts
 * a caller boolean, an authenticated-looking object, or a publicly registered proposal.
 * Throws `ModelAuthorizationError` (or the E1 `NOT_REGISTERED` identity error) fail-closed.
 */
export function mintSingleUseRealAuthorization(args: MintArgs): void {
  if (!isRecord(args as unknown as Record<string, unknown>)) {
    return fail('BAD_RECORD', 'mint arguments must be an object');
  }
  const { proposal, manifestText, signatureText, trustRootsText, recordText, cliValues, observed } = args;
  const obs = readObserved(observed);
  if (obs.parentCount !== 1) return fail('NOT_SINGLE_PARENT', 'HEAD must have exactly one parent (merge commits are unrunnable)');
  if (typeof recordText !== 'string') return fail('BAD_RECORD', 'authorization record bytes must be text');
  const record = parseRecord(recordText);
  if (record.runId !== REAL_ARTIFACT_RUN_ID) {
    return fail('REAL_ID_REQUIRED', 'only the reserved real run id can be authorized');
  }
  const cli = readCliValues(cliValues);
  if (cli.runId !== record.runId) return fail('RECORD_MISMATCH', 'CLI run id does not match the authorization record');
  if (cli.sourceSha !== record.sourceSha) return fail('RECORD_MISMATCH', 'CLI source revision does not match the authorization record');
  if (cli.sourceFixtureTree !== record.sourceFixtureTree) {
    return fail('RECORD_MISMATCH', 'CLI fixture tree does not match the authorization record');
  }
  if (cli.sourceAnalysisId !== record.sourceAnalysisId) {
    return fail('RECORD_MISMATCH', 'CLI analysis id does not match the authorization record');
  }
  if (cli.verificationSha !== record.verificationParentSha) {
    return fail('RECORD_MISMATCH', 'CLI verification revision does not match the authorized parent');
  }
  if (obs.parent !== record.verificationParentSha) {
    return fail('NOT_PARENT_CHILD', 'HEAD is not the authorized child of the recorded parent');
  }
  if (obs.clean !== true) return fail('DIRTY_TREE', 'the checkout tree is not clean');
  if (JSON.stringify([...obs.diffNames].sort()) !== JSON.stringify(AUTHORIZATION_DIFF_ALLOWLIST)) {
    return fail('DIFF_NOT_ALLOWLISTED', 'V..HEAD carries files outside the authorization allow-list');
  }
  if (typeof trustRootsText !== 'string') return fail('BAD_TRUST_ROOTS', 'trust roots bytes must be text');
  const rootsHash = createHash('sha256').update(trustRootsText, 'utf8').digest('hex');
  if (!sameHex(rootsHash, record.trustRootsSha256)) {
    return fail('ROOTS_HASH_MISMATCH', 'trust roots bytes do not match the authorized hash');
  }
  const roots = parseTrustRoots(trustRootsText);
  if (typeof manifestText !== 'string') return fail('AUTH_MANIFEST_MALFORMED', 'manifest bytes must be text');
  const manifest = parseManifest(manifestText);
  if (manifest.runId !== record.runId) return fail('AUTH_MANIFEST_MISMATCH', 'manifest runId does not match the authorized run');
  if (!sameHex(manifest.artifactSha256, record.artifactSha256)) {
    return fail('AUTH_MANIFEST_MISMATCH', 'manifest does not bind the authorized artifact bytes');
  }
  if (manifest.sourceSha !== record.sourceSha) {
    return fail('AUTH_MANIFEST_MISMATCH', 'manifest source revision does not match the authorized source');
  }
  if (manifest.sourceFixtureTree !== record.sourceFixtureTree) {
    return fail('AUTH_MANIFEST_MISMATCH', 'manifest fixture tree does not match the authorized source');
  }
  if (manifest.sourceAnalysisId !== record.sourceAnalysisId) {
    return fail('AUTH_MANIFEST_MISMATCH', 'manifest analysis id does not match the authorized source');
  }
  if (manifest.keyId !== record.keyId) {
    return fail('AUTH_MANIFEST_MISMATCH', 'manifest key does not match the authorized key');
  }
  const root = roots.keys.find((k) => k.keyId === manifest.keyId);
  if (!root) return fail('AUTH_UNKNOWN_KEY', 'manifest keyId is not a pinned trust root');
  if (typeof signatureText !== 'string') return fail('AUTH_SIGNATURE_MALFORMED', 'signature bytes must be text');
  const signatureTrimmed = signatureText.trim();
  if (signatureTrimmed.length !== SIGNATURE_B64_LENGTH || !BASE64.test(signatureTrimmed)) {
    return fail('AUTH_SIGNATURE_MALFORMED', 'signature must be one 64-byte Ed25519 signature');
  }
  const signature = Buffer.from(signatureTrimmed, 'base64');
  if (signature.length !== 64) return fail('AUTH_SIGNATURE_MALFORMED', 'signature decodes to the wrong length');
  const publicKey = createPublicKey({
    key: Buffer.from(root.publicKeySpkiBase64, 'base64'),
    format: 'der',
    type: 'spki',
  });
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    return fail('AUTH_KEY_MISMATCH', 'trust root public key is not an Ed25519 key');
  }
  let ok = false;
  try {
    ok = verify(null, canonicalManifestBytes(manifest), publicKey, signature);
  } catch {
    ok = false;
  }
  if (!ok) return fail('AUTH_SIGNATURE_INVALID', 'manifest signature does not verify against the pinned key');
  // Identity, not field equality: copies, clones and hand-built lookalikes are refused here.
  assertRegisteredModelProposal(proposal);
  const registered = proposal as RegisteredModelProposal;
  if (registered.runId !== REAL_ARTIFACT_RUN_ID) {
    return fail('REAL_ID_REQUIRED', 'only the reserved real run id can be authorized');
  }
  if (registered.approvedSha !== record.verificationParentSha) {
    return fail('RECORD_MISMATCH', 'registration is not bound to the authorized parent');
  }
  if (!sameHex(registered.artifactSha256, record.artifactSha256)) {
    return fail('RECORD_MISMATCH', 'registration does not bind the authorized artifact');
  }
  if (!sameHex(registered.inputSha256, manifest.inputSha256)) {
    return fail('AUTH_MANIFEST_MISMATCH', 'registration input does not match the authenticated input');
  }
  AUTHORIZED.add(registered);
}

/**
 * Single-use authorization check, consumed up front: returns true once for a minted proposal,
 * false for everything else (never minted, already consumed, copies, non-objects). The first
 * verification call deletes the membership, so if verification later throws, the authorization
 * is already spent and any retry restarts from the full gate.
 */
export function isRealRunAuthorized(proposal: unknown): boolean {
  if (typeof proposal !== 'object' || proposal === null) return false;
  if (!AUTHORIZED.has(proposal)) return false;
  AUTHORIZED.delete(proposal);
  return true;
}
