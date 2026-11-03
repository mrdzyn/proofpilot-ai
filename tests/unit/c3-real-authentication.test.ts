// C3 real-run authentication: manifest/key/field batteries on the mint path.
//
// Synthetic only: test keys are generated in memory per run; the real stored proposal, real
// keys, credentials and providers are never touched. Extends the SEC-P2-02 battery to the
// real-id mint path without touching the synthetic suites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  isRealRunAuthorized,
  mintSingleUseRealAuthorization,
  ModelAuthorizationError,
  REAL_ARTIFACT_RUN_ID,
} from '../../packages/core/src/model-real-authorization.ts';
import { registerModelProposal, renderCssAdjustments, type CssAdjustment } from '../../packages/core/src/index.ts';
import { manifestTextFor, TEST_ANALYSIS_ID } from '../support/artifact-auth-fixture.ts';

const V = '3'.repeat(40);
const SRC = '4'.repeat(40);
const HEAD = '5'.repeat(40);
const ART = 'a'.repeat(64);
const INP = 'b'.repeat(64);
const FIXTURE_TREE = 'c'.repeat(40);
const PC1: CssAdjustment[] = [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }];
const CSS = renderCssAdjustments(PC1);
const sha256Hex = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');

const codeOf = async (fn: () => unknown): Promise<string> => {
  try {
    await fn();
    return 'NO_ERROR';
  } catch (e) {
    if (e instanceof ModelAuthorizationError) return e.code;
    return `OTHER:${(e as Error).message}`;
  }
};

const TEST_KEY_ID = 'c3-real-authn-test-01';

/** Fully consistent synthetic inputs; mutate one dimension per case. */
const validSetup = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeySpkiBase64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const trustRootsText = JSON.stringify({
    version: 1,
    keys: [{ keyId: TEST_KEY_ID, algorithm: 'ed25519', publicKeySpkiBase64, status: 'active' }],
  });
  const manifest = {
    authVersion: 1 as const,
    keyId: TEST_KEY_ID,
    runId: REAL_ARTIFACT_RUN_ID,
    artifactSha256: ART,
    inputSha256: INP,
    sourceSha: SRC,
    sourceFixtureTree: FIXTURE_TREE,
    sourceAnalysisId: TEST_ANALYSIS_ID,
  };
  const manifestText = manifestTextFor(manifest);
  const canonical: Record<string, unknown> = {};
  for (const k of Object.keys(manifest).sort()) canonical[k] = manifest[k as keyof typeof manifest];
  const signatureText = sign(
    null,
    Buffer.from(`PP-ARTIFACT-AUTH-v1\n${JSON.stringify(canonical)}`, 'utf8'),
    privateKey,
  ).toString('base64');
  const record = {
    runId: REAL_ARTIFACT_RUN_ID,
    artifactSha256: ART,
    verificationParentSha: V,
    trustRootsSha256: sha256Hex(trustRootsText),
    sourceSha: SRC,
    sourceFixtureTree: FIXTURE_TREE,
    sourceAnalysisId: TEST_ANALYSIS_ID,
    keyId: TEST_KEY_ID,
    approvalId: 'D-R1-synthetic-002',
  };
  const proposal = registerModelProposal({
    triples: PC1.map((a) => ({ ...a })),
    renderedCss: CSS,
    runId: REAL_ARTIFACT_RUN_ID,
    approvedSha: V,
    sourceSha: SRC,
    inputSha256: INP,
    artifactSha256: ART,
  });
  return {
    privateKey,
    args: {
      proposal,
      manifestText,
      signatureText,
      trustRootsText,
      recordText: JSON.stringify(record),
      cliValues: {
        runId: REAL_ARTIFACT_RUN_ID,
        sourceSha: SRC,
        sourceFixtureTree: FIXTURE_TREE,
        sourceAnalysisId: TEST_ANALYSIS_ID,
        verificationSha: V,
      },
      observed: {
        head: HEAD,
        parent: V,
        parentCount: 1,
        clean: true,
        diffNames: ['config/artifact-trust-roots.json', 'config/c3-real-run-authorization.json'],
      },
    },
    record,
    manifest,
  };
};

const mintCodeOf = async (mut: (s: ReturnType<typeof validSetup>) => void): Promise<string> => {
  const s = validSetup();
  mut(s);
  const code = await codeOf(() => mintSingleUseRealAuthorization(s.args));
  assert.equal(isRealRunAuthorized(s.args.proposal), false, 'a refused mint leaves no membership behind');
  return code;
};

test('authentication refuses tampered, replayed and wrong-key signatures', async () => {
  const s = validSetup();
  mintSingleUseRealAuthorization(s.args);
  assert.equal(isRealRunAuthorized(s.args.proposal), true, 'positive control mints');
  // Flip one hex character of a bound hash everywhere it is bound: only the signature can
  // catch it, since every binding still agrees.
  const flipped = `${ART.slice(0, 63)}${ART[63] === 'a' ? 'b' : 'a'}`;
  const tampered = (s.args.manifestText as string).replace(ART, flipped);
  assert.notEqual(tampered, s.args.manifestText);
  assert.equal(
    await mintCodeOf((t) => {
      t.args.manifestText = tampered;
      const rec = { ...JSON.parse(t.args.recordText as string), artifactSha256: flipped };
      t.args.recordText = JSON.stringify(rec);
    }),
    'AUTH_SIGNATURE_INVALID',
  );
  // Replayed signature: a valid signature over different bytes.
  const other = validSetup();
  assert.equal(await mintCodeOf((t) => { t.args.signatureText = other.args.signatureText; }), 'AUTH_SIGNATURE_INVALID');
  // Truncated signature text.
  assert.equal(
    await mintCodeOf((t) => { t.args.signatureText = (t.args.signatureText as string).slice(0, 60); }),
    'AUTH_SIGNATURE_MALFORMED',
  );
  // Non-base64 signature text of the right shape class.
  assert.equal(
    await mintCodeOf((t) => { t.args.signatureText = '!'.repeat(88); }),
    'AUTH_SIGNATURE_MALFORMED',
  );
});

test('authentication refuses unknown key ids and substituted trust roots', async () => {
  assert.equal(
    await mintCodeOf((s) => {
      const m = { ...JSON.parse(s.args.manifestText as string), keyId: 'no-such-key-01' };
      const rec = { ...JSON.parse(s.args.recordText as string), keyId: 'no-such-key-01' };
      s.args.manifestText = JSON.stringify(m);
      s.args.recordText = JSON.stringify(rec);
    }),
    'AUTH_UNKNOWN_KEY',
    'unknown key id refuses before any crypto',
  );
  // Substituted roots that still hash-match the record: the manifest key is absent there.
  assert.equal(
    await mintCodeOf((s) => {
      const { publicKey } = generateKeyPairSync('ed25519');
      const rootsText = JSON.stringify({
        version: 1,
        keys: [{ keyId: 'attacker-key', algorithm: 'ed25519', publicKeySpkiBase64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'), status: 'active' }],
      });
      const rec = { ...JSON.parse(s.args.recordText as string), trustRootsSha256: sha256Hex(rootsText) };
      s.args.trustRootsText = rootsText;
      s.args.recordText = JSON.stringify(rec);
    }),
    'AUTH_UNKNOWN_KEY',
  );
  // Malformed roots file with a matching hash: refuses on parse, not on crypto.
  assert.equal(
    await mintCodeOf((s) => {
      const rootsText = '{"version":2,"keys":[]}';
      const rec = { ...JSON.parse(s.args.recordText as string), trustRootsSha256: sha256Hex(rootsText) };
      s.args.trustRootsText = rootsText;
      s.args.recordText = JSON.stringify(rec);
    }),
    'BAD_TRUST_ROOTS',
  );
});

test('authentication refuses altered bound fields (resigned, so only the binding can catch them)', async () => {
  const resign = (s: ReturnType<typeof validSetup>, over: Record<string, unknown>) => {
    const m = { ...JSON.parse(s.args.manifestText as string), ...over };
    const text = manifestTextFor(m);
    const canonical: Record<string, unknown> = {};
    for (const k of Object.keys(m).sort()) canonical[k] = m[k];
    const sig = sign(null, Buffer.from(`PP-ARTIFACT-AUTH-v1\n${JSON.stringify(canonical)}`, 'utf8'), s.privateKey).toString('base64');
    s.args.manifestText = text;
    s.args.signatureText = sig;
  };
  for (
    const [name, over] of [
      ['source revision', { sourceSha: '0'.repeat(40) }],
      ['fixture tree', { sourceFixtureTree: '0'.repeat(40) }],
      ['analysis id', { sourceAnalysisId: 'tampered-analysis' }],
      ['key id', { keyId: 'c3-real-authn-test-02' }],
      ['artifact hash', { artifactSha256: 'f'.repeat(64) }],
    ] as const
  ) {
    assert.equal(await mintCodeOf((s) => resign(s, over as Record<string, unknown>)), 'AUTH_MANIFEST_MISMATCH', `${name}: ${over}`);
  }
});

test('the manifest carries eight fields: no V and no approval', async () => {
  const withV = { ...JSON.parse(validSetup().args.manifestText as string), verificationSha256: V };
  assert.equal(await mintCodeOf((s) => { s.args.manifestText = JSON.stringify(withV); }), 'AUTH_MANIFEST_UNKNOWN_FIELD');
  const withApproval = { ...JSON.parse(validSetup().args.manifestText as string), approvalId: 'D-R1-x' };
  assert.equal(await mintCodeOf((s) => { s.args.manifestText = JSON.stringify(withApproval); }), 'AUTH_MANIFEST_UNKNOWN_FIELD');
  const missing = JSON.parse(validSetup().args.manifestText as string) as Record<string, unknown>;
  delete missing['sourceAnalysisId'];
  assert.equal(await mintCodeOf((s) => { s.args.manifestText = JSON.stringify(missing); }), 'AUTH_MANIFEST_MISSING_FIELD');
  // The record DOES carry the approval that the manifest never does.
  const s = validSetup();
  assert.equal((JSON.parse(s.args.recordText as string) as Record<string, unknown>)['approvalId'], 'D-R1-synthetic-002');
  mintSingleUseRealAuthorization(s.args);
  assert.equal(isRealRunAuthorized(s.args.proposal), true, 'approval lives in the record, not the manifest');
});
