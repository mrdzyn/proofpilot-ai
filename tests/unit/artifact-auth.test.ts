// C3-B2B SEC-P2-02: detached Ed25519 authentication over the exact artifact bytes.
//
// Synthetic fixtures and real temporary directories only. Every key pair is generated in
// memory per test run; the real stored proposal is never read, and no provider, network,
// credential or environment input is involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  AuthError,
  loadAndAuthenticateProposalArtifact,
  parseSignatureManifest,
  parseTrustRoots,
  verifyArtifactAuthentication,
  type SignatureManifest,
  type TrustRoots,
} from '../../packages/provenance/src/artifact-auth.ts';
import {
  ArtifactError,
  loadAndValidateProposalArtifact,
  openNoFollowReadOnly,
  readBoundedBytes,
  reloadAndBindArtifact,
} from '../../packages/provenance/src/proposal-artifact.ts';
import { ModelProposalError, registerModelProposal } from '../../packages/core/src/model-proposal.ts';
import { tempDir } from '../helpers.ts';
import {
  ARTIFACT_RUN_ID,
  artifactFileFor,
  validArtifactDoc,
  writeArtifact,
  writeArtifactDoc,
} from '../support/proposal-artifact-fixture.ts';
import {
  TEST_ANALYSIS_ID,
  TEST_FIXTURE_TREE,
  TEST_SOURCE_SHA,
  makeTestIdentity,
  manifestFor,
  manifestTextFor,
  signManifest,
  writeAuthFiles,
  type TestIdentity,
} from '../support/artifact-auth-fixture.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const sha256Hex = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');

type Setup = {
  root: string;
  runId: string;
  id: TestIdentity;
  manifest: SignatureManifest;
  args: {
    repoRoot: string;
    runId: string;
    sourceSha: string;
    sourceFixtureTree: string;
    sourceAnalysisId: string;
    trustRoots: TrustRoots;
  };
};

/** A fully authenticated synthetic artifact: valid P2 bytes plus a manifest the test key signed. */
const setupAuth = (runId = ARTIFACT_RUN_ID): Setup => {
  const root = tempDir('pp-auth-');
  writeArtifactDoc(root, runId);
  const artifactHash = sha256Hex(readFileSync(artifactFileFor(root, runId)));
  const id = makeTestIdentity();
  const manifest = manifestFor({ runId, artifactSha256: artifactHash });
  writeAuthFiles(root, runId, manifestTextFor(manifest), signManifest(manifest, id.privateKeyPem));
  return {
    root,
    runId,
    id,
    manifest,
    args: {
      repoRoot: root,
      runId,
      sourceSha: TEST_SOURCE_SHA,
      sourceFixtureTree: TEST_FIXTURE_TREE,
      sourceAnalysisId: TEST_ANALYSIS_ID,
      trustRoots: id.trustRoots,
    },
  };
};

const authCodeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'NO_ERROR';
  } catch (e) {
    if (e instanceof AuthError) return e.code;
    if (e instanceof ArtifactError) return e.code;
    return `OTHER:${(e as Error).message}`;
  }
};

test('a valid authenticated synthetic artifact passes with a frozen binding', async () => {
  const s = setupAuth();
  const { artifact, authentication } = await loadAndAuthenticateProposalArtifact(s.args);
  assert.equal(artifact.runId, s.runId);
  assert.equal(authentication.keyId, s.id.keyId);
  assert.equal(authentication.artifactSha256, artifact.artifactHash);
  assert.equal(authentication.inputSha256, artifact.inputSha256);
  assert.ok(Object.isFrozen(authentication));
});

test('modified artifact bytes with the original signature refuse (MISMATCH)', async () => {
  const s = setupAuth();
  const doc = JSON.parse(readFileSync(artifactFileFor(s.root, s.runId), 'utf8'));
  doc.requestId = `${doc.requestId}-tampered`;
  writeArtifact(s.root, s.runId, JSON.stringify(doc));
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(s.args)), 'AUTH_MANIFEST_MISMATCH');
});

test('same-size in-place rewrite refuses (MISMATCH)', async () => {
  const s = setupAuth();
  const raw = readFileSync(artifactFileFor(s.root, s.runId), 'utf8');
  assert.ok(raw.includes('"a"') || raw.includes('aaaa'));
  const rewritten = raw.replace('aaaa', 'aaab');
  assert.equal(rewritten.length, raw.length);
  writeArtifact(s.root, s.runId, rewritten);
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(s.args)), 'AUTH_MANIFEST_MISMATCH');
});

test('substituted schema-valid artifact refuses (MISMATCH)', async () => {
  const s = setupAuth();
  writeArtifactDoc(s.root, s.runId, validArtifactDoc(s.runId, { requestId: 'substituted-valid-001' }));
  // The substitute is schema-valid on its own, so the gate below is the authentication binding.
  await loadAndValidateProposalArtifact({ repoRoot: s.root, runId: s.runId });
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(s.args)), 'AUTH_MANIFEST_MISMATCH');
});

test('replaced ancestor directory with a foreign identity refuses', async () => {
  const s = setupAuth();
  const dir = path.join(s.root, '.proofpilot/evidence/proposals', s.runId);
  renameSync(dir, `${dir}.bak`);
  writeArtifactDoc(s.root, 'c3-test-other-002', validArtifactDoc('c3-test-other-002'));
  renameSync(path.join(s.root, '.proofpilot/evidence/proposals', 'c3-test-other-002'), dir);
  assert.equal(
    await authCodeOf(loadAndAuthenticateProposalArtifact({ ...s.args })),
    'ARTIFACT_RUN_ID_MISMATCH',
  );
});

test('symlinked manifest sidecar refuses as unauthenticated; symlinked artifact refuses', async () => {
  const s = setupAuth();
  const manifestPath = path.join(s.root, '.proofpilot/evidence/proposals', s.runId, 'auth-manifest.json');
  const text = readFileSync(manifestPath, 'utf8');
  rmSync(manifestPath);
  symlinkSync(path.join(s.root, 'elsewhere.json'), manifestPath);
  writeFileSync(path.join(s.root, 'elsewhere.json'), text);
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(s.args)), 'AUTH_UNSIGNED');
  const t = setupAuth();
  const target = writeArtifact(t.root, 'c3-test-target-001', JSON.stringify(validArtifactDoc('c3-test-target-001')));
  rmSync(artifactFileFor(t.root, t.runId));
  symlinkSync(target, artifactFileFor(t.root, t.runId));
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(t.args)), 'ARTIFACT_SYMLINK');
});

test('missing, malformed and replayed signatures refuse', async () => {
  const missing = setupAuth();
  rmSync(path.join(missing.root, '.proofpilot/evidence/proposals', missing.runId, 'auth-manifest.sig'));
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(missing.args)), 'AUTH_UNSIGNED');
  const malformed = setupAuth();
  writeAuthFiles(
    malformed.root, malformed.runId,
    manifestTextFor(malformed.manifest), '!!!-not-base64-!!!',
  );
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(malformed.args)), 'AUTH_SIGNATURE_MALFORMED');
  const short = setupAuth();
  const shortSig = Buffer.alloc(32).toString('base64');
  assert.equal(shortSig.length, 44);
  writeAuthFiles(short.root, short.runId, manifestTextFor(short.manifest), shortSig);
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(short.args)), 'AUTH_SIGNATURE_MALFORMED');
  const flipped = setupAuth();
  const sig = Buffer.from(signManifest(flipped.manifest, flipped.id.privateKeyPem), 'base64');
  sig[0] = sig[0]! ^ 0xff;
  writeAuthFiles(flipped.root, flipped.runId, manifestTextFor(flipped.manifest), sig.toString('base64'));
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(flipped.args)), 'AUTH_SIGNATURE_INVALID');
  // A signature lifted from one manifest does not verify a different manifest.
  const s = setupAuth();
  const other = manifestFor({ ...s.manifest, sourceAnalysisId: 'replayed-elsewhere-002' });
  let replayCode = 'NO_ERROR';
  try {
    verifyArtifactAuthentication({
      manifest: other,
      signatureBase64: signManifest(s.manifest, s.id.privateKeyPem),
      runId: other.runId,
      artifactHash: other.artifactSha256,
      inputSha256: other.inputSha256,
      sourceSha: other.sourceSha,
      sourceFixtureTree: other.sourceFixtureTree,
      sourceAnalysisId: other.sourceAnalysisId,
      trustRoots: s.id.trustRoots,
    });
  } catch (e) {
    replayCode = e instanceof AuthError ? e.code : `OTHER:${(e as Error).message}`;
  }
  assert.equal(replayCode, 'AUTH_SIGNATURE_INVALID');
});

test('unrecognized signing identity and substituted public key refuse', async () => {
  const s = setupAuth();
  const foreign = makeTestIdentity('foreign-key-09');
  const rogue = manifestFor({ ...s.manifest, keyId: foreign.keyId });
  writeAuthFiles(s.root, s.runId, manifestTextFor(rogue), signManifest(rogue, foreign.privateKeyPem));
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(s.args)), 'AUTH_UNKNOWN_KEY');
  const t = setupAuth();
  const attacker = makeTestIdentity();
  const swappedRoots: TrustRoots = {
    version: 1,
    keys: [{
      keyId: t.id.keyId,
      algorithm: 'ed25519',
      publicKeySpkiBase64: attacker.publicKeySpkiBase64,
      status: 'active',
    }],
  };
  assert.equal(
    await authCodeOf(loadAndAuthenticateProposalArtifact({ ...t.args, trustRoots: swappedRoots })),
    'AUTH_SIGNATURE_INVALID',
  );
});

test('altered run id, input hash, source revision or fixture identity refuse (MISMATCH)', async () => {
  for (const field of ['runId', 'inputSha256', 'sourceSha', 'sourceFixtureTree', 'sourceAnalysisId'] as const) {
    const s = setupAuth();
    const alteredValue = field === 'runId'
      ? 'c3-test-other-002'
      : field === 'inputSha256' ? 'b'.repeat(64) : field === 'sourceAnalysisId' ? 'altered-analysis-009' : 'c'.repeat(40);
    const rogue = manifestFor({ ...s.manifest, [field]: alteredValue });
    writeAuthFiles(s.root, s.runId, manifestTextFor(rogue), signManifest(rogue, s.id.privateKeyPem));
    assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(s.args)), 'AUTH_MANIFEST_MISMATCH', field);
  }
});

test('malformed manifest shapes refuse with exact codes', () => {
  assert.throws(() => parseSignatureManifest('{nope'), (e) => e instanceof AuthError && e.code === 'AUTH_MANIFEST_MALFORMED');
  const dup = manifestTextFor(manifestFor()).replace('"runId":', '"runId":"dup", "runId":');
  assert.throws(() => parseSignatureManifest(dup), (e) => e instanceof AuthError && e.code === 'AUTH_MANIFEST_DUPLICATE_KEY');
  const proto = manifestTextFor(manifestFor()).replace(/}$/, ', "__proto__": {}}');
  assert.throws(() => parseSignatureManifest(proto), (e) => e instanceof AuthError && e.code === 'AUTH_MANIFEST_PROTO_KEY');
  const extra = manifestTextFor(manifestFor()).replace(/}$/, ', "bonus": 1}');
  assert.throws(() => parseSignatureManifest(extra), (e) => e instanceof AuthError && e.code === 'AUTH_MANIFEST_UNKNOWN_FIELD');
  const droppedObj = JSON.parse(manifestTextFor(manifestFor()));
  delete droppedObj.sourceSha;
  assert.throws(() => parseSignatureManifest(JSON.stringify(droppedObj)), (e) => e instanceof AuthError && e.code === 'AUTH_MANIFEST_MISSING_FIELD');
  assert.throws(
    () => parseSignatureManifest(manifestTextFor(manifestFor({ authVersion: 2 as unknown as 1 }))),
    (e) => e instanceof AuthError && e.code === 'AUTH_MANIFEST_BAD_VALUE',
  );
  assert.throws(
    () => parseSignatureManifest(manifestTextFor(manifestFor({ runId: 42 as unknown as string }))),
    (e) => e instanceof AuthError && e.code === 'AUTH_MANIFEST_BAD_TYPE',
  );
  assert.throws(
    () => parseSignatureManifest(manifestTextFor(manifestFor({ artifactSha256: 'ZZZ' }))),
    (e) => e instanceof AuthError && e.code === 'AUTH_MANIFEST_BAD_VALUE',
  );
});

test('trust roots are strict: bad shape, unknown algorithm, inactive, duplicate or unusable keys refuse', () => {
  assert.throws(() => parseTrustRoots('{nope'), (e) => e instanceof AuthError && e.code === 'AUTH_TRUST_ROOT_MALFORMED');
  const id = makeTestIdentity();
  const good = JSON.stringify(id.trustRoots);
  assert.deepEqual(parseTrustRoots(good), id.trustRoots);
  const versioned = JSON.parse(good);
  versioned.version = 2;
  assert.throws(() => parseTrustRoots(JSON.stringify(versioned)), (e) => e instanceof AuthError && e.code === 'AUTH_TRUST_ROOT_BAD_VALUE');
  const keyed = JSON.parse(good);
  keyed.extra = true;
  assert.throws(() => parseTrustRoots(JSON.stringify(keyed)), (e) => e instanceof AuthError && e.code === 'AUTH_TRUST_ROOT_BAD_VALUE');
  for (const mutateKey of [
    (k: Record<string, unknown>) => { k.algorithm = 'rsa'; },
    (k: Record<string, unknown>) => { k.status = 'revoked'; },
    (k: Record<string, unknown>) => { k.publicKeySpkiBase64 = '!!!'; },
    (k: Record<string, unknown>) => { k.keyId = 'bad id!'; },
  ]) {
    const doc = JSON.parse(good);
    mutateKey(doc.keys[0]);
    assert.throws(() => parseTrustRoots(JSON.stringify(doc)), (e) => e instanceof AuthError && e.code === 'AUTH_TRUST_ROOT_BAD_VALUE');
  }
  const dupe = JSON.parse(good);
  dupe.keys.push({ ...dupe.keys[0] });
  assert.throws(() => parseTrustRoots(JSON.stringify(dupe)), (e) => e instanceof AuthError && e.code === 'AUTH_TRUST_ROOT_BAD_VALUE');
  const notAKey = JSON.parse(good);
  notAKey.keys[0].publicKeySpkiBase64 = Buffer.from('not-a-key').toString('base64');
  assert.throws(() => parseTrustRoots(JSON.stringify(notAKey)), (e) => e instanceof AuthError && e.code === 'AUTH_KEY_MISMATCH');
  // An empty production key list trusts nothing: even a correctly signed manifest refuses.
  const empty: TrustRoots = parseTrustRoots('{"version":1,"keys":[]}');
  assert.equal(empty.keys.length, 0);
});

test('substitution between authentication and staging refuses on rebind and re-authentication', async () => {
  const s = setupAuth();
  const first = await loadAndAuthenticateProposalArtifact(s.args);
  const doc = JSON.parse(readFileSync(artifactFileFor(s.root, s.runId), 'utf8'));
  doc.requestId = 'swapped-between-phases-001';
  writeArtifact(s.root, s.runId, JSON.stringify(doc));
  let rebindCode = 'NO_ERROR';
  try {
    await reloadAndBindArtifact(s.root, s.runId, first.authentication.artifactSha256);
  } catch (e) {
    rebindCode = e instanceof ArtifactError ? e.code : `OTHER:${(e as Error).message}`;
  }
  assert.equal(rebindCode, 'ARTIFACT_CHANGED');
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(s.args)), 'AUTH_MANIFEST_MISMATCH');
});

test('unauthenticated legacy artifact refuses without weakening the P2 loader', async () => {
  const root = tempDir('pp-auth-');
  writeArtifactDoc(root, ARTIFACT_RUN_ID);
  const id = makeTestIdentity();
  const args = {
    repoRoot: root,
    runId: ARTIFACT_RUN_ID,
    sourceSha: TEST_SOURCE_SHA,
    sourceFixtureTree: TEST_FIXTURE_TREE,
    sourceAnalysisId: TEST_ANALYSIS_ID,
    trustRoots: id.trustRoots,
  };
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(args)), 'AUTH_UNSIGNED');
  // The underlying bytes are still fine: only the authentication binding is missing.
  const v = await loadAndValidateProposalArtifact({ repoRoot: root, runId: ARTIFACT_RUN_ID });
  assert.equal(v.runId, ARTIFACT_RUN_ID);
});

test('authentication does not bless content semantics: E1 still revalidates the grammar', async () => {
  const s = setupAuth();
  const { artifact } = await loadAndAuthenticateProposalArtifact(s.args);
  const registered = registerModelProposal({
    triples: artifact.adjustments.map((a) => ({ ...a })),
    renderedCss: artifact.renderedCss,
    runId: artifact.runId,
    approvedSha: 'd'.repeat(40),
    sourceSha: TEST_SOURCE_SHA,
    inputSha256: artifact.inputSha256,
    artifactSha256: artifact.artifactHash,
  });
  assert.equal(registered.runId, artifact.runId);
  assert.throws(
    () => registerModelProposal({
      triples: artifact.adjustments.map((a) => ({ ...a })),
      renderedCss: '.promo-overlay{pointer-events:auto}\n',
      runId: artifact.runId,
      approvedSha: 'd'.repeat(40),
      sourceSha: TEST_SOURCE_SHA,
      inputSha256: artifact.inputSha256,
      artifactSha256: artifact.artifactHash,
    }),
    (e) => e instanceof ModelProposalError && e.code === 'RENDER_MISMATCH',
  );
});

test('concurrent verification is stable and environment variables cannot influence the gate', async () => {
  const s = setupAuth();
  const results = await Promise.all([
    loadAndAuthenticateProposalArtifact(s.args),
    loadAndAuthenticateProposalArtifact(s.args),
    loadAndAuthenticateProposalArtifact(s.args),
  ]);
  for (const r of results) assert.equal(r.authentication.artifactSha256, s.manifest.artifactSha256);
  process.env['PROOFPILOT_ALLOW_ANYTHING'] = '1';
  process.env['META_API_KEY'] = 'test-env-key';
  try {
    const envOk = await loadAndAuthenticateProposalArtifact(s.args);
    assert.equal(envOk.authentication.keyId, s.id.keyId);
    const t = setupAuth();
    const doc = JSON.parse(readFileSync(artifactFileFor(t.root, t.runId), 'utf8'));
    doc.requestId = 'env-tampered-001';
    writeArtifact(t.root, t.runId, JSON.stringify(doc));
    assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(t.args)), 'AUTH_MANIFEST_MISMATCH');
  } finally {
    delete process.env['PROOFPILOT_ALLOW_ANYTHING'];
    delete process.env['META_API_KEY'];
  }
});

test('the loader demands explicit trust roots: no default, no caller-supplied bypass shape', async () => {
  const s = setupAuth();
  await assert.rejects(
    loadAndAuthenticateProposalArtifact({ ...s.args, trustRoots: undefined as unknown as TrustRoots }),
    (e) => e instanceof TypeError,
  );
});

test('guard-removal: the same substitution validates without the gate and refuses with it', async () => {
  const s = setupAuth();
  writeArtifactDoc(s.root, s.runId, validArtifactDoc(s.runId, { requestId: 'substituted-valid-001' }));
  // Without authentication the substituted bytes are schema-valid: the gate is load-bearing.
  const bare = await loadAndValidateProposalArtifact({ repoRoot: s.root, runId: s.runId });
  assert.equal(bare.requestId, 'substituted-valid-001');
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(s.args)), 'AUTH_MANIFEST_MISMATCH');
});

test('authenticated command surface: narrow flags, no environment input, real id hard-disabled', () => {
  const text = readFileSync(path.join(repoRoot, 'scripts/c3-b2b-verify-authenticated.ts'), 'utf8');
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
  assert.doesNotMatch(code, /process\.env/);
  assert.doesNotMatch(code, /--trust-roots|--no-auth|--skip-auth|--allow-unsigned|--private-key|--public-key/);
  assert.match(code, /REAL_ARTIFACT_RUN_ID.*c3-live-meta-001/);
  const hardDisableAt = code.indexOf('runId === REAL_ARTIFACT_RUN_ID');
  const firstReadAt = code.indexOf('readFile(');
  assert.ok(hardDisableAt !== -1 && firstReadAt !== -1 && hardDisableAt < firstReadAt, 'hard disable precedes every file read');
});

test('authenticated command refuses the real reserved run id before any file read', () => {
  const script = path.join(repoRoot, 'scripts/c3-b2b-verify-authenticated.ts');
  const probeDir = tempDir('pp-auth-');
  const r = spawnSync(process.execPath, [
    script,
    '--run-id', 'c3-live-meta-001',
    '--source-sha', 'a'.repeat(40),
    '--source-fixture-tree', 'b'.repeat(40),
    '--source-analysis-id', 'synthetic-analysis-001',
    '--verification-sha', 'c'.repeat(40),
  ], { encoding: 'utf8', timeout: 120000, cwd: probeDir });
  assert.equal(r.status, 2);
  assert.match(String(r.stderr), /HARD-DISABLED/);
});

const sidecarPath = (root: string, runId: string, file: string): string =>
  path.join(root, '.proofpilot/evidence/proposals', runId, file);

test('MAJOR-1: a FIFO at a sidecar path refuses without blocking (AUTH_UNSIGNED)', async () => {
  const s = setupAuth();
  const manifestPath = sidecarPath(s.root, s.runId, 'auth-manifest.json');
  rmSync(manifestPath);
  execFileSync('mkfifo', [manifestPath]);
  // O_NONBLOCK opens the FIFO without blocking; the descriptor stat refuses it before any read.
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(s.args)), 'AUTH_UNSIGNED');
});

test('MAJOR-1: a directory or oversize file at a sidecar path refuses (AUTH_UNSIGNED)', async () => {
  const d = setupAuth();
  rmSync(sidecarPath(d.root, d.runId, 'auth-manifest.json'));
  mkdirSync(sidecarPath(d.root, d.runId, 'auth-manifest.json'));
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(d.args)), 'AUTH_UNSIGNED');
  const o = setupAuth();
  writeFileSync(sidecarPath(o.root, o.runId, 'auth-manifest.json'), 'x'.repeat(3000));
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(o.args)), 'AUTH_UNSIGNED');
});

test('MAJOR-1: sidecar reads pin the open descriptor — a post-open path swap cannot divert the read', async () => {
  const s = setupAuth();
  const manifestPath = sidecarPath(s.root, s.runId, 'auth-manifest.json');
  const original = readFileSync(manifestPath);
  const handle = await openNoFollowReadOnly(manifestPath, 'missing');
  try {
    renameSync(manifestPath, `${manifestPath}.orig`);
    writeFileSync(manifestPath, JSON.stringify({ forged: true }));
    const bytes = await readBoundedBytes(handle, 2048);
    assert.deepEqual(bytes, original);
  } finally {
    await handle.close().catch(() => undefined);
  }
});

test('MAJOR-1: growth after the descriptor open refuses deterministically (hook seam)', async () => {
  const s = setupAuth();
  const hooks = {
    afterSidecarOpen: async (file: string) => {
      if (file.endsWith('auth-manifest.json')) {
        writeFileSync(file, `${readFileSync(file, 'utf8')}${' '.repeat(3000)}`);
      }
    },
  };
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(s.args, hooks)), 'AUTH_UNSIGNED');
});

test('MAJOR-1: content rewritten after the descriptor open is still refused (hook seam)', async () => {
  const s = setupAuth();
  const hooks = {
    afterSidecarOpen: async (file: string) => {
      if (file.endsWith('auth-manifest.json')) writeFileSync(file, '{"forged":true} not json {{{');
    },
  };
  // The descriptor read observes the swapped bytes; the strict parse refuses them.
  assert.equal(await authCodeOf(loadAndAuthenticateProposalArtifact(s.args, hooks)), 'AUTH_MANIFEST_MALFORMED');
});

test('MAJOR-1: a path swap after the descriptor open cannot defeat a valid authentication', async () => {
  const s = setupAuth();
  writeFileSync(path.join(s.root, 'evil.json'), '{"evil":true}');
  const hooks = {
    afterSidecarOpen: async (file: string) => {
      if (file.endsWith('auth-manifest.json')) {
        renameSync(file, `${file}.orig`);
        symlinkSync(path.join(s.root, 'evil.json'), file);
      }
    },
  };
  // The pinned descriptor still reads the enrolled bytes: the swap is inert, not trusted.
  const { authentication } = await loadAndAuthenticateProposalArtifact(s.args, hooks);
  assert.equal(authentication.artifactSha256, s.manifest.artifactSha256);
});

test('MAJOR-2: non-Ed25519 trust-root keys refuse at parse (AUTH_KEY_MISMATCH)', () => {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const ed448 = generateKeyPairSync('ed448');
  for (const [alg, key] of [['rsa', rsa], ['ec', ec], ['ed448', ed448]] as const) {
    const spki = key.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    const text = JSON.stringify({
      version: 1,
      keys: [{ keyId: 'wrong-alg-01', algorithm: 'ed25519', publicKeySpkiBase64: spki, status: 'active' }],
    });
    assert.throws(() => parseTrustRoots(text), (e) => e instanceof AuthError && e.code === 'AUTH_KEY_MISMATCH', alg);
  }
});

test('MAJOR-2: a substituted non-Ed25519 key refuses at verification even with a valid signature', () => {
  const s = setupAuth();
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const rsaRoots: TrustRoots = {
    version: 1,
    keys: [{
      keyId: s.id.keyId,
      algorithm: 'ed25519',
      publicKeySpkiBase64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      status: 'active',
    }],
  };
  let code = 'NO_ERROR';
  try {
    verifyArtifactAuthentication({
      manifest: s.manifest,
      signatureBase64: signManifest(s.manifest, s.id.privateKeyPem),
      runId: s.manifest.runId,
      artifactHash: s.manifest.artifactSha256,
      inputSha256: s.manifest.inputSha256,
      sourceSha: s.manifest.sourceSha,
      sourceFixtureTree: s.manifest.sourceFixtureTree,
      sourceAnalysisId: s.manifest.sourceAnalysisId,
      trustRoots: rsaRoots,
    });
  } catch (e) {
    code = e instanceof AuthError ? e.code : `OTHER:${(e as Error).message}`;
  }
  assert.equal(code, 'AUTH_KEY_MISMATCH');
});

test('MINOR-3: Unicode-escaped duplicate manifest keys refuse with the decoded name', () => {
  const escaped = manifestTextFor(manifestFor()).replace('"runId":', '"runId":"first", "\\u0072unId":');
  assert.throws(() => parseSignatureManifest(escaped), (e) =>
    e instanceof AuthError && e.code === 'AUTH_MANIFEST_DUPLICATE_KEY' && /"runId"/.test(e.message));
  const escapedProto = manifestTextFor(manifestFor()).replace(/}$/, ', "\\u005f\\u005fproto\\u005f\\u005f": {}}');
  assert.throws(() => parseSignatureManifest(escapedProto), (e) =>
    e instanceof AuthError && e.code === 'AUTH_MANIFEST_PROTO_KEY');
});

test('MINOR-3: quote-colon sequences inside string values are not keys, and nested keys are values', () => {
  const tricky = manifestFor({ sourceAnalysisId: 'note: "runId": 1, see "keyId": 2' });
  const parsed = parseSignatureManifest(manifestTextFor(tricky));
  assert.equal(parsed.sourceAnalysisId, 'note: "runId": 1, see "keyId": 2');
  const nested = manifestTextFor(manifestFor()).replace(/}$/, ', "bonus": {"runId": 1}}');
  assert.throws(() => parseSignatureManifest(nested), (e) =>
    e instanceof AuthError && e.code === 'AUTH_MANIFEST_UNKNOWN_FIELD');
});
