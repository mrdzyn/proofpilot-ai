/**
 * UI-C3-02-BT-LIVE-01: Zone L run provenance helper (pure, no DOM).
 *
 * Distinguishes mock results from live Baseten results for display. Mock
 * result shapes are unchanged; live results carry `transport:
 * 'baseten-live'` with `provider: 'baseten'`, the exact echoed model id,
 * and `liveInference: true`. `UNVERIFIED` is a status label for live
 * output, never a verdict. Unit-tested with fixtures (mock + synthetic
 * live); the live branch renders only for runs an owner-started `--live`
 * companion produced.
 */
export interface RunProvenance {
  readonly isLive: boolean;
  readonly provider: string;
  readonly model: string;
  readonly transport: string;
  readonly usageNote: string;
  readonly verdictChip: string;
  readonly proposalChip: string;
  readonly resultHead: string;
}

const MOCK_MODEL_TEXT = 'mock-fixture-model (not a live model)';

export function describeRunProvenance(result: Record<string, unknown>): RunProvenance {
  if (result['transport'] === 'baseten-live') {
    const model = typeof result['model'] === 'string' && result['model'].length > 0
      ? (result['model'] as string)
      : 'unknown live model';
    return {
      isLive: true,
      provider: 'baseten',
      model,
      transport: 'baseten-live',
      usageNote: 'reported, not billing',
      verdictChip: 'LIVE VIA BASETEN — UNVERIFIED MODEL OUTPUT',
      proposalChip: 'UNTRUSTED PROPOSAL — NOT VERIFIED (BASETEN)',
      resultHead: 'Live Baseten result — quoted text (unverified)',
    };
  }
  return {
    isLive: false,
    provider: 'mock',
    model: MOCK_MODEL_TEXT,
    transport: 'mock-fixture',
    usageNote: 'fixture counts, not billing',
    verdictChip: 'MOCK FIXTURE — NOT A PROVIDER RESPONSE',
    proposalChip: 'UNTRUSTED PROPOSAL — NOT VERIFIED (MOCK)',
    resultHead: 'Mock analyze result — quoted fixture text',
  };
}
