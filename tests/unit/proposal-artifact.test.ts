// C3-B2B P2: the strict artifact loader and exact schema validator, tested through synthetic files only.
// The real stored artifact is never read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ArtifactError, loadAndValidateProposalArtifact, readBoundedBytes } from '../../packages/provenance/src/proposal-artifact.ts';
import { tempDir } from '../helpers.ts';
import { ARTIFACT_RUN_ID, artifactFileFor, linkArtifact, validArtifactDoc, writeArtifact, writeArtifactDoc } from '../support/proposal-artifact-fixture.ts';

const fresh = (runId = ARTIFACT_RUN_ID) => {
  const root = tempDir('pp-artifact-');
  return { root, runId, load: (id = runId) => loadAndValidateProposalArtifact({ repoRoot: root, runId: id }) };
};
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'NO_ERROR';
  } catch (e) {
    return e instanceof ArtifactError ? e.code : `OTHER:${(e as Error).message}`;
  }
};
const mutate = (root: string, runId: string, fn: (d: Record<string, unknown>) => void) => {
  const doc = JSON.parse(readFileSync(artifactFileFor(root, runId), 'utf8'));
  fn(doc);
  writeArtifact(root, runId, JSON.stringify(doc));
};

test('a well-formed synthetic artifact validates: frozen triples, labels, recomputed hash', async () => {
  const { root, runId, load } = fresh();
  writeArtifactDoc(root, runId);
  const v = await load();
  assert.equal(v.runId, runId);
  assert.equal(v.providerId, 'meta');
  assert.deepEqual([...v.adjustments], [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }]);
  assert.equal(v.renderedCss, '.promo-overlay{pointer-events:none}\n');
  assert.equal(v.artifactHash, createHash('sha256').update(readFileSync(artifactFileFor(root, runId))).digest('hex'));
  assert.deepEqual(v.usage, { inputTokens: 670, outputTokens: 630, totalTokens: 1300, reasoningTokens: 601, videoFramesProcessed: null });
  assert.ok(Object.isFrozen(v) && Object.isFrozen(v.adjustments) && Object.isFrozen(v.adjustments[0]) && Object.isFrozen(v.usage));
  // nullable fields may legitimately be null
  const nulls = fresh();
  writeArtifactDoc(nulls.root, nulls.runId, validArtifactDoc(nulls.runId, { outputSha256: null, outputBytes: null, requestId: null }));
  const n = await nulls.load();
  assert.equal(n.outputSha256, null);
  assert.equal(n.requestId, null);
});

test('the loader refuses bad paths, symlinks, non-regular files, loose modes and oversized files', async () => {
  assert.equal(await codeOf(fresh().load('../x')), 'ARTIFACT_RUN_ID_INVALID');
  assert.equal(await codeOf(fresh().load('c2b-live-smoke-404')), 'ARTIFACT_NOT_FOUND');
  const s = fresh();
  const target = writeArtifact(s.root, 'c3-test-target-001', JSON.stringify(validArtifactDoc('c3-test-target-001')));
  linkArtifact(s.root, s.runId, target);
  assert.equal(await codeOf(s.load()), 'ARTIFACT_SYMLINK');
  const d = fresh();
  mkdirSync(artifactFileFor(d.root, d.runId), { recursive: true });
  assert.equal(await codeOf(d.load()), 'ARTIFACT_NOT_REGULAR');
  const loose = fresh();
  writeArtifactDoc(loose.root, loose.runId);
  chmodSync(artifactFileFor(loose.root, loose.runId), 0o644);
  assert.equal(await codeOf(loose.load()), 'ARTIFACT_PERMISSIONS');
  const big = fresh();
  writeArtifact(big.root, big.runId, 'x'.repeat(8 * 1024 + 1));
  assert.equal(await codeOf(big.load()), 'ARTIFACT_TOO_LARGE');
});

test('a symlink in any intermediate directory is refused before the file is read', async () => {
  const parts = ['.proofpilot', 'evidence', 'proposals', ARTIFACT_RUN_ID];
  for (let depth = 0; depth < parts.length; depth++) {
    const f = fresh();
    writeArtifactDoc(f.root, f.runId);
    const link = path.join(f.root, ...parts.slice(0, depth + 1));
    const stash = `${link}.real`;
    renameSync(link, stash);
    try {
      symlinkSync(stash, link);
      assert.equal(await codeOf(f.load()), 'ARTIFACT_SYMLINK', `symlink at ${parts[depth]}`);
    } finally {
      rmSync(link);
      renameSync(stash, link);
    }
  }
});

test('a FIFO at the artifact path is refused without blocking on open', async () => {
  const f = fresh();
  mkdirSync(path.dirname(artifactFileFor(f.root, f.runId)), { recursive: true });
  execFileSync('mkfifo', [artifactFileFor(f.root, f.runId)]);
  chmodSync(artifactFileFor(f.root, f.runId), 0o600);
  assert.equal(await codeOf(f.load()), 'ARTIFACT_NOT_REGULAR');
});

test('a swapped ancestor tree serving outside bytes is refused even when the bytes validate', async () => {
  // The auditor's repro as a static case: an alternate tree holds a schema-valid artifact for the same run.
  const f = fresh();
  writeArtifactDoc(f.root, f.runId);
  const outside = tempDir('pp-outside-');
  writeArtifactDoc(outside, f.runId, validArtifactDoc(f.runId, { inputSha256: 'd'.repeat(64) }));
  const link = path.join(f.root, '.proofpilot');
  renameSync(link, `${link}.real`);
  try {
    symlinkSync(path.join(outside, '.proofpilot'), link);
    assert.equal(await codeOf(f.load()), 'ARTIFACT_SYMLINK');
  } finally {
    rmSync(link);
    renameSync(`${link}.real`, link);
  }
});

test('descriptor reads are bounded: a larger file yields at most 8193 bytes, never the whole file', async () => {
  const dir = tempDir('pp-bounded-');
  const file = path.join(dir, 'big.bin');
  writeFileSync(file, 'y'.repeat(9000));
  const handle = await open(file, 'r');
  try {
    const bytes = await readBoundedBytes(handle, 8192);
    assert.equal(bytes.length, 8193);
  } finally {
    await handle.close();
  }
  const small = path.join(dir, 'small.bin');
  writeFileSync(small, 'z'.repeat(100));
  const h2 = await open(small, 'r');
  try {
    assert.equal((await readBoundedBytes(h2, 8192)).length, 100);
  } finally {
    await h2.close();
  }
});

test('timestamps must be real UTC instants; the millisecond form may be omitted', async () => {
  const f = fresh();
  writeArtifactDoc(f.root, f.runId, validArtifactDoc(f.runId, { createdAt: '2026-02-30T00:00:00.000Z' }));
  assert.equal(await codeOf(f.load()), 'ARTIFACT_BAD_VALUE');
  const g = fresh();
  writeArtifactDoc(g.root, g.runId, validArtifactDoc(g.runId, { createdAt: '2026-10-30T00:00:00Z' }));
  assert.equal((await g.load()).createdAt, '2026-10-30T00:00:00Z');
});

test('malformed text, trailing garbage, duplicates, pollution keys and deep nesting are refused', async () => {
  const cases: Array<[string, string, string]> = [
    ['truncated', '{"schemaVersion":1,', 'ARTIFACT_MALFORMED'],
    ['empty', '', 'ARTIFACT_MALFORMED'],
    ['trailing garbage', `${JSON.stringify(validArtifactDoc(ARTIFACT_RUN_ID))} x`, 'ARTIFACT_MALFORMED'],
    ['duplicate top key', '{"schemaVersion":1,"schemaVersion":1}', 'ARTIFACT_DUPLICATE_KEY'],
    ['duplicate nested key', '{"a":{"b":1,"b":2}}', 'ARTIFACT_DUPLICATE_KEY'],
    ['proto top key', '{"__proto__":{"x":1}}', 'ARTIFACT_PROTO_KEY'],
    ['nested constructor key', '{"a":{"constructor":1}}', 'ARTIFACT_PROTO_KEY'],
    ['escaped proto key', '{"\\u005f\\u005fproto\\u005f\\u005f":{}}', 'ARTIFACT_PROTO_KEY'],
    ['depth four', '{"a":{"b":{"c":{"d":1}}}}', 'ARTIFACT_MAX_DEPTH'],
    ['depth four in array', '{"a":[[[1]]]}', 'ARTIFACT_MAX_DEPTH'],
    ['bad escape', '{"a":"\\q"}', 'ARTIFACT_MALFORMED'],
    ['lone surrogate', '{"a":"\\ud800"}', 'ARTIFACT_MALFORMED'],
  ];
  for (const [name, raw, code] of cases) {
    const f = fresh();
    writeArtifact(f.root, f.runId, raw);
    assert.equal(await codeOf(f.load()), code, name);
  }
  // depth three with the real shape passes the pre-scan (schema verdicts apply, not depth)
  const ok = fresh();
  writeArtifactDoc(ok.root, ok.runId);
  assert.equal((await ok.load()).adjustments.length, 1);
});

test('unknown or missing fields at every level are refused', async () => {
  const cases: Array<[string, (d: Record<string, unknown>) => void, string]> = [
    ['unknown top key', (d) => { d.extra = 1; }, 'ARTIFACT_UNKNOWN_FIELD'],
    ['unknown usage key', (d) => { (d.usage as Record<string, unknown>).frames = 1; }, 'ARTIFACT_UNKNOWN_FIELD'],
    ['unknown lifecycle key', (d) => { (d.lifecycle as Record<string, unknown>).why = 1; }, 'ARTIFACT_UNKNOWN_FIELD'],
    ['unknown limits key', (d) => { (d.limits as Record<string, unknown>).other = 1; }, 'ARTIFACT_UNKNOWN_FIELD'],
    ['missing top key', (d) => { delete d.slot; }, 'ARTIFACT_MISSING_FIELD'],
    ['missing usage key', (d) => { delete (d.usage as Record<string, unknown>).totalTokens; }, 'ARTIFACT_MISSING_FIELD'],
    ['missing lifecycle key', (d) => { delete (d.lifecycle as Record<string, unknown>).completed; }, 'ARTIFACT_MISSING_FIELD'],
  ];
  for (const [name, fn, code] of cases) {
    const f = fresh();
    writeArtifactDoc(f.root, f.runId);
    mutate(f.root, f.runId, fn);
    assert.equal(await codeOf(f.load()), code, name);
  }
});

test('wrong types, out-of-range values, provenance, model, lifecycle and limits are refused', async () => {
  const cases: Array<[string, (d: Record<string, unknown>) => void, string]> = [
    ['top array', () => {}, 'ARTIFACT_BAD_TYPE'],
    ['slot string', (d) => { d.slot = '1'; }, 'ARTIFACT_BAD_VALUE'],
    ['slot zero', (d) => { d.slot = 0; }, 'ARTIFACT_BAD_VALUE'],
    ['schema float', (d) => { d.schemaVersion = 1.5; }, 'ARTIFACT_BAD_VALUE'],
    ['bad label', (d) => { d.label = 'TRUSTED'; }, 'ARTIFACT_BAD_VALUE'],
    ['bad provenance', (d) => { d.provenance = 'oracle'; }, 'ARTIFACT_BAD_VALUE'],
    ['other provider', (d) => { d.providerId = 'baseten'; }, 'ARTIFACT_BAD_VALUE'],
    ['other model', (d) => { d.requestedModel = 'other-1.0'; }, 'ARTIFACT_BAD_VALUE'],
    ['null responded model', (d) => { d.respondedModel = null; }, 'ARTIFACT_BAD_VALUE'],
    ['rejected status', (d) => { d.status = 'PROPOSAL_REJECTED'; }, 'ARTIFACT_BAD_VALUE'],
    ['reason set', (d) => { d.reason = 'EMPTY_OUTPUT'; }, 'ARTIFACT_BAD_VALUE'],
    ['forbidden set', (d) => { d.forbiddenClass = 'HTML'; }, 'ARTIFACT_BAD_VALUE'],
    ['bad input hash', (d) => { d.inputSha256 = 'zzz'; }, 'ARTIFACT_BAD_VALUE'],
    ['numeric output hash', (d) => { d.outputSha256 = 42; }, 'ARTIFACT_BAD_VALUE'],
    ['output bytes over bound', (d) => { d.outputBytes = 2049; }, 'ARTIFACT_BAD_VALUE'],
    ['infinite usage', (d) => {}, 'ARTIFACT_BAD_VALUE'],
    ['negative usage', (d) => { (d.usage as Record<string, unknown>).inputTokens = -1; }, 'ARTIFACT_BAD_VALUE'],
    ['huge usage', (d) => { (d.usage as Record<string, unknown>).inputTokens = 1_000_000_001; }, 'ARTIFACT_BAD_VALUE'],
    ['float usage', (d) => { (d.usage as Record<string, unknown>).inputTokens = 1.5; }, 'ARTIFACT_BAD_VALUE'],
    ['failed lifecycle', (d) => { (d.lifecycle as Record<string, unknown>).status = 'failed'; }, 'ARTIFACT_BAD_VALUE'],
    ['refusal true', (d) => { (d.lifecycle as Record<string, unknown>).refusal = true; }, 'ARTIFACT_BAD_VALUE'],
    ['completed false', (d) => { (d.lifecycle as Record<string, unknown>).completed = false; }, 'ARTIFACT_BAD_VALUE'],
    ['error code set', (d) => { (d.lifecycle as Record<string, unknown>).errorCode = 'E'; }, 'ARTIFACT_BAD_VALUE'],
    ['wrong limits', (d) => { (d.limits as Record<string, unknown>).maxOutputTokens = 3073; }, 'ARTIFACT_BAD_VALUE'],
    ['bad timestamp', (d) => { d.createdAt = 'not-a-date'; }, 'ARTIFACT_BAD_VALUE'],
    ['non-UTC timestamp', (d) => { d.createdAt = '2026-10-30 00:00:00'; }, 'ARTIFACT_BAD_VALUE'],
    ['long request id', (d) => { d.requestId = 'x'.repeat(101); }, 'ARTIFACT_BAD_VALUE'],
    ['run id mismatch', (d) => { d.runId = 'c3-test-other-002'; }, 'ARTIFACT_RUN_ID_MISMATCH'],
  ];
  for (const [name, fn, code] of cases) {
    const f = fresh();
    if (name === 'top array') {
      writeArtifact(f.root, f.runId, '[]');
    } else if (name === 'infinite usage') {
      const raw = JSON.stringify(validArtifactDoc(f.runId)).replace('"inputTokens":670', '"inputTokens":1e999');
      writeArtifact(f.root, f.runId, raw);
    } else {
      writeArtifactDoc(f.root, f.runId);
      mutate(f.root, f.runId, fn);
    }
    assert.equal(await codeOf(f.load()), code, name);
  }
});

test('adjustment triples are exact, bounded and grammatical; rendered CSS must match byte for byte', async () => {
  const triple = (fn: (t: Record<string, unknown>) => void, n = 0) => (d: Record<string, unknown>) => {
    fn((d.adjustments as Array<Record<string, unknown>>)[n]!);
  };
  const cases: Array<[string, (d: Record<string, unknown>) => void, string]> = [
    ['empty adjustments', (d) => { d.adjustments = []; }, 'ARTIFACT_BAD_VALUE'],
    ['five adjustments', (d) => { d.adjustments = Array.from({ length: 5 }, () => ({ selector: '.promo-overlay', property: 'pointer-events', value: 'none' })); }, 'ARTIFACT_BAD_VALUE'],
    ['adjustments object', (d) => { d.adjustments = {}; }, 'ARTIFACT_BAD_VALUE'],
    ['extra triple key', triple((t) => { t.unit = 'px'; }), 'ARTIFACT_UNKNOWN_FIELD'],
    ['missing triple key', triple((t) => { delete t.value; }), 'ARTIFACT_MISSING_FIELD'],
    ['numeric selector', triple((t) => { t.selector = 42; }), 'ARTIFACT_BAD_TYPE'],
    ['long value', triple((t) => { t.value = 'x'.repeat(201); }), 'ARTIFACT_BAD_VALUE'],
    ['unknown selector', triple((t) => { t.selector = '.evil'; }), 'ARTIFACT_GRAMMAR'],
    ['unknown property', triple((t) => { t.property = 'color'; }), 'ARTIFACT_GRAMMAR'],
    ['disallowed value', triple((t) => { t.value = 'maybe'; }), 'ARTIFACT_GRAMMAR'],
    ['z-index out of range', triple((t) => { t.property = 'z-index'; t.value = '999'; }), 'ARTIFACT_GRAMMAR'],
  ];
  for (const [name, fn, code] of cases) {
    const f = fresh();
    writeArtifactDoc(f.root, f.runId);
    mutate(f.root, f.runId, fn);
    assert.equal(await codeOf(f.load()), code, name);
  }
  // grammatical but not what the host renders from these triples
  const tampered = fresh();
  writeArtifactDoc(tampered.root, tampered.runId, validArtifactDoc(tampered.runId, { renderedCss: '.promo-overlay{pointer-events:auto}' }));
  assert.equal(await codeOf(tampered.load()), 'ARTIFACT_RENDER_MISMATCH');
  const garbage = fresh();
  writeArtifactDoc(garbage.root, garbage.runId, validArtifactDoc(garbage.runId, { renderedCss: 'not css at all' }));
  assert.equal(await codeOf(garbage.load()), 'ARTIFACT_RENDER_MISMATCH');
});
