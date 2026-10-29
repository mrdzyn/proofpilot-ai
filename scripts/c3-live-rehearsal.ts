// C3-LIVE-01A: zero-network, fully synthetic rehearsal of the future activation order. NOT a genuine authorization and NOT a provider call.
//
//   node scripts/c3-live-rehearsal.ts [--scenario accepted|refusal|incomplete|missing-status|wrong-model|empty|malformed|forbidden|out-of-grammar|provider-error|duplicate-run|all] [--write]
// Exit 0: every rehearsed outcome behaved as designed. Exit 1: a rehearsed guard failed. Exit 2: usage.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { parseSymptom } from '../packages/core/src/index.ts';
import { runActivationRehearsal, trustedFactsFromBaseline, type MockScenario } from '../packages/inference/src/index.ts';

const ALL: MockScenario[] = ['accepted', 'refusal', 'incomplete', 'missing-status', 'wrong-model', 'empty', 'malformed', 'forbidden', 'out-of-grammar', 'provider-error', 'duplicate-run'];
const repoRoot = path.resolve(import.meta.dirname, '..');
let values;
try {
  ({ values } = parseArgs({ options: { scenario: { type: 'string' }, write: { type: 'boolean' } }, strict: true }));
} catch (e) {
  console.log(`usage error: ${(e as Error).message}`);
  process.exit(2);
}
const wanted = values.scenario ?? 'all';
if (wanted !== 'all' && !ALL.includes(wanted as MockScenario)) {
  console.log('usage error: unknown --scenario');
  process.exit(2);
}
const symptom = parseSymptom(
  {
    summary: 'Tapping Add to cart does not change the cart counter on a mobile viewport.',
    expected: 'The cart count increases to 1 after tapping Add to cart.',
    actual: 'The cart count stays at 0 after the tap.',
    observations: [{ timestampSec: 2, text: 'Product page with an Add to cart button and cart count 0.', confidence: 'high' }],
    reproductionSteps: [{ action: 'tap', target: 'Add to cart button', approximateTimeSec: 3 }],
    confidence: 'medium',
    uncertainties: ['The video alone does not show why the tap has no effect.'],
    unsupportedClaims: [],
    sufficientContext: true,
  },
  { videoDurationSec: 10 },
);
const facts = trustedFactsFromBaseline({ viewport: { width: 390, height: 844 }, tapPoint: { x: 195, y: 700 }, hitTestTarget: 'promo-overlay', cartCountBefore: '0', cartCountAfter: '0' }, true);
const reports = [];
for (const scenario of wanted === 'all' ? ALL : [wanted as MockScenario]) reports.push(await runActivationRehearsal({ symptom, facts, scenario, repoRoot }));

console.log('=== C3-LIVE-01A activation rehearsal — SYNTHETIC, ZERO NETWORK, NOT A GENUINE AUTHORIZATION ===');
for (const r of reports) {
  console.log(`\n[${r.scenario}] proposal: ${r.proposal ? `${r.proposal.status}${r.proposal.reason ? ` (${r.proposal.reason})` : ''}` : 'none (refused before any call)'}`);
  for (const s of r.steps) console.log(`  ${s.ok ? 'ok  ' : 'FAIL'} ${s.id}: ${s.detail}`);
}
console.log(`\nprovider requests: 0; genuine authorization: NONE; VERIFIED produced: never; production validator: ${reports[0]?.productionValidatorRefusal ?? 'n/a'}`);
if (values.write) {
  const dir = path.join(repoRoot, '.proofpilot/rehearsal');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(path.join(dir, 'live01a-rehearsal.json'), JSON.stringify(reports, null, 2) + '\n', { mode: 0o600 });
}
process.exit(reports.every((r) => r.ok) ? 0 : 1);
