/**
 * UI-C3-02-I4: MOCK-ONLY provider transport for the offline demo companion.
 *
 * This module never touches the network, environment, filesystem, or clock.
 * It returns canned fixture payloads so the full loopback demo (pairing,
 * permits, upload validation, request encoding, response sanitization) can
 * run with zero provider egress. Every response is labelled mock-fixture;
 * nothing here can authorize or perform a live Baseten request.
 */
export type MockKind = 'analyze' | 'propose';

export interface MockTransportRequest {
  readonly kind: MockKind;
  readonly runId: string;
  readonly sha256: string;
  readonly videoBytes: number;
}

export interface MockUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface MockTransportResponse {
  readonly ok: true;
  /** Fixed fixture model label. Never a live model identifier. */
  readonly mockModel: string;
  /** Free-form fixture text. Always treated as untrusted by the sanitizer. */
  readonly text: string;
  readonly usage: MockUsage;
  readonly latencyMs: number;
}

export interface MockTransport {
  readonly label: 'mock-fixture';
  readonly calls: ReadonlyArray<MockTransportRequest>;
  respond(request: MockTransportRequest): Promise<MockTransportResponse>;
}

export const MOCK_TRANSPORT_LABEL = 'mock-fixture' as const;
export const MOCK_MODEL_LABEL = 'mock-fixture-model (D9 pending: not a live model)' as const;

const ANALYZE_FIXTURE_TEXT = [
  'MOCK FIXTURE observation (not a provider response): the synthetic F01 clip',
  'shows a promotional overlay intercepting the mobile Add-to-cart control;',
  'the desktop control is unaffected. Uncertainty: moderate — fixture text is',
  'canned for the offline demo and proves nothing about any real recording.',
].join(' ');

const PROPOSE_FIXTURE_TEXT = JSON.stringify({
  adjustments: [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }],
});

function isValidRequest(request: MockTransportRequest): boolean {
  return (
    (request.kind === 'analyze' || request.kind === 'propose') &&
    typeof request.runId === 'string' &&
    request.runId.length > 0 &&
    /^[0-9a-f]{64}$/.test(request.sha256) &&
    Number.isSafeInteger(request.videoBytes) &&
    request.videoBytes > 0
  );
}

/**
 * Totally offline canned responder. Rejects malformed internal requests so a
 * corrupted companion state fails closed instead of rendering fixture text.
 */
export class MockCancelled extends Error {
  constructor() {
    super('mock run cancelled');
  }
}

export function createMockTransport(options?: {
  latencyMs?: number;
  analyzeText?: string;
  proposeText?: string;
  usage?: MockUsage;
  /** Polled during latency so cancellation takes effect promptly. */
  shouldCancel?: () => boolean;
}): MockTransport {
  const latencyMs = options?.latencyMs ?? 1200;
  const usage = options?.usage ?? { promptTokens: 410, completionTokens: 96, totalTokens: 506 };
  const shouldCancel = options?.shouldCancel;
  const log: MockTransportRequest[] = [];
  return {
    label: MOCK_TRANSPORT_LABEL,
    calls: log,
    async respond(request: MockTransportRequest): Promise<MockTransportResponse> {
      if (!isValidRequest(request)) {
        throw new Error('mock transport refused a malformed internal request');
      }
      log.push({ ...request });
      let waited = 0;
      while (waited < latencyMs) {
        if (shouldCancel?.()) throw new MockCancelled();
        const slice = Math.min(50, latencyMs - waited);
        await new Promise((r) => setTimeout(r, slice));
        waited += slice;
      }
      if (shouldCancel?.()) throw new MockCancelled();
      const text = request.kind === 'analyze'
        ? (options?.analyzeText ?? ANALYZE_FIXTURE_TEXT)
        : (options?.proposeText ?? PROPOSE_FIXTURE_TEXT);
      return { ok: true, mockModel: MOCK_MODEL_LABEL, text, usage: { ...usage }, latencyMs };
    },
  };
}
