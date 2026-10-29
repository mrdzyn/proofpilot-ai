// C3-B2A: a prepared, owner-run, single-request Baseten model-discovery procedure (NOT run in C3-B2A).
//
// It exists so the owner can answer one question later: is the repository-pinned versioned id served? It is
// non-billable (GET /models), makes exactly one request with retries forced to 0, prints no secret and no raw
// body, and never substitutes the public alias. The default is a dry run that makes NO request; a real request
// needs BOTH the flag `--execute` and the environment variable PROOFPILOT_ALLOW_PROVIDER_DISCOVERY=1 in that
// invocation. No other code calls this module.
import { createProvider, type FetchLike } from './client.ts';
import { loadProviderConfig, PROVIDERS } from './config.ts';
import { InferenceError } from './errors.ts';

export const BASETEN_PINNED_MODEL = PROVIDERS.baseten.models.visual!.default;
/** Public documentation names this unversioned id. It is reported for information only and is never used. */
export const BASETEN_PUBLIC_ALIAS = 'meta-models/muse-spark-open';

export type DiscoveryDeps = {
  env: Record<string, string | undefined>;
  fetch?: FetchLike;
  log: (line: string) => void;
};

const USAGE = `usage: baseten-model-discovery [--execute]

  default (dry run)  print the plan. NO request is made.
  --execute          make exactly ONE non-billable GET <base>/models (retries forced to 0). Requires
                     PROOFPILOT_ALLOW_PROVIDER_DISCOVERY=1 in this invocation and BASETEN_API_KEY in the
                     environment (never printed). Owner-run only; not part of C3-B2A.`;

export async function runBasetenDiscovery(argv: string[], deps: DiscoveryDeps): Promise<number> {
  const { log } = deps;
  if (argv[0] === '--') argv = argv.slice(1);
  const unknown = argv.filter((a) => a !== '--execute' && a !== '--help');
  if (unknown.length > 0) {
    log(`usage error: unknown argument ${JSON.stringify(unknown[0])}\n${USAGE}`);
    return 2;
  }
  if (argv.includes('--help')) {
    log(USAGE);
    return 0;
  }
  const execute = argv.includes('--execute');

  // One request, no retries: force it regardless of the caller's environment.
  const env = { ...deps.env, PROOFPILOT_INFERENCE_MAX_RETRIES: '0' };
  let config;
  try {
    config = loadProviderConfig('baseten', env);
  } catch (e) {
    log(`config:        INVALID (${e instanceof InferenceError ? e.code : 'error'})`);
    return 2;
  }
  log(`provider:      Baseten Model APIs (${config.baseUrl})`);
  log(`pinned model:  ${BASETEN_PINNED_MODEL}  (exact; the public alias ${BASETEN_PUBLIC_ALIAS} is NOT substituted)`);
  log(`credential:    ${config.apiKey ? 'present' : 'NOT SET'} (value never printed)`);

  if (!execute) {
    log(`mode:          DRY RUN. REQUESTS MADE: 0`);
    log(`would send:    one GET ${config.baseUrl}/models, retries 0, redirects refused, key in the Authorization header only`);
    return 0;
  }
  if (deps.env.PROOFPILOT_ALLOW_PROVIDER_DISCOVERY !== '1') {
    log('refused:       --execute needs PROOFPILOT_ALLOW_PROVIDER_DISCOVERY=1 in this invocation. REQUESTS MADE: 0');
    return 2;
  }
  if (!config.apiKey) {
    log('refused:       BASETEN_API_KEY is not set. REQUESTS MADE: 0');
    return 2;
  }

  const provider = createProvider(config, { fetch: deps.fetch });
  let ids: string[];
  try {
    ids = await provider.listModels();
  } catch (e) {
    log(`mode:          EXECUTED. REQUESTS MADE: 1`);
    log(`result:        FAILED (${e instanceof InferenceError ? `${e.code}${e.status ? ` HTTP ${e.status}` : ''}` : 'error'}); no retry was made. Report this to the owner; do not rerun automatically.`);
    return 1;
  }
  const family = BASETEN_PINNED_MODEL.split(/[-.]\d/)[0]!.toLowerCase();
  const related = ids.filter((i) => i !== BASETEN_PINNED_MODEL && i.toLowerCase().startsWith(family)).slice(0, 10);
  log(`mode:          EXECUTED. REQUESTS MADE: 1`);
  log(`models listed: ${ids.length}`);
  log(`exact pinned id ${BASETEN_PINNED_MODEL}: ${ids.includes(BASETEN_PINNED_MODEL) ? 'LISTED' : 'NOT LISTED'}`);
  log(`public alias ${BASETEN_PUBLIC_ALIAS}: ${ids.includes(BASETEN_PUBLIC_ALIAS) ? 'listed (information only; never substituted)' : 'not listed'}`);
  if (related.length) log(`related ids (not substituted): ${related.join(', ')}`);
  log('note:          the catalog can report values that differ from what the endpoint enforces; listing is not proof of access or of structured-output support.');
  return ids.includes(BASETEN_PINNED_MODEL) ? 0 : 1;
}
