// C3-B2B SEC-P2-02 — Zone P: detached Ed25519 authentication for stored proposal artifacts.
//
// A same-UID writer can rewrite any file, so statistical read checks authenticate path
// resolution, never content. This module closes the content-substitution rows with
// cryptography instead of more heuristics: a detached signature over a domain-separated
// canonical manifest binds the exact artifact bytes, the run id, the input hash and the
// required source-provenance identifiers to a pinned key identity.
//
// Trust model: verification keys arrive as an explicit `TrustRoots` value. The production
// command loads that value only from the committed `config/artifact-trust-roots.json`;
// there is no key flag, no environment override and no unsigned fallback. The private
// signing key never appears here, in any fixture, log or evidence bundle: test keys live
// in memory inside tests, and owner enrollment happens offline (see the SEC-P2-02
// runbook). A signature made after the fact proves integrity from enrollment forward;
// it can never prove that Meta produced those bytes.
//
// This module imports `node:crypto` plus the already allow-listed read-only filesystem
// members and `node:path`, and the existing P2 loader. It adds no builtin, no
// filesystem member and no Zone E edge.
import { createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadAndValidateProposalArtifact, type ValidatedProposal } from './proposal-artifact.ts';

export type AuthErrorCode =
  | 'AUTH_UNSIGNED'
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
  | 'AUTH_TRUST_ROOT_MALFORMED'
  | 'AUTH_TRUST_ROOT_BAD_VALUE'
  | 'AUTH_UNKNOWN_KEY'
  | 'AUTH_KEY_MISMATCH';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

const fail = (code: AuthErrorCode, message: string): never => {
  throw new AuthError(code, message);
};

/** Domain separator prefixed to the canonical manifest before signing. */
export const AUTH_DOMAIN = 'PP-ARTIFACT-AUTH-v1\n';
/** Manifest files live beside the artifact and are read with the same distrust. */
const MANIFEST_FILE = 'auth-manifest.json';
const SIGNATURE_FILE = 'auth-manifest.sig';
/** Small fixed bounds: a manifest is eight scalar fields, a signature is 64 bytes. */
const MAX_MANIFEST_BYTES = 2_048;
const MAX_SIGNATURE_BYTES = 256;
/** An Ed25519 signature is exactly 64 bytes (88 base64 characters). */
const SIGNATURE_B64_LENGTH = 88;

const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const POLLUTED = new Set(['__proto__', 'constructor', 'prototype']);

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
type ManifestKey = (typeof MANIFEST_KEYS)[number];

export type SignatureManifest = {
  readonly authVersion: 1;
  readonly keyId: string;
  readonly runId: string;
  readonly artifactSha256: string;
  readonly inputSha256: string;
  readonly sourceSha: string;
  readonly sourceFixtureTree: string;
  readonly sourceAnalysisId: string;
};

export type TrustRootKey = {
  readonly keyId: string;
  readonly algorithm: 'ed25519';
  readonly publicKeySpkiBase64: string;
  readonly status: 'active';
};

export type TrustRoots = { readonly version: 1; readonly keys: readonly TrustRootKey[] };

/** Frozen authentication binding returned on success (data only, never a capability). */
export type AuthenticatedArtifact = {
  readonly keyId: string;
  readonly runId: string;
  readonly artifactSha256: string;
  readonly inputSha256: string;
  readonly sourceSha: string;
  readonly sourceFixtureTree: string;
  readonly sourceAnalysisId: string;
};

/** Canonical bytes covered by the signature: domain separator plus sorted-key JSON. */
export function canonicalManifestBytes(manifest: SignatureManifest): Buffer {
  const ordered: Record<string, unknown> = {};
  for (const key of [...MANIFEST_KEYS].sort()) ordered[key] = manifest[key];
  return Buffer.from(AUTH_DOMAIN + JSON.stringify(ordered), 'utf8');
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Strict manifest parse: flat object, exact keys, scalar values, no duplicates. */
export function parseSignatureManifest(text: string): SignatureManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('AUTH_MANIFEST_MALFORMED', 'refused: authentication manifest is not valid JSON');
  }
  if (!isRecord(parsed)) return fail('AUTH_MANIFEST_BAD_TYPE', 'refused: authentication manifest must be a JSON object');
  const seen = new Map<string, number>();
  // Built without a literal quote inside the pattern: the Zone P boundary scanner masks
  // string literals syntactically, so an unbalanced quote inside a regex literal would
  // mis-tokenize this module. Char-code construction keeps every quote balanced.
  const quote = String.fromCharCode(34);
  const keyPattern = new RegExp(`${quote}((?:[^${quote}\\\\]|\\\\.)*)${quote}\\s*:`, 'g');
  for (const m of text.matchAll(keyPattern)) {
    const key = m[1]!;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count > 1) return fail('AUTH_MANIFEST_DUPLICATE_KEY', `refused: duplicate manifest key ${JSON.stringify(key)}`);
  }
  for (const key of Object.keys(parsed)) {
    if (POLLUTED.has(key)) return fail('AUTH_MANIFEST_PROTO_KEY', 'refused: forbidden manifest key');
  }
  for (const key of Object.keys(parsed)) {
    if (!(MANIFEST_KEYS as readonly string[]).includes(key)) {
      return fail('AUTH_MANIFEST_UNKNOWN_FIELD', `refused: unexpected manifest field ${JSON.stringify(key)}`);
    }
  }
  for (const key of MANIFEST_KEYS) {
    if (!(key in parsed)) return fail('AUTH_MANIFEST_MISSING_FIELD', `refused: manifest is missing ${key}`);
  }
  const get = (key: ManifestKey): unknown => (parsed as Record<string, unknown>)[key];
  if (typeof get('authVersion') !== 'number' || get('authVersion') !== 1) {
    return fail('AUTH_MANIFEST_BAD_VALUE', 'refused: manifest authVersion must be exactly 1');
  }
  for (const key of ['keyId', 'runId', 'artifactSha256', 'inputSha256', 'sourceSha', 'sourceFixtureTree', 'sourceAnalysisId'] as const) {
    if (typeof get(key) !== 'string') return fail('AUTH_MANIFEST_BAD_TYPE', `refused: manifest ${key} must be a string`);
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
  if (!KEY_ID.test(m.keyId)) return fail('AUTH_MANIFEST_BAD_VALUE', 'refused: manifest keyId has invalid shape');
  if (!HEX64.test(m.artifactSha256) || !HEX64.test(m.inputSha256)) {
    return fail('AUTH_MANIFEST_BAD_VALUE', 'refused: manifest hashes must be 64 lowercase hex characters');
  }
  if (!HEX40.test(m.sourceSha) || !HEX40.test(m.sourceFixtureTree)) {
    return fail('AUTH_MANIFEST_BAD_VALUE', 'refused: manifest source revisions must be 40 lowercase hex characters');
  }
  if (m.sourceAnalysisId.length === 0 || m.sourceAnalysisId.length > 200) {
    return fail('AUTH_MANIFEST_BAD_VALUE', 'refused: manifest sourceAnalysisId has invalid length');
  }
  return m;
}

/** Strict trust-root parse: version 1, closed key schema, pinned identities only. */
export function parseTrustRoots(text: string): TrustRoots {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('AUTH_TRUST_ROOT_MALFORMED', 'refused: trust roots file is not valid JSON');
  }
  if (!isRecord(parsed)) return fail('AUTH_TRUST_ROOT_BAD_VALUE', 'refused: trust roots must be a JSON object');
  for (const key of Object.keys(parsed)) {
    if (key !== 'version' && key !== 'keys') {
      return fail('AUTH_TRUST_ROOT_BAD_VALUE', `refused: unexpected trust roots field ${JSON.stringify(key)}`);
    }
  }
  if (parsed['version'] !== 1) return fail('AUTH_TRUST_ROOT_BAD_VALUE', 'refused: trust roots version must be exactly 1');
  if (!Array.isArray(parsed['keys'])) return fail('AUTH_TRUST_ROOT_BAD_VALUE', 'refused: trust roots keys must be an array');
  const keys: TrustRootKey[] = [];
  const seenIds = new Set<string>();
  for (const entry of parsed['keys']) {
    if (!isRecord(entry)) return fail('AUTH_TRUST_ROOT_BAD_VALUE', 'refused: trust root key must be an object');
    for (const key of Object.keys(entry)) {
      if (key !== 'keyId' && key !== 'algorithm' && key !== 'publicKeySpkiBase64' && key !== 'status') {
        return fail('AUTH_TRUST_ROOT_BAD_VALUE', `refused: unexpected trust root key field ${JSON.stringify(key)}`);
      }
    }
    const raw = entry as Record<string, unknown>;
    if (typeof raw['keyId'] !== 'string' || !KEY_ID.test(raw['keyId'] as string)) {
      return fail('AUTH_TRUST_ROOT_BAD_VALUE', 'refused: trust root keyId has invalid shape');
    }
    if (raw['algorithm'] !== 'ed25519') {
      return fail('AUTH_TRUST_ROOT_BAD_VALUE', 'refused: trust root algorithm must be ed25519');
    }
    if (typeof raw['publicKeySpkiBase64'] !== 'string' || !BASE64.test(raw['publicKeySpkiBase64'] as string)) {
      return fail('AUTH_TRUST_ROOT_BAD_VALUE', 'refused: trust root public key must be strict base64');
    }
    if (raw['status'] !== 'active') {
      return fail('AUTH_TRUST_ROOT_BAD_VALUE', 'refused: trust root status must be active');
    }
    const keyId: string = raw['keyId'] as string;
    const publicKeySpkiBase64: string = raw['publicKeySpkiBase64'] as string;
    if (seenIds.has(keyId)) return fail('AUTH_TRUST_ROOT_BAD_VALUE', 'refused: duplicate trust root keyId');
    seenIds.add(keyId);
    let spki: Buffer;
    try {
      spki = Buffer.from(publicKeySpkiBase64, 'base64');
    } catch {
      return fail('AUTH_TRUST_ROOT_BAD_VALUE', 'refused: trust root public key is not decodable');
    }
    try {
      createPublicKey({ key: spki!, format: 'der', type: 'spki' });
    } catch {
      return fail('AUTH_KEY_MISMATCH', 'refused: trust root public key is not a usable Ed25519 key');
    }
    keys.push({ keyId, algorithm: 'ed25519', publicKeySpkiBase64, status: 'active' });
  }
  return { version: 1, keys };
}

const sameHex = (a: string, b: string): boolean => {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};

/**
 * Verify a parsed manifest against the presented artifact identity and pinned roots.
 * Every binding is equality-checked; the signature covers the canonical manifest bytes.
 */
export function verifyArtifactAuthentication(args: {
  manifest: SignatureManifest;
  signatureBase64: string;
  runId: string;
  artifactHash: string;
  inputSha256: string;
  sourceSha: string;
  sourceFixtureTree: string;
  sourceAnalysisId: string;
  trustRoots: TrustRoots;
}): AuthenticatedArtifact {
  const { manifest, signatureBase64, trustRoots } = args;
  if (!sameHex(manifest.runId, args.runId)) {
    return fail('AUTH_MANIFEST_MISMATCH', 'refused: manifest runId does not match the requested artifact');
  }
  if (!sameHex(manifest.artifactSha256, args.artifactHash)) {
    return fail('AUTH_MANIFEST_MISMATCH', 'refused: manifest does not bind these exact artifact bytes');
  }
  if (!sameHex(manifest.inputSha256, args.inputSha256)) {
    return fail('AUTH_MANIFEST_MISMATCH', 'refused: manifest input hash does not match the artifact');
  }
  if (
    !sameHex(manifest.sourceSha, args.sourceSha) ||
    !sameHex(manifest.sourceFixtureTree, args.sourceFixtureTree) ||
    !sameHex(manifest.sourceAnalysisId, args.sourceAnalysisId)
  ) {
    return fail('AUTH_MANIFEST_MISMATCH', 'refused: manifest source identity does not match this run');
  }
  const root = trustRoots.keys.find((k) => k.keyId === manifest.keyId);
  if (!root) return fail('AUTH_UNKNOWN_KEY', 'refused: manifest keyId is not a pinned trust root');
  if (signatureBase64.length !== SIGNATURE_B64_LENGTH || !BASE64.test(signatureBase64)) {
    return fail('AUTH_SIGNATURE_MALFORMED', 'refused: signature file must hold one 64-byte Ed25519 signature');
  }
  const signature = Buffer.from(signatureBase64.trim(), 'base64');
  if (signature.length !== 64) return fail('AUTH_SIGNATURE_MALFORMED', 'refused: signature decodes to the wrong length');
  const publicKey = createPublicKey({
    key: Buffer.from(root!.publicKeySpkiBase64, 'base64'),
    format: 'der',
    type: 'spki',
  });
  let ok = false;
  try {
    ok = verify(null, canonicalManifestBytes(manifest), publicKey, signature);
  } catch {
    ok = false;
  }
  if (!ok) return fail('AUTH_SIGNATURE_INVALID', 'refused: manifest signature does not verify against the pinned key');
  return Object.freeze({
    keyId: manifest.keyId,
    runId: manifest.runId,
    artifactSha256: manifest.artifactSha256,
    inputSha256: manifest.inputSha256,
    sourceSha: manifest.sourceSha,
    sourceFixtureTree: manifest.sourceFixtureTree,
    sourceAnalysisId: manifest.sourceAnalysisId,
  });
}

const evidenceChild = (repoRoot: string, runId: string, file: string): string =>
  join(repoRoot, '.proofpilot/evidence/proposals', runId, file);

/**
 * Read a small authentication sidecar with distrust: symlinks, non-regular files and
 * oversize files refuse as unauthenticated rather than being followed or loaded.
 */
async function readSidecar(repoRoot: string, runId: string, file: string, maxBytes: number): Promise<string> {
  const target = evidenceChild(repoRoot, runId, file);
  let meta;
  try {
    meta = await lstat(target);
  } catch {
    return fail('AUTH_UNSIGNED', `refused: ${file} is absent, so this artifact is unauthenticated`);
  }
  if (meta!.isSymbolicLink() || !meta!.isFile() || meta!.size > maxBytes) {
    return fail('AUTH_UNSIGNED', `refused: ${file} is not a directly readable sidecar, so this artifact is unauthenticated`);
  }
  const bytes = await readFile(target);
  if (bytes.length > maxBytes) return fail('AUTH_UNSIGNED', `refused: ${file} exceeds its fixed bound`);
  return bytes.toString('utf8');
}

/**
 * Load the artifact through the existing strict P2 checks, then require a valid
 * detached authentication binding it before anything may register or stage it.
 * Artifact failures surface as `ArtifactError`; authentication failures as `AuthError`.
 */
export async function loadAndAuthenticateProposalArtifact(args: {
  repoRoot: string;
  runId: string;
  sourceSha: string;
  sourceFixtureTree: string;
  sourceAnalysisId: string;
  trustRoots: TrustRoots;
}): Promise<{ artifact: ValidatedProposal; authentication: AuthenticatedArtifact }> {
  const artifact = await loadAndValidateProposalArtifact({ repoRoot: args.repoRoot, runId: args.runId });
  const manifestText = await readSidecar(args.repoRoot, args.runId, MANIFEST_FILE, MAX_MANIFEST_BYTES);
  const signatureText = (await readSidecar(args.repoRoot, args.runId, SIGNATURE_FILE, MAX_SIGNATURE_BYTES)).trim();
  const manifest = parseSignatureManifest(manifestText);
  const authentication = verifyArtifactAuthentication({
    manifest,
    signatureBase64: signatureText,
    runId: artifact.runId,
    artifactHash: artifact.artifactHash,
    inputSha256: artifact.inputSha256,
    sourceSha: args.sourceSha,
    sourceFixtureTree: args.sourceFixtureTree,
    sourceAnalysisId: args.sourceAnalysisId,
    trustRoots: args.trustRoots,
  });
  return { artifact, authentication };
}
