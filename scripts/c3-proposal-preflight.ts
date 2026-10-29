// C3-B2A zero-network proposal preflight. Checks the future live-activation requirements with built-in mock
// literals only: no provider request, no secret read into the report, no execution of any proposal. It cannot
// authorize anything: LIVE-C3-01 is reported NOT APPROVED.
//
//   node scripts/c3-proposal-preflight.ts [--provider meta|baseten] [--check-credentials] [--write]
//
// Exit 0: technical checks passed (still NOT authorized). Exit 1: a technical check failed. Exit 2: usage.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { parseSymptom } from '../packages/core/src/index.ts';
import { runProposalPreflight, trustedFactsFromBaseline } from '../packages/inference/src/index.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
let values;
try {
  ({ values } = parseArgs({ options: { provider: { type: 'string' }, 'check-credentials': { type: 'boolean' }, write: { type: 'boolean' } }, strict: true }));
} catch (e) {
  console.log(`usage error: ${(e as Error).message}`);
  process.exit(2);
}
const providerId = values.provider ?? 'meta';
if (providerId !== 'meta' && providerId !== 'baseten') {
  console.log('usage error: --provider must be meta or baseten');
  process.exit(2);
}

// Synthetic, built-in inputs: a plausible validated Symptom hypothesis and the trusted F01 baseline observation.
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

const report = await runProposalPreflight({ providerId, env: process.env, symptom, facts, checkCredentialPresence: values['check-credentials'] === true });

console.log(`=== C3-B2A proposal preflight (${providerId}) ===`);
console.log(`provider requests made:   ${report.providerRequests}`);
console.log(`requested model:          ${report.requestedModel ?? 'n/a'}`);
console.log(`credential presence:      ${report.credential.checked ? (report.credential.present ? 'present' : 'NOT SET') : 'not checked (use --check-credentials only when authorized)'}`);
for (const c of report.checks) console.log(`  [${c.status.padEnd(17)}] ${c.id}: ${c.detail}`);
console.log(`\ntechnical checks passed:  ${report.technicalChecksPassed}`);
console.log(`live authorization:       ${report.liveAuthorization} (live quota ${report.liveQuota})`);
for (const b of report.blockers) console.log(`  blocker: ${b}`);
console.log(`verdict:                  ${report.verdict}`);
if (values.write) {
  const dir = path.join(repoRoot, '.proofpilot/preflight');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `proposal-preflight-${providerId}-${report.generatedAt.replace(/[-:.]/g, '')}.json`);
  await writeFile(file, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(`written:                  ${path.relative(repoRoot, file)}`);
}
process.exitCode = report.technicalChecksPassed ? 0 : 1;
