// C3-B2B P1 equivalence: the legacy live path (`live-input.ts`, the inference barrel) behaves identically to
// the neutral Zone P module it now delegates to. Synthetic evidence in temp directories only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as neutral from '../../packages/provenance/src/provenance-input.ts';
import * as legacyInput from '../../packages/inference/src/live-input.ts';
import * as legacyBarrel from '../../packages/inference/src/index.ts';
import { parseSymptom } from '../../packages/core/src/index.ts';
import { tempDir, validSymptom } from '../helpers.ts';
import { edit, MOBILE_OBS, writeEvidence } from '../support/live-evidence.ts';

const HEAD = 'c'.repeat(40);
const TREE = 'd'.repeat(40);

test('the legacy path re-exports the exact neutral objects (delegation, not reimplementation)', () => {
  for (const name of ['loadCertifiedBaselineFacts', 'loadCertifiedProposalInput', 'trustedFactsFromBaseline', 'buildProposalRequest', 'LiveInputError', 'ProposalError', 'PROPOSAL_LIMITS'] as const) {
    assert.strictEqual((legacyInput as Record<string, unknown>)[name], (neutral as Record<string, unknown>)[name], `live-input.ts ${name}`);
    assert.strictEqual((legacyBarrel as Record<string, unknown>)[name], (neutral as Record<string, unknown>)[name], `inference index ${name}`);
  }
});

test('the deterministic request builder is pinned: a fixed symptom and facts yield one golden hash', () => {
  const symptom = parseSymptom(validSymptom(), { videoDurationSec: 10 });
  const facts = neutral.trustedFactsFromBaseline(MOBILE_OBS, true);
  const req = neutral.buildProposalRequest({ symptom, facts });
  assert.equal(req.chars, 1942);
  assert.equal(req.inputSha256, 'b7525d94da063e4e014db685b5b6bda4b12ab98716443934e1b081a0c1be5f6d');
  assert.deepEqual(legacyBarrel.buildProposalRequest({ symptom, facts }), req, 'the legacy path builds the identical golden request');
});

test('the owner CLI still wires the same two provenance functions from the same two modules', async () => {
  const { readFileSync } = await import('node:fs');
  const root = path.resolve(import.meta.dirname, '../..');
  const cli = readFileSync(path.join(root, 'packages/inference/src/live-proposal-cli.ts'), 'utf8');
  assert.match(cli, /import \{ LiveInputError, loadCertifiedProposalInput \} from '\.\/live-input\.ts';/);
  assert.match(cli, /import \{ buildProposalRequest, META_PROPOSAL_MODEL, type BuiltProposalRequest, PROPOSAL_LABEL, PROPOSAL_LIMITS, ProposalError, type ProposeCandidateInput \} from '\.\/patch-proposal\.ts';/);
});

const outcomeOf = async (load: (over?: Partial<{ head: string; fixtureTree: string; analysisId: string }>) => Promise<unknown>, over?: Partial<{ head: string; fixtureTree: string; analysisId: string }>): Promise<{ ok: true; value: unknown } | { ok: false; code: string; message: string }> => {
  try {
    return { ok: true, value: await load(over) };
  } catch (e) {
    return { ok: false, code: (e as { code?: string }).code ?? 'NO_CODE', message: (e as Error).message };
  }
};

test('both paths return identical inputs and identical typed refusals across a mutation battery', async () => {
  const scenarios: Array<[string, (root: string, base: ReturnType<typeof writeEvidence>) => void, Partial<{ head: string; fixtureTree: string; analysisId: string }> | undefined]> = [
    ['valid', () => {}, undefined],
    ['other revision', () => {}, { head: 'e'.repeat(40) }],
    ['other fixture tree', () => {}, { fixtureTree: 'f'.repeat(40) }],
    ['uncertified', (root, e) => { edit(path.join(e.baselineDir, 'baseline-summary.json'), (d) => { d.certified = false; }); }, undefined],
    ['tampered artifact', (root, e) => { edit(path.join(e.baselineDir, 'baseline-summary.json'), (d) => { d.runId = 'f01-baseline-20250101T000000Z-ffffff'; }); }, undefined],
    ['mock evidence', (root, e) => { edit(e.analysisFile, (d) => { d.evidenceKind = 'mock'; }); }, undefined],
    ['bad symptom provenance', (root, e) => { edit(e.analysisFile, (d) => { d.result.symptom.provenance = 'trusted'; }); }, undefined],
    ['unknown video', (root, e) => { edit(e.analysisFile, (d) => { d.result.provenance.video.sha256 = 'b'.repeat(64); }); }, undefined],
    ['missing analysis', () => {}, { analysisId: 'c2b-live-smoke-404' }],
  ];
  for (const [name, mutate, over] of scenarios) {
    const mk = (load: typeof neutral.loadCertifiedProposalInput) => {
      const root = tempDir('pp-equiv-');
      const e = writeEvidence(root, { head: HEAD, fixtureTree: TREE });
      mutate(root, e);
      return outcomeOf((o) => load({ repoRoot: root, head: HEAD, fixtureTree: TREE, analysisId: e.analysisId, ...o }), over);
    };
    const a = await mk(neutral.loadCertifiedProposalInput);
    const b = await mk(legacyBarrel.loadCertifiedProposalInput);
    assert.deepEqual(b, a, `${name}: the legacy path matches the neutral module exactly`);
    if (a.ok) {
      const ra = neutral.buildProposalRequest({ symptom: (a.value as neutral.LiveProposalInput).symptom, facts: (a.value as neutral.LiveProposalInput).facts });
      const rb = legacyBarrel.buildProposalRequest({ symptom: (b as { ok: true; value: neutral.LiveProposalInput }).value.symptom, facts: (b as { ok: true; value: neutral.LiveProposalInput }).value.facts });
      assert.deepEqual(rb, ra, `${name}: byte-identical built requests`);
    }
  }
});
