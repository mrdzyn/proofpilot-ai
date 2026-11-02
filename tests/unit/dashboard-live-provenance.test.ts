// UI-C3-02-BT-LIVE-01: Zone L run-provenance helper. Pins the exact mock
// vs live display contract the shell renders: labels, usage notes, and the
// UNVERIFIED live status. No DOM: the component consumes this helper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeRunProvenance } from '../../dashboard/src/zones/liveProvenance.ts';

test('L-BT-10: mock results keep the exact fixture banner and labels', () => {
  const prov = describeRunProvenance({
    transport: 'mock-fixture',
    mockModel: 'mock-fixture-model (D9 pending: not a live model)',
    liveInference: false,
  });
  assert.equal(prov.isLive, false);
  assert.equal(prov.provider, 'mock');
  assert.equal(prov.model, 'mock-fixture-model (D9 pending: not a live model)');
  assert.equal(prov.transport, 'mock-fixture');
  assert.equal(prov.usageNote, 'fixture counts, not billing');
  assert.equal(prov.verdictChip, 'MOCK FIXTURE — NOT A PROVIDER RESPONSE');
  assert.equal(prov.proposalChip, 'UNTRUSTED PROPOSAL — NOT VERIFIED (MOCK)');
});

test('L-BT-11: live results name the provider and exact model with UNVERIFIED status', () => {
  const model = 'meta-models/muse-spark-open';
  const prov = describeRunProvenance({
    transport: 'baseten-live',
    provider: 'baseten',
    model,
    liveInference: true,
  });
  assert.equal(prov.isLive, true);
  assert.equal(prov.provider, 'baseten');
  assert.equal(prov.model, model);
  assert.equal(prov.transport, 'baseten-live');
  assert.equal(prov.usageNote, 'reported, not billing');
  assert.equal(prov.verdictChip, 'LIVE VIA BASETEN — UNVERIFIED MODEL OUTPUT');
  assert.equal(prov.proposalChip, 'UNTRUSTED PROPOSAL — NOT VERIFIED (BASETEN)');
});

test('L-BT-12: unknown or missing provenance never claims a live result', () => {
  for (const record of [{}, { transport: 'other' }, { transport: 'baseten-live', model: '' }]) {
    const prov = describeRunProvenance(record);
    if (record['transport'] === 'baseten-live') {
      assert.equal(prov.isLive, true);
      assert.equal(prov.model, 'unknown live model');
    } else {
      assert.equal(prov.isLive, false);
    }
  }
});
