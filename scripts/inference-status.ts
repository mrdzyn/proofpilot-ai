// Reports provider configuration status without printing secrets.
// `--discover` performs a non-billable GET /models per configured provider and
// reports only whether the exact configured model IDs are listed.
// This script never calls a billable endpoint.
import { createProvider, InferenceError, loadProviderConfig, PROVIDERS, type ProviderId } from '../packages/inference/src/index.ts';

const discover = process.argv.includes('--discover');

for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
  const def = PROVIDERS[id];
  console.log(`\n[${id}] ${def.label}`);
  let config;
  try {
    config = loadProviderConfig(id, process.env);
  } catch (err) {
    console.log(`  config:   INVALID — ${(err as Error).message}`);
    continue;
  }
  console.log(`  base URL: ${config.baseUrl}${config.baseUrl === def.defaultBaseUrl ? ' (default)' : ''}`);
  console.log(`  ${def.apiKeyEnv}: ${config.apiKey ? 'present' : 'NOT SET'}`);
  for (const [role, model] of Object.entries(config.models)) console.log(`  model ${role}: ${model}`);
  console.log(`  billable calls: ${config.billableCallsAllowed ? 'ENABLED' : 'disabled'}`);
  if (!discover) continue;
  if (!config.apiKey) {
    console.log('  discovery: NOT TESTED (no API key configured)');
    continue;
  }
  try {
    const provider = createProvider(config);
    const ids = await provider.listModels();
    console.log(`  discovery: OK (${ids.length} models listed)`);
    for (const model of Object.values(config.models)) {
      const related = ids.filter((m) => m !== model && m.startsWith(model.split(/[-.]\d/)[0]!));
      console.log(`  exact ID ${model}: ${ids.includes(model) ? 'AVAILABLE' : 'NOT LISTED'}${related.length ? ` (related, not substituted: ${related.join(', ')})` : ''}`);
    }
  } catch (err) {
    const e = err as InferenceError;
    console.log(`  discovery: FAILED — ${e.code ?? 'ERROR'}: ${e.message}`);
  }
}
