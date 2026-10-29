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
import { expectedGateCode } from '../support/real-gate.ts';

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

test('nothing outside tests calls the gated proposal entry point except the single owner-operated script', () => {
  const callers = walk(path.join(root, 'packages')).concat(walk(path.join(root, 'scripts'))).filter((f) => {
    const text = readFileSync(f, 'utf8');
    // the readiness preflight calls it only with a MALFORMED argument (it must be rejected before any gate); the owner script wires it once
    return /\bproposeCandidate\b/.test(text) && !PROPOSAL_FILES.some((p) => f.endsWith(p)) && !f.endsWith('/index.ts') && !f.endsWith('packages/inference/src/proposal-readiness.ts');
  }).map((f) => path.relative(root, f).split(path.sep).join('/'));
  assert.deepEqual(callers, ['scripts/c3-live-proposal.ts']);
  // and no package script, workflow or script imports it
  assert.doesNotMatch(src('package.json'), /patch-proposal|proposeCandidate/);
  for (const f of walk(path.join(root, 'scripts')).filter((f) => !f.endsWith('scripts/c3-live-proposal.ts'))) assert.doesNotMatch(readFileSync(f, 'utf8'), /patch-proposal|proposeCandidate/, f);
});

test('the staging runner and the verifier never import the proposal pipeline (proposals cannot reach them)', () => {
  assert.doesNotMatch(src('packages/core/src/candidate-stage.ts'), /patch-proposal|inference/);
  for (const f of walk(path.join(root, 'verifier'))) assert.doesNotMatch(readFileSync(f, 'utf8'), /patch-proposal|inference/, f);
});

test('LIVE-C3-01 is approved for exactly one Meta attempt: the live quota is a frozen code constant ({ meta: 1, baseten: 0 }) that no environment variable can raise', () => {
  assert.deepEqual({ ...APPROVED_LIVE_QUOTA }, { meta: 1, baseten: 0 });
  assert.equal(Object.isFrozen(APPROVED_LIVE_QUOTA), true);
  assert.doesNotMatch(src('packages/inference/src/reservations.ts'), /process\.env/);
  assert.doesNotMatch(src('packages/inference/src/patch-proposal.ts'), /process\.env/);
  assert.doesNotMatch(src('packages/inference/src/config.ts'), /QUOTA/i);
});

test('exactly one production call site of provider.structuredResponse exists (the dormant Meta transport); tests/support is never imported by production code', () => {
  const prod = walk(path.join(root, 'packages')).concat(walk(path.join(root, 'scripts')));
  const callers = prod.filter((f) => /\.structuredResponse\(/.test(readFileSync(f, 'utf8'))).map((f) => path.relative(root, f).split(path.sep).join('/'));
  assert.deepEqual(callers, ['packages/inference/src/meta-proposal-transport.ts'], 'the single call site is the dormant, zero-argument Meta transport; see live01b-prep-boundary.test.ts');
  for (const f of prod) assert.doesNotMatch(readFileSync(f, 'utf8'), /tests\/support|proposal-harness/, f);
  // the disabled entry point must not even reference its argument
  const body = src('packages/inference/src/patch-proposal.ts');
  const fn = body.slice(body.indexOf('export async function proposeCandidate'));
  const entry = fn.slice(fn.indexOf('{\n'));
  // the whole body: one lazy import and one delegation that forwards exactly two fields of the argument
  assert.equal(entry, "{\n  const { runProductionProposalAttempt } = await import('./proposal-orchestrator.ts');\n  return runProductionProposalAttempt({ runId: input?.runId, request: input?.request });\n}\n", 'the entry point does nothing but delegate to the production runner');
  assert.doesNotMatch(entry, /provider|store|claim|fetch|writeFile|process\.env|quota|root|probe|clock|transport/i);
});

// ---------------------------------------------------------------- MAJOR-2: adversarial entry-point tests

const request = () =>
  buildProposalRequest({
    symptom: parseSymptom(validSymptom(), { videoDurationSec: 10 }),
    facts: trustedFactsFromBaseline({ viewport: { width: 390, height: 844 }, tapPoint: { x: 1, y: 1 }, hitTestTarget: 'promo-overlay', cartCountBefore: '0', cartCountAfter: '0' } satisfies F01Observation, true),
  });

for (const id of ['meta', 'baseten'] as const) {
  test(`MAJOR-2 (${id}): a purported injected transport or provider is never invoked and the real gate (no pin, or no operator approval) stops the call; nothing is reserved or written`, async () => {
    const gateCode = await expectedGateCode(root);
    const req = request();
    const evidence = tempDir('pp-sec-');
    let forwarded = 0;
    // would-be live transport: counts, then would hand the request to the real platform fetch
    const forwarding = (async (url: string, init: RequestInit) => {
      forwarded++;
      return realFetch(url, init);
    }) as never;
    const env = { ...liveEnv(), MODEL_API_KEY: SENTINEL_KEY, BASETEN_API_KEY: SENTINEL_KEY };
    const provider = createProvider(loadProviderConfig(id, env), { fetch: forwarding });
    let providerCallbacks = 0;
    const forged = new Proxy(provider, {
      get(target, prop, recv) {
        const v = Reflect.get(target, prop, recv);
        if (typeof v === 'function') return (...a: unknown[]) => { providerCallbacks++; return (v as (...x: unknown[]) => unknown).apply(target, a); };
        return v;
      },
    });
    const hand = { id, models: provider.models, billableCallsAllowed: true, transport: 'injected', structuredResponse: async () => { providerCallbacks++; return realFetch('https://api.meta.ai/v1/responses'); } };
    // the process environment would let a real call through every credential-free check; only the production gate can stop it
    const savedEnv = process.env;
    let keyReads = 0;
    process.env = new Proxy({ ...savedEnv, MODEL_API_KEY: SENTINEL_KEY, BASETEN_API_KEY: SENTINEL_KEY, PROOFPILOT_ALLOW_BILLABLE_CALLS: '1' }, { get(t, k) { if (k === 'MODEL_API_KEY' || k === 'BASETEN_API_KEY') keyReads++; return (t as Record<string, string | undefined>)[k as string]; } }) as NodeJS.ProcessEnv;
    try {
      for (const candidate of [provider, forged, hand]) {
        for (const injectedTransportQuota of [undefined, 0, 1, 5, 1000]) {
          await assert.rejects(
            proposeCandidate({
              provider: candidate,
              store: createReservationStore(path.join(evidence, 'reservations')),
              runId: `run-${id}`,
              consent: createProposalConsent({ runId: `run-${id}`, providerId: id, inputSha256: req.inputSha256 }),
              request: req,
              evidenceRoot: evidence,
              injectedTransportQuota,
              mockQuota: injectedTransportQuota,
            } as never),
            (e: unknown) => (e as { code?: string })?.code === gateCode,
            `${id} quota ${String(injectedTransportQuota)}`,
          );
        }
      }
    } finally {
      process.env = savedEnv;
    }
    assert.equal(keyReads, 0, 'the credential field was never read');
    assert.equal(forwarded, 0, 'the purported injected transport was never invoked');
    assert.equal(providerCallbacks, 0, 'no provider method was called');
    assert.equal(fetchCalls, 0, 'global fetch (the real network) was never invoked');
    assert.equal(existsSync(path.join(evidence, 'reservations')), false, 'nothing was reserved');
    assert.equal(existsSync(path.join(evidence, 'proposals')), false, 'nothing was written');
  });
}

test('MAJOR-2: the entry point reads only runId and request from its argument and rejects every malformed call before the gate', async () => {
  const reads: string[] = [];
  const spy = new Proxy({}, { get(_t, k) { reads.push(String(k)); return undefined; }, has() { reads.push('has'); return false; }, ownKeys() { reads.push('ownKeys'); return []; } });
  for (const arg of [undefined, null, 0, 'x', [], {}, spy]) {
    await assert.rejects(proposeCandidate(arg as never), (e: unknown) => e instanceof ProposalError && e.code === 'INVALID_INPUT');
  }
  assert.deepEqual([...new Set(reads)].sort(), ['request', 'runId'], 'only the two attempt facts are ever read');
});
