// Per-run, per-video consent to transmit a recording to Meta for AI analysis.
// Consent is bound to the run, the provider and the exact video bytes (SHA-256),
// so it cannot be reused for another clip or run.
import { ConsentError } from './errors.ts';

export const CONSENT_SCOPE = 'meta-video-analysis' as const;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export type VideoConsent = {
  granted: true;
  scope: typeof CONSENT_SCOPE;
  provider: 'meta';
  runId: string;
  videoSha256: string;
  grantedAt: string;
  attestations: {
    /** The recording is owned by the user or synthetic. */
    ownedOrSynthetic: true;
    /** It contains no real customer, payment or credential data. */
    noCustomerOrPaymentData: true;
  };
};

export function isValidRunId(runId: unknown): runId is string {
  return typeof runId === 'string' && RUN_ID.test(runId);
}

/** Build the consent record from an explicit user opt-in. Never call this on the user's behalf. */
export function createVideoConsent(input: { runId: string; videoSha256: string; now?: () => Date }): VideoConsent {
  if (!isValidRunId(input.runId)) throw new ConsentError('CONSENT_INVALID', 'runId is malformed');
  if (!SHA256.test(input.videoSha256)) throw new ConsentError('CONSENT_INVALID', 'videoSha256 is malformed');
  return {
    granted: true,
    scope: CONSENT_SCOPE,
    provider: 'meta',
    runId: input.runId,
    videoSha256: input.videoSha256,
    grantedAt: (input.now?.() ?? new Date()).toISOString(),
    attestations: { ownedOrSynthetic: true, noCustomerOrPaymentData: true },
  };
}

/**
 * Throws unless `consent` is an explicit, well-formed grant for exactly this run,
 * provider and video. Missing, partial or mismatched consent is a hard stop.
 */
export function assertVideoConsent(
  consent: unknown,
  expected: { runId: string; providerId: string; videoSha256: string },
): asserts consent is VideoConsent {
  if (consent === undefined || consent === null) {
    throw new ConsentError('CONSENT_MISSING', 'explicit consent to transmit this video to Meta was not provided');
  }
  const c = consent as Record<string, any>;
  const att = c?.attestations as Record<string, unknown> | undefined;
  const wellFormed =
    typeof consent === 'object' &&
    c.granted === true &&
    c.scope === CONSENT_SCOPE &&
    c.provider === 'meta' &&
    isValidRunId(c.runId) &&
    typeof c.videoSha256 === 'string' &&
    SHA256.test(c.videoSha256) &&
    typeof c.grantedAt === 'string' &&
    !Number.isNaN(Date.parse(c.grantedAt)) &&
    att?.ownedOrSynthetic === true &&
    att?.noCustomerOrPaymentData === true;
  if (!wellFormed) throw new ConsentError('CONSENT_INVALID', 'consent record is malformed or incomplete');
  if (expected.providerId !== 'meta') {
    throw new ConsentError('CONSENT_MISMATCH', `consent covers provider meta, not ${expected.providerId}`);
  }
  if (c.runId !== expected.runId) throw new ConsentError('CONSENT_MISMATCH', 'consent was granted for a different run');
  if (c.videoSha256 !== expected.videoSha256) {
    throw new ConsentError('CONSENT_MISMATCH', 'consent was granted for a different video');
  }
}
