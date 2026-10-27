import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessSymptom, parseSymptom, SYMPTOM_JSON_SCHEMA, SYMPTOM_LIMITS, SymptomValidationError } from '../../packages/core/src/index.ts';
import { insufficientSymptom, validSymptom } from '../helpers.ts';

const ctx = { videoDurationSec: 10 };
const issuesOf = (raw: unknown, c = ctx) => {
  try {
    parseSymptom(raw, c);
  } catch (e) {
    assert.ok(e instanceof SymptomValidationError, `expected SymptomValidationError, got ${e}`);
    return e.issues.map((i) => `${i.path}: ${i.message}`).join(' | ');
  }
  return null;
};

test('a valid model answer becomes a labelled hypothesis with trimmed strings', () => {
  const s = parseSymptom(validSymptom({ summary: '  Tap does nothing.  ' }), ctx);
  assert.equal(s.schemaVersion, 1);
  assert.equal(s.provenance, 'model-hypothesis');
  assert.equal(s.summary, 'Tap does nothing.');
  assert.equal(s.observations.length, 2);
});

test('provenance and schemaVersion are set by the validator, never accepted from the model', () => {
  assert.match(issuesOf(validSymptom({ provenance: 'verified-evidence' })) ?? '', /provenance: unknown property/);
  assert.match(issuesOf(validSymptom({ schemaVersion: 2 })) ?? '', /schemaVersion: unknown property/);
  assert.match(issuesOf(validSymptom({ status: 'VERIFIED' })) ?? '', /status: unknown property/);
});

test('wrong shapes are rejected (T05)', () => {
  const cases: Array<[string, unknown]> = [
    ['null', null],
    ['array', []],
    ['string', 'a symptom'],
    ['empty object', {}],
    ['missing summary', (() => { const s: any = validSymptom(); delete s.summary; return s; })()],
    ['missing arrays', (() => { const s: any = validSymptom(); delete s.observations; delete s.uncertainties; return s; })()],
    ['summary not a string', validSymptom({ summary: 42 })],
    ['empty summary', validSymptom({ summary: '   ' })],
    ['confidence outside enum', validSymptom({ confidence: 'certain' })],
    ['observations not an array', validSymptom({ observations: 'saw it' })],
    ['observation not an object', validSymptom({ observations: ['x'] })],
    ['observation extra key', validSymptom({ observations: [{ timestampSec: 1, text: 't', confidence: 'low', verified: true }] })],
    ['observation missing text', validSymptom({ observations: [{ timestampSec: 1, confidence: 'low' }] })],
    ['timestamp as string', validSymptom({ observations: [{ timestampSec: '1', text: 't', confidence: 'low' }] })],
    ['timestamp NaN', validSymptom({ observations: [{ timestampSec: Number.NaN, text: 't', confidence: 'low' }] })],
    ['sufficientContext not boolean', validSymptom({ sufficientContext: 'yes' })],
    ['control characters', validSymptom({ summary: 'bad\u0000text' })],
    ['oversize string', validSymptom({ actual: 'x'.repeat(SYMPTOM_LIMITS.maxStringChars + 1) })],
    ['too many observations', validSymptom({ observations: Array.from({ length: SYMPTOM_LIMITS.maxItems + 1 }, () => ({ timestampSec: 1, text: 't', confidence: 'low' })) })],
    ['uncertainty not a string', validSymptom({ uncertainties: [1] })],
  ];
  for (const [name, raw] of cases) assert.notEqual(issuesOf(raw), null, name);
});

test('timestamps must fall inside the clip', () => {
  assert.equal(issuesOf(validSymptom({ observations: [{ timestampSec: 10.4, text: 't', confidence: 'low' }] })), null, 'within 0.5 s tolerance');
  assert.match(issuesOf(validSymptom({ observations: [{ timestampSec: 10.6, text: 't', confidence: 'low' }] })) ?? 'none', /outside the 10\.0 s clip/);
  assert.match(issuesOf(validSymptom({ observations: [{ timestampSec: -0.1, text: 't', confidence: 'low' }] })) ?? 'none', /outside/);
  assert.match(issuesOf(validSymptom({ reproductionSteps: [{ action: 'tap', target: 'x', approximateTimeSec: 99 }] })) ?? 'none', /reproductionSteps\[0\]\.approximateTimeSec/);
});

test('contradictory certainty is rejected: sufficient context needs grounds, insufficient needs reasons', () => {
  assert.match(issuesOf(validSymptom({ observations: [] })) ?? 'none', /no observations/);
  assert.match(issuesOf(validSymptom({ reproductionSteps: [] })) ?? 'none', /no reproduction steps/);
  assert.match(issuesOf(validSymptom({ sufficientContext: false, uncertainties: [] })) ?? 'none', /must say what is uncertain/);
});

test('F03-like insufficient context stays uncertain and never becomes a reproduction go-ahead (T06)', () => {
  const s = parseSymptom(insufficientSymptom(), ctx);
  assert.equal(s.sufficientContext, false);
  assert.ok(s.uncertainties.length >= 1);
  const a = assessSymptom(s);
  assert.equal(a.trust, 'hypothesis');
  assert.equal(a.canAttemptReproduction, false);
  assert.match(a.reasons.join(' '), /lacks enough context/);
  assert.match(a.reasons.join(' '), /confidence is low/);
});

test('a good symptom may attempt reproduction, but is still only a hypothesis', () => {
  const a = assessSymptom(parseSymptom(validSymptom(), ctx));
  assert.equal(a.canAttemptReproduction, true);
  assert.equal(a.trust, 'hypothesis');
  assert.match(a.reasons.join(' '), /must be confirmed by a real browser reproduction/);
  // Low confidence alone blocks it, even if the model claims sufficient context.
  assert.equal(assessSymptom(parseSymptom(validSymptom({ confidence: 'low' }), ctx)).canAttemptReproduction, false);
});

test('the schema sent to Meta stays inside the strict-mode subset', () => {
  const walk = (node: any, path: string) => {
    if (node && typeof node === 'object') {
      for (const bad of ['oneOf', 'allOf', 'not', '$ref', '$defs']) assert.ok(!(bad in node), `${path} uses ${bad}`);
      if (node.type === 'object') {
        assert.equal(node.additionalProperties, false, `${path} must set additionalProperties:false`);
        assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort(), `${path} must require every property`);
      }
      for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
    }
  };
  walk(SYMPTOM_JSON_SCHEMA, '$');
  assert.equal(SYMPTOM_JSON_SCHEMA.type, 'object');
});
