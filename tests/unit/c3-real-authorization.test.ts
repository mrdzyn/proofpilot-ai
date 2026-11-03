// C3 real-run authorization gate: parent-binding record, diff allow-list, single run id.
//
// Synthetic only: test keys are generated in memory per run; the real stored proposal, real
// keys, credentials and providers are never touched. The mint module under test has no
// filesystem access, so every git observation below is injected (or read from a disposable
// synthetic git repo by the test itself) — no production checkout state is trusted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AUTHORIZATION_DIFF_ALLOWLIST,
  isRealRunAuthorized,
  mintSingleUseRealAuthorization,
  ModelAuthorizationError,
  REAL_ARTIFACT_RUN_ID,
} from '../../packages/core/src/model-real-authorization.ts';
import { registerModelProposal, renderCssAdjustments, type CssAdjustment } from '../../packages/core/src/index.ts';
import {
  manifestTextFor,
  TEST_ANALYSIS_ID,
  TEST_FIXTURE_TREE,
  TEST_SOURCE_SHA,
} from '../support/artifact-auth-fixture.ts';

const V = '3'.repeat(40);
const SRC = '4'.repeat(40);
const HEAD = '5'.repeat(40);
const ART = 'a'.repeat(64);
const INP = 'b'.repeat(64);
const PC1: CssAdjustment[] = [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }];
const CSS = renderCssAdjustments(PC1);
const sha256Hex = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');

const codeOf = async (p: Promise<unknown> | unknown): Promise<string> => {
  try {
    await p;
    return 'NO_ERROR';
  } catch (e) {
    if (e instanceof ModelAuthorizationError) return e.code;
    return `OTHER:${(e as Error).message}`;
  }
};

/** Fully consistent synthetic gate inputs: test key, signed manifest, matching record. */
const validSetup = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeySpkiBase64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const keyId = 'c3-real-auth-test-01';
  const trustRootsText = JSON.stringify({
    version: 1,
    keys: [{ keyId, algorithm: 'ed25519', publicKeySpkiBase64, status: 'active' }],
  });
  const manifest = {
    authVersion: 1 as const,
    keyId,
    runId: REAL_ARTIFACT_RUN_ID,
    artifactSha256: ART,
    inputSha256: INP,
    sourceSha: SRC,
    sourceFixtureTree: TEST_FIXTURE_TREE,
    sourceAnalysisId: TEST_ANALYSIS_ID,
  };
  const manifestText = manifestTextFor(manifest);
  const canonical: Record<string, unknown> = {};
  for (const k of Object.keys(manifest).sort()) canonical[k] = manifest[k as keyof typeof manifest];
  const signatureText = sign(null, Buffer.from(`PP-ARTIFACT-AUTH-v1\n${JSON.stringify(canonical)}`, 'utf8'), privateKey).toString('base64');
  const record = {
    runId: REAL_ARTIFACT_RUN_ID,
    artifactSha256: ART,
    verificationParentSha: V,
    trustRootsSha256: sha256Hex(trustRootsText),
    sourceSha: SRC,
    sourceFixtureTree: TEST_FIXTURE_TREE,
    sourceAnalysisId: TEST_ANALYSIS_ID,
    keyId,
    approvalId: 'D-R1-synthetic-001',
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
    args: {
      proposal,
      manifestText,
      signatureText,
      trustRootsText,
      recordText: JSON.stringify(record),
      cliValues: {
        runId: REAL_ARTIFACT_RUN_ID,
        sourceSha: SRC,
        sourceFixtureTree: TEST_FIXTURE_TREE,
        sourceAnalysisId: TEST_ANALYSIS_ID,
        verificationSha: V,
      },
      observed: {
        head: HEAD,
        parent: V,
        parentCount: 1,
        clean: true,
        diffNames: [...AUTHORIZATION_DIFF_ALLOWLIST].reverse(),
      },
    },
    record,
    manifest,
  };
};

const mintCodeOf = async (mut: (s: ReturnType<typeof validSetup>) => void): Promise<string> => {
  const s = validSetup();
  mut(s);
  const code = await codeOf((async () => mintSingleUseRealAuthorization(s.args))());
  assert.equal(isRealRunAuthorized(s.args.proposal), false, 'a refused mint leaves no membership behind');
  return code;
};

test('authorization gate passes only for the clean single-record child of the named parent', async () => {
  const s = validSetup();
  mintSingleUseRealAuthorization(s.args);
  assert.equal(isRealRunAuthorized(s.args.proposal), true, 'the mint succeeds on fully consistent inputs');
  assert.equal(isRealRunAuthorized(s.args.proposal), false, 'membership is single-use');
});

test('authorization gate refuses before any signature work: absent/malformed/foreign records', async () => {
  const s = validSetup();
  assert.equal(await codeOf((async () => mintSingleUseRealAuthorization({ ...s.args, recordText: '' }))()), 'BAD_RECORD');
  assert.equal(await codeOf((async () => mintSingleUseRealAuthorization({ ...s.args, recordText: '{nope' }))()), 'BAD_RECORD');
  assert.equal(await codeOf((async () => mintSingleUseRealAuthorization({ ...s.args, recordText: '[1,2]' }))()), 'BAD_RECORD');
  const extra = { ...JSON.parse(s.args.recordText as string), verificationSha: V };
  assert.equal(
    await codeOf((async () => mintSingleUseRealAuthorization({ ...s.args, recordText: JSON.stringify(extra) }))()),
    'BAD_RECORD',
    'the record schema is closed: no V-named smuggling',
  );
  const dup = (s.args.recordText as string).replace('"runId"', '"runId","runId":"x"');
  assert.equal(
    await codeOf((async () => mintSingleUseRealAuthorization({ ...s.args, recordText: dup }))()),
    'BAD_RECORD',
    'duplicate record keys refuse',
  );
  const synthetic = { ...JSON.parse(s.args.recordText as string), runId: 'c3-test-source-001' };
  assert.equal(
    await codeOf((async () => mintSingleUseRealAuthorization({ ...s.args, recordText: JSON.stringify(synthetic) }))()),
    'REAL_ID_REQUIRED',
    'a synthetic run id can never mint',
  );
});

test('authorization gate refuses record/CLI disagreement on every bound value', async () => {
  for (
    const [name, cliKey, bad] of [
      ['run id', 'runId', 'c3-live-meta-001-x'],
      ['source revision', 'sourceSha', SRC.slice(0, 39) + '0'],
      ['fixture tree', 'sourceFixtureTree', TEST_SOURCE_SHA],
      ['analysis id', 'sourceAnalysisId', 'something-else'],
      ['verification revision', 'verificationSha', HEAD],
    ] as const
  ) {
    const code = await mintCodeOf((s) => {
      s.args.cliValues = { ...s.args.cliValues, [cliKey]: bad };
    });
    assert.equal(code, 'RECORD_MISMATCH', `${name}: ${code}`);
  }
});

test('authorization gate refuses non-parent V, own-head records, dirty trees and merge commits', async () => {
  assert.equal(await mintCodeOf((s) => { s.args.observed = { ...s.args.observed, parent: HEAD }; }), 'NOT_PARENT_CHILD');
  assert.equal(
    await mintCodeOf((s) => {
      const rec = { ...JSON.parse(s.args.recordText as string), verificationParentSha: HEAD };
      s.args.recordText = JSON.stringify(rec);
      s.args.observed = { ...s.args.observed, parent: HEAD };
      s.args.cliValues = { ...s.args.cliValues, verificationSha: HEAD };
    }),
    'RECORD_MISMATCH',
    'a record naming its own head cannot match the registration binding',
  );
  assert.equal(await mintCodeOf((s) => { s.args.observed = { ...s.args.observed, clean: false }; }), 'DIRTY_TREE');
  assert.equal(await mintCodeOf((s) => { s.args.observed = { ...s.args.observed, parentCount: 2 }; }), 'NOT_SINGLE_PARENT');
  assert.equal(await mintCodeOf((s) => { s.args.observed = { ...s.args.observed, parentCount: 0 }; }), 'NOT_SINGLE_PARENT');
});

test('authorization gate refuses any V..HEAD diff outside the allow-list', async () => {
  assert.equal(
    await mintCodeOf((s) => {
      s.args.observed = { ...s.args.observed, diffNames: [...AUTHORIZATION_DIFF_ALLOWLIST, 'packages/core/src/x.ts'] };
    }),
    'DIFF_NOT_ALLOWLISTED',
  );
  assert.equal(
    await mintCodeOf((s) => { s.args.observed = { ...s.args.observed, diffNames: [AUTHORIZATION_DIFF_ALLOWLIST[0]!] }; }),
    'DIFF_NOT_ALLOWLISTED',
    'a truncated diff (missing enrollment) refuses',
  );
  assert.equal(await mintCodeOf((s) => { s.args.observed = { ...s.args.observed, diffNames: [] }; }), 'DIFF_NOT_ALLOWLISTED');
});

test('authorization gate refuses substituted trust roots by hash before parsing them', async () => {
  const code = await mintCodeOf((s) => {
    const { publicKey } = generateKeyPairSync('ed25519');
    s.args.trustRootsText = JSON.stringify({
      version: 1,
      keys: [{ keyId: 'attacker-key', algorithm: 'ed25519', publicKeySpkiBase64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'), status: 'active' }],
    });
  });
  assert.equal(code, 'ROOTS_HASH_MISMATCH');
});

test('synthetic commit/V dry-run: real git parent-binding semantics through the gate', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pp-c3-gate-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  writeFileSync(path.join(dir, 'code.ts'), 'v\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'V'], { cwd: dir });
  const v = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
  const s = validSetup();
  const rec = { ...JSON.parse(s.args.recordText as string), verificationParentSha: v };
  const recordText = JSON.stringify(rec);
  mkdirSync(path.join(dir, 'config'));
  writeFileSync(path.join(dir, 'config', 'c3-real-run-authorization.json'), recordText);
  writeFileSync(path.join(dir, 'config', 'artifact-trust-roots.json'), s.args.trustRootsText as string);
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-qm', 'W'], { cwd: dir });
  const w = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
  const parents = execFileSync('git', ['rev-list', '--parents', '-n', '1', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim().split(/\s+/);
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).trim();
  const diff = execFileSync('git', ['diff', '--name-only', `${v}..HEAD`], { cwd: dir, encoding: 'utf8' });
  const names = diff.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  assert.deepEqual(parents, [w, v], 'W is the direct child of V');
  assert.equal(status, '', 'the synthetic checkout is clean');
  assert.deepEqual(names, ['config/artifact-trust-roots.json', 'config/c3-real-run-authorization.json'], 'W carries only the record and the enrollment');
  // The gate passes on genuinely observed values for a clean single-record child.
  const passing = validSetup();
  const passingRecord = { ...JSON.parse(passing.args.recordText as string), verificationParentSha: v };
  const boundProposal = registerModelProposal({
    triples: PC1.map((a) => ({ ...a })),
    renderedCss: CSS,
    runId: REAL_ARTIFACT_RUN_ID,
    approvedSha: v,
    sourceSha: SRC,
    inputSha256: INP,
    artifactSha256: ART,
  });
  mintSingleUseRealAuthorization({
    ...passing.args,
    proposal: boundProposal,
    recordText: JSON.stringify(passingRecord),
    cliValues: { ...passing.args.cliValues, verificationSha: v },
    observed: { head: w, parent: v, parentCount: 1, clean: true, diffNames: names },
  });
  assert.equal(isRealRunAuthorized(boundProposal), true, 'genuinely observed clean child mints');
  // The same observations with a tampered parent refuse before any membership exists.
  const other = '0'.repeat(40);
  const boundProposal2 = registerModelProposal({
    triples: PC1.map((a) => ({ ...a })),
    renderedCss: CSS,
    runId: REAL_ARTIFACT_RUN_ID,
    approvedSha: v,
    sourceSha: SRC,
    inputSha256: INP,
    artifactSha256: ART,
  });
  assert.equal(
    await codeOf((async () =>
      mintSingleUseRealAuthorization({
        ...passing.args,
        proposal: boundProposal2,
        recordText: JSON.stringify(passingRecord),
        cliValues: { ...passing.args.cliValues, verificationSha: v },
        observed: { head: w, parent: other, parentCount: 1, clean: true, diffNames: names },
      }))()),
    'NOT_PARENT_CHILD',
  );
  assert.equal(isRealRunAuthorized(boundProposal2), false, 'the tampered-parent refusal mints nothing');
});
