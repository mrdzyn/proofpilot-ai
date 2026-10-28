// C3-A boundary: nothing in the proposal pipeline can reach the real network, execute a proposal or
// produce VERIFIED. Source-level and behavioural checks; no provider is contacted.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseSymptom, type F01Observation } from '../../packages/core/src/index.ts';
import {
  APPROVED_LIVE_QUOTA,
  buildProposalRequest,
  createProposalConsent,
  createProvider,
  createReservationStore,
  loadProviderConfig,
  proposeCandidate,
  ProposalError,
  trustedFactsFromBaseline,
} from '../../packages/inference/src/index.ts';
import { liveEnv, SENTINEL_KEY, tempDir, validSymptom } from '../helpers.ts';

const root = path.resolve(import.meta.dirname, '../..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const PROPOSAL_FILES = ['packages/core/src/patch-proposal.ts', 'packages/inference/src/patch-proposal.ts', 'packages/inference/src/reservations.ts'];

const realFetch = globalThis.fetch;
let fetchCalls = 0;
before(() => {
  globalThis.fetch = (() => {
    fetchCalls++;
    throw new Error('the real network must not be used');
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  assert.equal(fetchCalls, 0);
});

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git' || e === '.proofpilot') continue;
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|mjs|js)$/.test(e)) out.push(full);
  }
  return out;
}

test('the proposal pipeline cannot execute anything: no staging runner, process spawning, filesystem execution or eval', () => {
  for (const f of PROPOSAL_FILES) {
    const text = src(f);
    assert.doesNotMatch(text, /candidate-stage|runCandidate|child_process|\bspawn\b|execFile|\beval\(|new Function|playwright/i, f);
    assert.doesNotMatch(text, /generateText/, `${f} must not use the retrying, lifecycle-blind generateText`);
  }
  // the pure parser touches neither the filesystem nor the network
  assert.doesNotMatch(src('packages/core/src/patch-proposal.ts'), /node:fs|node:net|node:http|fetch\(/);
});

test('no model-verdict path: VERIFIED is never a value the proposal modules can produce', () => {
  for (const f of PROPOSAL_FILES) {
    const code = src(f).split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n');
    assert.doesNotMatch(code, /['"`]VERIFIED['"`]/, f);
  }
});

test('nothing outside tests calls the proposal adapter: there is no CLI, script or runner path to it in C3-A', () => {
  const callers = walk(path.join(root, 'packages')).concat(walk(path.join(root, 'scripts'))).filter((f) => {
    const text = readFileSync(f, 'utf8');
    return /\bproposeCandidate\b/.test(text) && !PROPOSAL_FILES.some((p) => f.endsWith(p)) && !f.endsWith('/index.ts');
  });
  assert.deepEqual(callers, []);
  // and no package script, workflow or script imports it
  assert.doesNotMatch(src('package.json'), /patch-proposal|proposeCandidate/);
  for (const f of walk(path.join(root, 'scripts'))) assert.doesNotMatch(readFileSync(f, 'utf8'), /patch-proposal|proposeCandidate/, f);
});

test('the staging runner and the verifier never import the proposal pipeline (proposals cannot reach them)', () => {
  assert.doesNotMatch(src('packages/core/src/candidate-stage.ts'), /patch-proposal|inference/);
  for (const f of walk(path.join(root, 'verifier'))) assert.doesNotMatch(readFileSync(f, 'utf8'), /patch-proposal|inference/, f);
});

test('LIVE-C3-01 is not approved: the live quota is a frozen code constant of zero that no environment variable can raise', () => {
  assert.deepEqual({ ...APPROVED_LIVE_QUOTA }, { meta: 0, baseten: 0 });
  assert.equal(Object.isFrozen(APPROVED_LIVE_QUOTA), true);
  assert.doesNotMatch(src('packages/inference/src/reservations.ts'), /process\.env/);
  assert.doesNotMatch(src('packages/inference/src/patch-proposal.ts'), /process\.env/);
  assert.doesNotMatch(src('packages/inference/src/config.ts'), /QUOTA/i);
});

test('with credentials, consent and every billable flag, a REAL-transport provider still cannot make a call (quota 0), and nothing is reserved', async () => {
  const request = buildProposalRequest({
    symptom: parseSymptom(validSymptom(), { videoDurationSec: 10 }),
    facts: trustedFactsFromBaseline({ viewport: { width: 390, height: 844 }, tapPoint: { x: 1, y: 1 }, hitTestTarget: 'promo-overlay', cartCountBefore: '0', cartCountAfter: '0' } satisfies F01Observation, true),
  });
  const evidence = tempDir('pp-sec-');
  for (const id of ['meta', 'baseten'] as const) {
    const env = { ...liveEnv(), MODEL_API_KEY: SENTINEL_KEY, BASETEN_API_KEY: SENTINEL_KEY };
    const provider = createProvider(loadProviderConfig(id, env)); // NO injected fetch: the real transport
    assert.equal(provider.transport, 'live');
    for (const injectedTransportQuota of [undefined, 0, 1, 5, 1000]) {
      await assert.rejects(
        proposeCandidate({
          provider,
          store: createReservationStore(path.join(evidence, 'reservations')),
          runId: `run-${id}`,
          consent: createProposalConsent({ runId: `run-${id}`, providerId: id, inputSha256: request.inputSha256 }),
          request,
          evidenceRoot: evidence,
          injectedTransportQuota, // must be ignored for the real transport
        }),
        (e: unknown) => e instanceof ProposalError && e.code === 'LIVE_NOT_APPROVED',
        `${id} quota ${String(injectedTransportQuota)}`,
      );
    }
  }
  assert.equal(existsSync(path.join(evidence, 'reservations')), false);
  assert.equal(existsSync(path.join(evidence, 'proposals')), false);
  assert.equal(fetchCalls, 0, 'global fetch (the real network) was never invoked');
});
