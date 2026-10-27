import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runAnalyzeCommand, type AnalyzeCommandDeps } from '../../packages/inference/src/index.ts';
import { deleteOk, fakeDeps, fakeMp4Bytes, liveEnv, mockFetch, responsesOk, SENTINEL_KEY, tempDir, uploadOk, validSymptom } from '../helpers.ts';

function setup(env: Record<string, string | undefined> = { MODEL_API_KEY: SENTINEL_KEY }, queue: Parameters<typeof mockFetch>[0] = []) {
  const root = tempDir('pp-cli-');
  const file = path.join(root, 'clip.mp4');
  writeFileSync(file, fakeMp4Bytes());
  const m = mockFetch(queue);
  const lines: string[] = [];
  const deps: AnalyzeCommandDeps = {
    env,
    allowedRoot: root,
    outRoot: path.join(root, 'analysis'),
    transport: 'mock',
    fetch: m.fetch,
    mediaDeps: fakeDeps(),
    log: (l) => lines.push(l),
    clock: (() => { let t = 0; return () => (t += 5); })(),
  };
  return { root, file, calls: m.calls, lines, deps, out: () => lines.join('\n') };
}

test('dry run (the default) validates, prints the plan, and makes ZERO network calls', async () => {
  const s = setup(liveEnv(), [uploadOk()]);
  const code = await runAnalyzeCommand(['--video', s.file, '--run-id', 'r1'], s.deps);
  assert.equal(code, 0);
  assert.equal(s.calls.length, 0);
  assert.match(s.out(), /DRY RUN\. NETWORK CALLS MADE: 0/);
  assert.match(s.out(), /consent:\s+NOT GIVEN/);
  assert.match(s.out(), /POST https:\/\/api\.meta\.ai\/v1\/files .* DELETE https:\/\/api\.meta\.ai\/v1\/files\/<id>/);
  assert.match(s.out(), /sha256:\s+[0-9a-f]{64}/);
  assert.ok(!s.out().includes(SENTINEL_KEY), 'the key is never printed');
  assert.ok(!existsSync(path.join(s.root, 'analysis')), 'nothing is written in a dry run');
});

test('dry run reports opt-in state without leaking the key', async () => {
  const s = setup({ MODEL_API_KEY: SENTINEL_KEY });
  await runAnalyzeCommand(['--video', s.file, '--run-id', 'r1', '--consent-meta-video-analysis'], s.deps);
  assert.match(s.out(), /billable=off, video upload=off, API key=present/);
  assert.match(s.out(), /consent:\s+GIVEN/);
  assert.ok(!s.out().includes(SENTINEL_KEY));
});

test('--live without consent is refused before any call', async () => {
  const s = setup(liveEnv(), [uploadOk()]);
  assert.equal(await runAnalyzeCommand(['--video', s.file, '--run-id', 'r1', '--live'], s.deps), 2);
  assert.match(s.out(), /refused:\s+CONSENT_MISSING/);
  assert.equal(s.calls.length, 0);
});

test('--live with consent but the opt-ins off is refused before any call', async () => {
  for (const env of [{ MODEL_API_KEY: SENTINEL_KEY }, { MODEL_API_KEY: SENTINEL_KEY, PROOFPILOT_ALLOW_BILLABLE_CALLS: '1' }]) {
    const s = setup(env, [uploadOk()]);
    assert.equal(await runAnalyzeCommand(['--video', s.file, '--run-id', 'r1', '--live', '--consent-meta-video-analysis'], s.deps), 2);
    assert.match(s.out(), /refused:\s+BILLABLE_NOT_AUTHORIZED/);
    assert.equal(s.calls.length, 0);
  }
});

test('usage errors and unsafe inputs are refused (exit 2) before any call', async () => {
  const s = setup(liveEnv(), [uploadOk()]);
  const outside = path.join(tempDir(), 'x.mp4');
  writeFileSync(outside, fakeMp4Bytes());
  const link = path.join(s.root, 'link.mp4');
  symlinkSync(s.file, link);
  const cases: string[][] = [
    [],
    ['--video', s.file],
    ['--run-id', 'r1'],
    ['--video', s.file, '--run-id', 'r1', '--unknown'],
    ['--video', s.file, '--run-id', 'r1', 'extra'],
    ['--video', outside, '--run-id', 'r1'],
    ['--video', `${s.root}/../clip.mp4`, '--run-id', 'r1'],
    ['--video', link, '--run-id', 'r1'],
    ['--video', path.join(s.root, 'missing.mp4'), '--run-id', 'r1'],
  ];
  for (const argv of cases) assert.equal(await runAnalyzeCommand(argv, s.deps), 2, argv.join(' '));
  assert.equal(s.calls.length, 0);
  assert.equal(await runAnalyzeCommand(['--help'], s.deps), 0);
});

test('invalid run id in a live run is refused', async () => {
  const s = setup(liveEnv(), [uploadOk()]);
  assert.equal(await runAnalyzeCommand(['--video', s.file, '--run-id', '../evil', '--live', '--consent-meta-video-analysis'], s.deps), 2);
  assert.equal(s.calls.length, 0);
});

test('mocked live run: writes a result labelled with its transport, deletes the remote file, exit 0', async () => {
  const s = setup(liveEnv(), [uploadOk(), responsesOk(JSON.stringify(validSymptom())), deleteOk()]);
  const code = await runAnalyzeCommand(['--video', s.file, '--run-id', 'r1', '--live', '--consent-meta-video-analysis', '--description', 'cart stays empty'], s.deps);
  assert.equal(code, 0, s.out());
  assert.equal(s.calls.length, 3);
  const file = path.join(s.root, 'analysis', 'r1', 'analysis.json');
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(saved.evidenceKind, 'mock');
  assert.equal(saved.result.status, 'VIDEO_ANALYZED');
  assert.equal(saved.result.symptom.provenance, 'model-hypothesis');
  assert.equal(saved.result.provenance.cleanup.deleted, true);
  assert.ok(!JSON.stringify(saved).includes(SENTINEL_KEY));
  assert.match(s.out(), /result:\s+VIDEO_ANALYZED\s+\(evidence kind: mock\)/);
  // A second run with the same id must not overwrite the first result.
  const again = setup(liveEnv(), [uploadOk(), responsesOk(JSON.stringify(validSymptom())), deleteOk()]);
  again.deps.outRoot = s.deps.outRoot;
  again.deps.allowedRoot = s.root;
  assert.equal(await runAnalyzeCommand(['--video', s.file, '--run-id', 'r1', '--live', '--consent-meta-video-analysis'], again.deps), 2);
  assert.match(again.out(), /already exists/);
});

test('mocked live run with a bad model answer exits 1 and still records the failure', async () => {
  const s = setup(liveEnv(), [uploadOk(), responsesOk('not json'), deleteOk()]);
  assert.equal(await runAnalyzeCommand(['--video', s.file, '--run-id', 'r2', '--live', '--consent-meta-video-analysis'], s.deps), 1);
  assert.match(s.out(), /ANALYSIS_FAILED/);
  assert.match(s.out(), /MODEL_OUTPUT_NOT_JSON/);
  const saved = JSON.parse(readFileSync(path.join(s.root, 'analysis', 'r2', 'analysis.json'), 'utf8'));
  assert.equal(saved.result.status, 'ANALYSIS_FAILED');
});
