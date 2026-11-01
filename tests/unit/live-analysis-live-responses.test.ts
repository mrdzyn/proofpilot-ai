// UI-C3-02-BT-LIVE-01: live sanitizer batteries. Same closed rules as the
// mock path (exact model echo, non-empty capped text, safe-int usage,
// audited closed-grammar parser), plus live provenance on success.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASETEN_DOCUMENTED_DIRECT_MODEL } from '../../packages/live-analysis/src/config.ts';
import {
  MAX_OBSERVATION_CHARS,
  sanitizeLiveAnalysisResponse,
  sanitizeLiveProposalResponse,
} from '../../packages/live-analysis/src/responses.ts';

const APPROVED = BASETEN_DOCUMENTED_DIRECT_MODEL;
const USAGE = { promptTokens: 120, completionTokens: 45, totalTokens: 165 };
const TRIPLE = JSON.stringify({ adjustments: [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }] });

function liveReply(text: string, model: string = APPROVED): unknown {
  return { model, text, usage: { ...USAGE } };
}

test('L-LIVE-3: valid live replies sanitize with live provenance, never mock labels', () => {
  const analysis = sanitizeLiveAnalysisResponse(liveReply('tap top right, count one'), APPROVED);
  assert.equal(analysis.ok, true);
  if (analysis.ok) {
    assert.equal(analysis.value.kind, 'analysis');
    assert.equal(analysis.value.observations, 'tap top right, count one');
    assert.deepEqual(analysis.value.usage, USAGE);
    assert.equal(analysis.value.provider, 'baseten');
    assert.equal(analysis.value.model, APPROVED);
    assert.equal(analysis.value.transport, 'baseten-live');
    assert.equal(analysis.value.liveInference, true);
    assert.ok(!('mockModel' in analysis.value), 'no mock identity on live results');
  }
  const propose = sanitizeLiveProposalResponse(liveReply(TRIPLE), APPROVED);
  assert.equal(propose.ok, true);
  if (propose.ok) {
    assert.equal(propose.value.kind, 'proposal');
    assert.deepEqual(propose.value.adjustments, [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }]);
    assert.equal(typeof propose.value.renderedCss, 'string');
    assert.equal(propose.value.provider, 'baseten');
    assert.equal(propose.value.liveInference, true);
  }
});

test('L-LIVE-4: live envelope faults refuse with typed codes, never partial results', () => {
  const analysisCases: Array<[string, unknown, string]> = [
    ['null', null, 'BAD_SHAPE'],
    ['array', [], 'BAD_SHAPE'],
    ['wrong-model', liveReply('tap', 'meta/muse-spark-open'), 'WRONG_MODEL'],
    ['missing-text', { model: APPROVED, usage: { ...USAGE } }, 'BAD_SHAPE'],
    ['empty-text', liveReply(''), 'BAD_SHAPE'],
    ['oversize', liveReply('x'.repeat(MAX_OBSERVATION_CHARS + 1)), 'TEXT_TOO_LONG'],
    ['bad-usage', { model: APPROVED, text: 'tap', usage: { promptTokens: -1, completionTokens: 0, totalTokens: 0 } }, 'BAD_USAGE'],
    ['string-usage', { model: APPROVED, text: 'tap', usage: { promptTokens: 'many', completionTokens: 0, totalTokens: 0 } }, 'BAD_USAGE'],
  ];
  for (const [name, raw, code] of analysisCases) {
    const out = sanitizeLiveAnalysisResponse(raw, APPROVED);
    assert.equal(out.ok, false, name);
    if (!out.ok) assert.equal(out.code, code, name);
  }
  for (const hostile of ['hello', JSON.stringify({ nope: [] }), JSON.stringify({ adjustments: [{ selector: 'body' }] })]) {
    const out = sanitizeLiveProposalResponse(liveReply(hostile), APPROVED);
    assert.equal(out.ok, false, `hostile proposal refused: ${hostile.slice(0, 24)}`);
    if (!out.ok) assert.equal(out.code, 'PROPOSAL_REJECTED');
  }
  const wrongModel = sanitizeLiveProposalResponse(liveReply(TRIPLE, 'other'), APPROVED);
  assert.equal(wrongModel.ok, false);
  if (!wrongModel.ok) assert.equal(wrongModel.code, 'WRONG_MODEL');
});
