// C3-LIVE-01B-PREP: the ONLY place a future production proposal attempt builds its network-capable Meta provider. DORMANT: nothing but the
// production proposal runner (proposal-orchestrator.ts) imports this file, and that runner calls it only after read-only production
// authorization has passed. Both functions take NO arguments: the environment, the endpoint (allow-listed api.meta.ai), the model and
// the retry count are fixed here, so no caller can supply a provider, a transport function, a key or a base URL.
import { InferenceError } from './errors.ts';
import { createProvider, type StructuredRequest, type StructuredResponse } from './client.ts';
import { loadProviderConfig } from './config.ts';
import { META_PROPOSAL_MODEL } from './patch-proposal.ts';

/**
 * Credential-free view of the Meta configuration for the pure pre-flight and the authorization gate. `readApiKey: false` never touches
 * the key field of the environment.
 */
export function readMetaProposalDescriptor(): { id: 'meta'; models: { visual?: string }; billableCallsAllowed: boolean } {
  const config = loadProviderConfig('meta', process.env, { readApiKey: false });
  return { id: 'meta', models: { visual: config.models.visual }, billableCallsAllowed: config.billableCallsAllowed };
}

/**
 * Reads the credential and builds the provider. No request is made here; the returned function makes exactly the request it is handed.
 * Call only after authorization has passed. A missing or malformed key fails here, BEFORE the approval is consumed, so nothing is spent.
 */
export function openMetaProposalCall(): (req: StructuredRequest) => Promise<StructuredResponse> {
  const config = loadProviderConfig('meta', process.env);
  if (!config.apiKey) throw new InferenceError('CONFIG', 'meta', 'the Meta API key is not configured');
  if (config.models.visual !== META_PROPOSAL_MODEL) throw new InferenceError('CONFIG', 'meta', `the Meta proposal model must be exactly ${META_PROPOSAL_MODEL}`);
  if (!config.billableCallsAllowed) throw new InferenceError('BILLABLE_NOT_AUTHORIZED', 'meta', 'billable inference is not enabled');
  const provider = createProvider({ ...config, maxRetries: 0 });
  return (req) => provider.structuredResponse(req);
}
