// Prepared owner-run Baseten discovery: dry run by default, one request at most, retries forced to 0, no secret
// printed, no alias substitution. Every request here goes to an injected mock; the real network is trapped.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { BASETEN_PINNED_MODEL, BASETEN_PUBLIC_ALIAS, runBasetenDiscovery } from '../../packages/inference/src/index.ts';
import { json, mockFetch, SENTINEL_KEY } from '../helpers.ts';

const realFetch = globalThis.fetch;
let trapped = 0;
before(() => {
  globalThis.fetch = (() => {
    trapped++;
    throw new Error('real network must not be used');
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  assert.equal(trapped, 0);
});

const models = (...ids: string[]) => json({ object: 'list', data: ids.map((id) => ({ id })) }, 200, { 'x-request-id': 'q' });
async function go(argv: string[], env: Record<string, string | undefined>, queue: Parameters<typeof mockFetch>[0] = []) {
  const m = mockFetch(queue);
  const lines: string[] = [];
  const code = await runBasetenDiscovery(argv, { env, fetch: m.fetch, log: (l) => lines.push(l) });
  return { code, calls: m.calls, out: lines.join('\n') };
}
const armed = { BASETEN_API_KEY: SENTINEL_KEY, PROOFPILOT_ALLOW_PROVIDER_DISCOVERY: '1' };

test('default is a dry run: zero requests, the pinned id is shown, the key never is', async () => {
  const r = await go([], { BASETEN_API_KEY: SENTINEL_KEY }, [models(BASETEN_PINNED_MODEL)]);
  assert.equal(r.code, 0);
  assert.equal(r.calls.length, 0);
  assert.match(r.out, /DRY RUN\. REQUESTS MADE: 0/);
  assert.match(r.out, /credential:\s+present \(value never printed\)/);
  assert.ok(r.out.includes(BASETEN_PINNED_MODEL));
  assert.ok(!r.out.includes(SENTINEL_KEY));
});

test('--execute is refused without the per-invocation opt-in or without a key, before any request', async () => {
  const noOptIn = await go(['--execute'], { BASETEN_API_KEY: SENTINEL_KEY }, [models(BASETEN_PINNED_MODEL)]);
  assert.deepEqual([noOptIn.code, noOptIn.calls.length], [2, 0]);
  assert.match(noOptIn.out, /PROOFPILOT_ALLOW_PROVIDER_DISCOVERY=1/);
  const noKey = await go(['--execute'], { PROOFPILOT_ALLOW_PROVIDER_DISCOVERY: '1' }, [models(BASETEN_PINNED_MODEL)]);
  assert.deepEqual([noKey.code, noKey.calls.length], [2, 0]);
  const wrongValue = await go(['--execute'], { BASETEN_API_KEY: SENTINEL_KEY, PROOFPILOT_ALLOW_PROVIDER_DISCOVERY: 'true' }, [models(BASETEN_PINNED_MODEL)]);
  assert.deepEqual([wrongValue.code, wrongValue.calls.length], [2, 0]);
  const bad = await go(['--execute', '--also'], armed, [models(BASETEN_PINNED_MODEL)]);
  assert.deepEqual([bad.code, bad.calls.length], [2, 0]);
});

test('an armed run makes exactly ONE GET /models; the pinned id is reported exactly; nothing secret is printed', async () => {
  const r = await go(['--execute'], armed, [models('other/model', BASETEN_PINNED_MODEL)]);
  assert.equal(r.code, 0);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0]!.init.method, 'GET');
  assert.equal(r.calls[0]!.url, 'https://inference.baseten.co/v1/models');
  assert.equal(r.calls[0]!.init.redirect, 'error');
  assert.match(r.out, /REQUESTS MADE: 1/);
  assert.match(r.out, /exact pinned id meta-models\/muse-spark-open-1026: LISTED/);
  assert.ok(!r.out.includes(SENTINEL_KEY));
  assert.ok(!r.out.includes('other/model'), 'the raw catalog is not dumped');
});

test('the public alias is information only: listing it without the pinned id is NOT a pass and is never substituted', async () => {
  const r = await go(['--execute'], armed, [models(BASETEN_PUBLIC_ALIAS)]);
  assert.equal(r.code, 1);
  assert.match(r.out, /exact pinned id .*: NOT LISTED/);
  assert.match(r.out, /information only; never substituted/);
  const both = await go(['--execute'], armed, [models(BASETEN_PUBLIC_ALIAS, BASETEN_PINNED_MODEL)]);
  assert.equal(both.code, 0);
  assert.notEqual(BASETEN_PINNED_MODEL, BASETEN_PUBLIC_ALIAS);
});

test('retries are forced to 0: a 429, a 500 and a timeout each cause exactly one request, even with retries configured', async () => {
  const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
  for (const first of [new Response('slow', { status: 429 }), new Response('boom', { status: 500 }), timeout]) {
    const r = await go(['--execute'], { ...armed, PROOFPILOT_INFERENCE_MAX_RETRIES: '2' }, [first, models(BASETEN_PINNED_MODEL)]);
    assert.equal(r.code, 1);
    assert.equal(r.calls.length, 1);
    assert.match(r.out, /no retry was made/);
    assert.ok(!r.out.includes(SENTINEL_KEY));
  }
});

test('a provider error that echoes the key is redacted from the output', async () => {
  const r = await go(['--execute'], armed, [new Response(`unauthorized ${SENTINEL_KEY}`, { status: 401 })]);
  assert.equal(r.code, 1);
  assert.ok(!r.out.includes(SENTINEL_KEY));
});

test('the real script, run as a process with no arguments, is a dry run that makes no request', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const r = spawnSync(process.execPath, ['scripts/baseten-model-discovery.ts'], { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /REQUESTS MADE: 0/);
  const refused = spawnSync(process.execPath, ['scripts/baseten-model-discovery.ts', '--execute'], { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' } });
  assert.equal(refused.status, 2);
  assert.match(refused.stdout, /REQUESTS MADE: 0/);
});
