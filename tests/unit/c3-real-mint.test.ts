// C3 real-run mint bridge: non-forgeability, single-use, and differential agreement with Zone P.
//
// Synthetic only: test keys are generated in memory per run; the real stored proposal, real
// keys, credentials and providers are never touched. The differential section proves the
// mint's Zone E manifest parser and Ed25519 check agree with `parseSignatureManifest` /
// `verifyArtifactAuthentication` on shared vectors, since the mint cannot import provenance
// code and the two implementations would otherwise diverge silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import * as mintModule from '../../packages/core/src/model-real-authorization.ts';
import {
  isRealRunAuthorized,
  mintSingleUseRealAuthorization,
  ModelAuthorizationError,
  REAL_ARTIFACT_RUN_ID,
} from '../../packages/core/src/model-real-authorization.ts';
import { registerModelProposal, renderCssAdjustments, type CssAdjustment } from '../../packages/core/src/index.ts';
import {
  AuthError,
  parseSignatureManifest,
  verifyArtifactAuthentication,
} from '../../packages/provenance/src/artifact-auth.ts';
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
const KEY_ID = 'c3-real-mint-test-01';

const codeOf = async (fn: () => unknown): Promise<string> => {
  try {
    await fn();
    return 'NO_ERROR';
  } catch (e) {
    if (e instanceof ModelAuthorizationError) return e.code;
    return `OTHER:${(e as Error).message}`;
  }
};

const validSetup = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeySpkiBase64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const trustRootsText = JSON.stringify({
    version: 1,
    keys: [{ keyId: KEY_ID, algorithm: 'ed25519', publicKeySpkiBase64, status: 'active' }],
  });
  const manifest = {
    authVersion: 1 as const,
    keyId: KEY_ID,
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
    keyId: KEY_ID,
    approvalId: 'D-R1-synthetic-003',
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
    publicKeySpkiBase64,
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
  };
};

test('the mint module exports exactly the two bridge functions (plus constants and the error)', () => {
  const fns = Object.keys(mintModule).filter((k) => typeof (mintModule as Record<string, unknown>)[k] === 'function').sort();
  assert.deepEqual(fns, ['ModelAuthorizationError', 'isRealRunAuthorized', 'mintSingleUseRealAuthorization']);
});

test('caller assertion alone mints nothing: booleans, lookalikes and the public E1 path', async () => {
  // The public E1 registration path alone never creates AUTHORIZED membership.
  const s = validSetup();
  assert.equal(isRealRunAuthorized(s.args.proposal), false, 'registration is not authorization');
  // An authenticated-looking plain object (the Zone P data shape, no signature) is refused.
  const lookalike = {
    ...s.args,
    manifestText: JSON.stringify({
      keyId: KEY_ID,
      runId: REAL_ARTIFACT_RUN_ID,
      artifactSha256: ART,
      inputSha256: INP,
      sourceSha: SRC,
      sourceFixtureTree: FIXTURE_TREE,
      sourceAnalysisId: TEST_ANALYSIS_ID,
    }),
  };
  assert.equal(await codeOf(() => mintSingleUseRealAuthorization(lookalike)), 'AUTH_MANIFEST_MISSING_FIELD');
  assert.equal(isRealRunAuthorized(s.args.proposal), false);
  // A spread copy of a minted proposal is a different object: copies are refused.
  mintSingleUseRealAuthorization(s.args);
  assert.equal(isRealRunAuthorized({ ...s.args.proposal }), false, 'copies never carry membership');
  assert.equal(isRealRunAuthorized(s.args.proposal), true, 'only the minted object passes, once');
});

test('minted membership is single-use and bound to one V', async () => {
  const s = validSetup();
  mintSingleUseRealAuthorization(s.args);
  assert.equal(isRealRunAuthorized(s.args.proposal), true, 'first check consumes');
  assert.equal(isRealRunAuthorized(s.args.proposal), false, 'second check refuses: already spent');
  // Re-minting after consumption works: the full gate restarts.
  mintSingleUseRealAuthorization(s.args);
  assert.equal(isRealRunAuthorized(s.args.proposal), true, 'a fresh mint re-authorizes');
  assert.equal(isRealRunAuthorized(s.args.proposal), false);
  // The same proposal object cannot be carried to another V.
  const other = validSetup();
  const rec = { ...JSON.parse(other.args.recordText as string), verificationParentSha: '0'.repeat(40) };
  assert.equal(
    await codeOf(() =>
      mintSingleUseRealAuthorization({
        ...other.args,
        proposal: s.args.proposal,
        recordText: JSON.stringify(rec),
        cliValues: { ...other.args.cliValues, verificationSha: '0'.repeat(40) },
        observed: { ...other.args.observed, parent: '0'.repeat(40) },
      })),
    'RECORD_MISMATCH',
  );
});

test('a synthetic run id can never mint, even with a valid signature', async () => {
  const s = validSetup();
  const synthetic = registerModelProposal({
    triples: PC1.map((a) => ({ ...a })),
    renderedCss: CSS,
    runId: 'c3-test-source-001',
    approvedSha: V,
    sourceSha: SRC,
    inputSha256: INP,
    artifactSha256: ART,
  });
  assert.equal(
    await codeOf(() => mintSingleUseRealAuthorization({ ...s.args, proposal: synthetic })),
    'REAL_ID_REQUIRED',
  );
  assert.equal(isRealRunAuthorized(synthetic), false);
});

// ---------------------------------------------------------- differential vs Zone P

const zonePParseCode = (text: string): string => {
  try {
    parseSignatureManifest(text);
    return 'NO_ERROR';
  } catch (e) {
    if (e instanceof AuthError) return e.code;
    return `OTHER:${(e as Error).message}`;
  }
};

test('differential: the mint parser agrees with Zone P on shared manifest vectors', async () => {
  const s = validSetup();
  const base = JSON.parse(s.args.manifestText as string) as Record<string, unknown>;
  const vectors: Array<[string, string]> = [
    ['valid', s.args.manifestText as string],
    ['malformed json', '{"authVersion": 1,'],
    ['non-object', '[1,2,3]'],
    ['empty object', '{}'],
    ['duplicate key', `{"authVersion":1,"authVersion":1,"keyId":"${KEY_ID}","runId":"${REAL_ARTIFACT_RUN_ID}","artifactSha256":"${ART}","inputSha256":"${INP}","sourceSha":"${SRC}","sourceFixtureTree":"${FIXTURE_TREE}","sourceAnalysisId":"${TEST_ANALYSIS_ID}"}`],
    ['duplicate key via unicode escape', `{"authVersion":1,"keyId":"${KEY_ID}","runId":"${REAL_ARTIFACT_RUN_ID}","artifactSha256":"${ART}","inputSha256":"${INP}","sourceSha":"${SRC}","sourceFixtureTree":"${FIXTURE_TREE}","sourceAnalysisId":"${TEST_ANALYSIS_ID}","\\u006beyId":"x"}`],
    ['proto key', `{"authVersion":1,"__proto__":{},"keyId":"${KEY_ID}","runId":"${REAL_ARTIFACT_RUN_ID}","artifactSha256":"${ART}","inputSha256":"${INP}","sourceSha":"${SRC}","sourceFixtureTree":"${FIXTURE_TREE}","sourceAnalysisId":"${TEST_ANALYSIS_ID}"}`],
    ['unknown field', JSON.stringify({ ...base, verificationSha: V })],
    ['missing field', JSON.stringify(Object.fromEntries(Object.entries(base).filter(([k]) => k !== 'sourceSha')))],
    ['bad authVersion', JSON.stringify({ ...base, authVersion: 2 })],
    ['string authVersion', JSON.stringify({ ...base, authVersion: '1' })],
    ['non-string keyId', JSON.stringify({ ...base, keyId: 42 })],
    ['bad keyId shape', JSON.stringify({ ...base, keyId: '-bad' })],
    ['bad artifact hash', JSON.stringify({ ...base, artifactSha256: 'zz' })],
    ['bad source revision', JSON.stringify({ ...base, sourceSha: 'abc' })],
    ['empty analysis id', JSON.stringify({ ...base, sourceAnalysisId: '' })],
    ['oversize analysis id', JSON.stringify({ ...base, sourceAnalysisId: 'x'.repeat(201) })],
    ['trailing data', `${s.args.manifestText} `],
    ['whitespace variant', JSON.stringify(JSON.parse(s.args.manifestText as string), null, 2)],
    ['escaped runId', (s.args.manifestText as string).replace('"runId":"c3-live-meta-001"', '"runId":"\\u00633-live-meta-001"')],
  ];
  for (const [name, vector] of vectors) {
    const zoneP = zonePParseCode(vector);
    const mint = await codeOf(() => mintSingleUseRealAuthorization({ ...s.args, manifestText: vector }));
    // The mint may refuse earlier (record/observed checks pass here) or at parse; the parse
    // decision must match Zone P exactly on every vector.
    assert.equal(mint, zoneP, `${name}: mint=${mint} vs zoneP=${zoneP}`);
  }
});

test('differential: the mint signature check agrees with Zone P on shared vectors', async () => {
  const s = validSetup();
  const zonePIndex = () => {
    const manifest = parseSignatureManifest(s.args.manifestText as string);
    const roots = JSON.parse(s.args.trustRootsText as string) as { version: 1; keys: Array<{ keyId: string; algorithm: 'ed25519'; publicKeySpkiBase64: string; status: 'active' }> };
    return { manifest, roots };
  };
  // Valid vector: Zone P verifies, the mint mints.
  {
    const { manifest, roots } = zonePIndex();
    verifyArtifactAuthentication({
      manifest,
      signatureBase64: s.args.signatureText as string,
      runId: manifest.runId,
      artifactHash: manifest.artifactSha256,
      inputSha256: manifest.inputSha256,
      sourceSha: manifest.sourceSha,
      sourceFixtureTree: manifest.sourceFixtureTree,
      sourceAnalysisId: manifest.sourceAnalysisId,
      trustRoots: roots,
    });
    mintSingleUseRealAuthorization(s.args);
    assert.equal(isRealRunAuthorized(s.args.proposal), true, 'valid vector mints in the mint and verifies in Zone P');
  }
  // Tampered payload with the original signature: both refuse the binding mismatch, since
  // the presented artifact bytes (what Zone P loads from disk, what the record binds) no
  // longer match the manifest claim.
  {
    const tampered = (s.args.manifestText as string).replace(ART, 'f'.repeat(64));
    const zoneP = (() => {
      try {
        const manifest = parseSignatureManifest(tampered);
        const roots = JSON.parse(s.args.trustRootsText as string) as Parameters<typeof verifyArtifactAuthentication>[0]['trustRoots'];
        verifyArtifactAuthentication({
          manifest,
          signatureBase64: s.args.signatureText as string,
          runId: manifest.runId,
          artifactHash: ART,
          inputSha256: manifest.inputSha256,
          sourceSha: manifest.sourceSha,
          sourceFixtureTree: manifest.sourceFixtureTree,
          sourceAnalysisId: manifest.sourceAnalysisId,
          trustRoots: roots,
        });
        return 'NO_ERROR';
      } catch (e) {
        if (e instanceof AuthError) return e.code;
        return `OTHER:${(e as Error).message}`;
      }
    })();
    const mint = await codeOf(() => mintSingleUseRealAuthorization({ ...s.args, manifestText: tampered }));
    assert.equal(zoneP, 'AUTH_MANIFEST_MISMATCH', `zone P tamper decision: ${zoneP}`);
    assert.equal(mint, zoneP, `mint tamper decision matches: ${mint}`);
  }
  // Wrong-key signature with both keys enrolled: both refuse signature-invalid.
  {
    const other = generateKeyPairSync('ed25519');
    const otherSpki = other.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    const rootsText = JSON.stringify({
      version: 1,
      keys: [
        { keyId: KEY_ID, algorithm: 'ed25519', publicKeySpkiBase64: s.publicKeySpkiBase64, status: 'active' },
        { keyId: 'second-key', algorithm: 'ed25519', publicKeySpkiBase64: otherSpki, status: 'active' },
      ],
    });
    const manifest = parseSignatureManifest(s.args.manifestText as string);
    const canonical: Record<string, unknown> = {};
    for (const k of Object.keys(manifest).sort()) canonical[k] = manifest[k as keyof typeof manifest];
    const wrongSig = sign(null, Buffer.from(`PP-ARTIFACT-AUTH-v1\n${JSON.stringify(canonical)}`, 'utf8'), other.privateKey).toString('base64');
    const zoneP = (() => {
      try {
        verifyArtifactAuthentication({
          manifest,
          signatureBase64: wrongSig,
          runId: manifest.runId,
          artifactHash: manifest.artifactSha256,
          inputSha256: manifest.inputSha256,
          sourceSha: manifest.sourceSha,
          sourceFixtureTree: manifest.sourceFixtureTree,
          sourceAnalysisId: manifest.sourceAnalysisId,
          trustRoots: JSON.parse(rootsText),
        });
        return 'NO_ERROR';
      } catch (e) {
        if (e instanceof AuthError) return e.code;
        return `OTHER:${(e as Error).message}`;
      }
    })();
    const rec = { ...JSON.parse(s.args.recordText as string), trustRootsSha256: sha256Hex(rootsText) };
    const mint = await codeOf(() =>
      mintSingleUseRealAuthorization({ ...s.args, trustRootsText: rootsText, recordText: JSON.stringify(rec), signatureText: wrongSig }),
    );
    assert.equal(zoneP, 'AUTH_SIGNATURE_INVALID', `zone P wrong-key decision: ${zoneP}`);
    assert.equal(mint, zoneP, `mint wrong-key decision matches: ${mint}`);
  }
});
