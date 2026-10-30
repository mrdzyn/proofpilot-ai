// C3-B2B SEC-P2-02 test support: synthetic Ed25519 identities and manifest signing.
//
// TEST ONLY. Nothing here ships a private key: every key pair is generated in memory per
// test run and never written to disk. Production verification lives in
// `packages/provenance/src/artifact-auth.ts` (verify path only); owner enrollment happens
// offline per the SEC-P2-02 runbook.
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  canonicalManifestBytes,
  parseSignatureManifest,
  type SignatureManifest,
  type TrustRoots,
} from '../../packages/provenance/src/artifact-auth.ts';

export const TEST_KEY_ID = 'sec-p2-02-test-01';
export const TEST_SOURCE_SHA = 'a'.repeat(40);
export const TEST_FIXTURE_TREE = 'b'.repeat(40);
export const TEST_ANALYSIS_ID = 'synthetic-analysis-001';

export type TestIdentity = {
  keyId: string;
  privateKeyPem: string;
  publicKeySpkiBase64: string;
  trustRoots: TrustRoots;
};

/** Fresh in-memory Ed25519 identity plus the matching pinned trust roots value. */
export function makeTestIdentity(keyId = TEST_KEY_ID): TestIdentity {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeySpkiBase64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  return {
    keyId,
    privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    publicKeySpkiBase64,
    trustRoots: {
      version: 1,
      keys: [{ keyId, algorithm: 'ed25519', publicKeySpkiBase64, status: 'active' }],
    },
  };
}

export const manifestFor = (over: Partial<SignatureManifest> = {}): SignatureManifest => ({
  authVersion: 1,
  keyId: TEST_KEY_ID,
  runId: 'c3-test-source-001',
  artifactSha256: '0'.repeat(64),
  inputSha256: 'a'.repeat(64),
  sourceSha: TEST_SOURCE_SHA,
  sourceFixtureTree: TEST_FIXTURE_TREE,
  sourceAnalysisId: TEST_ANALYSIS_ID,
  ...over,
});

/** Deterministic manifest text: canonical JSON without the domain separator. */
export const manifestTextFor = (manifest: SignatureManifest): string => {
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(manifest).sort()) ordered[key] = manifest[key as keyof SignatureManifest];
  return JSON.stringify(ordered);
};

/** Detached base64 signature over the canonical manifest bytes (test signing only). */
export function signManifest(manifest: SignatureManifest, privateKeyPem: string): string {
  return sign(null, canonicalManifestBytes(parseSignatureManifest(manifestTextFor(manifest))), Buffer.from(privateKeyPem, 'utf8')).toString('base64');
}

/** Writes the manifest and signature sidecars beside a synthetic artifact. */
export function writeAuthFiles(root: string, runId: string, manifestText: string, signatureText: string): void {
  const dir = path.join(root, '.proofpilot/evidence/proposals', runId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'auth-manifest.json'), manifestText, { mode: 0o600 });
  writeFileSync(path.join(dir, 'auth-manifest.sig'), signatureText, { mode: 0o600 });
}
