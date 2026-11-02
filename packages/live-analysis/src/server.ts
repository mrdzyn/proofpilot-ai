/**
 * UI-C3-02-I2/I4: offline localhost companion (mock transport only).
 *
 * Binds 127.0.0.1 only. Serves the dashboard document and the live API
 * same-origin. Every state-bearing endpoint requires Host validation plus a
 * locally validated session; mutating POSTs additionally require an exact
 * same-origin Origin. Pairing codes come only from the owner terminal
 * (`pair` command); permits come only from the owner terminal (`permit`
 * command). Without `--live`, analyze/propose run through the MOCK transport
 * and strict sanitizers, and no live request can be assembled. With `--live`
 * and the D9 pin, the approved model may pass the live gate below.
 *
 * No environment reads, no credentials, no network egress, no persistence of
 * raw video/base64/model text. Staged uploads are always deleted.
 */
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { validateBasetenBaseUrl, validateLiveModel } from './config.ts';
import { checkCompanionRequest, type LiveApiEndpoint } from './request-guard.ts';
import { LocalSessionManager } from './local-session.ts';
import { OfflineMockPermitLedger, type MockPermitKind } from './mock-permits.ts';
import { createMockTransport, MockCancelled, MOCK_MODEL_LABEL, type MockTransport } from './mock-transport.ts';
import { encodeVideoPart } from './baseten-request.ts';
import {
  sanitizeAnalysisResponse,
  sanitizeLiveAnalysisResponse,
  sanitizeLiveProposalResponse,
  sanitizeProposalResponse,
  type LiveSanitizeResult,
  type SanitizeResult,
  type SanitizedUsage,
} from './responses.ts';
import {
  BasetenCancelled,
  BasetenTimeout,
  LiveTransportRefused,
  type BasetenTransport,
} from './baseten-transport.ts';
import { createLiveAttemptLedger, createLiveSendSpender } from './live-attempts.ts';
import {
  LiveSpendRecordError,
  STANDING_APPROVAL_ID_RE,
  openSpentRecord,
  remainingLiveBudget,
  type LiveSpentRecord,
} from './live-spent-record.ts';
import { MAX_STAGED_BYTES, StagedUploads } from './uploads.ts';
import type { ValidatedVideo } from '../../intake/src/media.ts';

export const COMPANION_VERSION = '0.1-i2i4-mock';
export const DEFAULT_PORT = 5188;

export type StartupRefusal =
  | 'ENDPOINT_UNAPPROVED'
  | 'ADDRESS_IN_USE'
  | 'LIVE_BUDGET_REQUIRES_RECORD'
  | 'LIVE_MEDIA_PIN_INVALID'
  | 'LIVE_SPEND_RECORD_FAILED'
  | 'LIVE_SPEND_RECORD_MISSING'
  | 'LIVE_RECORD_LOCKED'
  | 'LIVE_SPEND_RECORD_CORRUPT'
  | 'LIVE_RECORD_UNSAFE'
  | 'LIVE_SPEND_RECORD_ROLLBACK'
  | 'LIVE_APPROVAL_MISMATCH';

/**
 * Live-attempt precheck decision table (unit-tested): D9 approval first,
 * then spend-record health, then remaining budget. The server maps codes to
 * refusal details; the transport enforces the final send-boundary gate.
 */
export type LivePrecheckResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; code: 'MODEL_UNAVAILABLE_OR_UNAPPROVED' | 'LIVE_SPEND_RECORD_FAILED' | 'QUOTA_SPENT' }>;

export function checkLivePrecheck(input: {
  readonly d9Approved: boolean;
  readonly poisoned: boolean;
  readonly attemptsLeft: number;
}): LivePrecheckResult {
  if (!input.d9Approved) return { ok: false, code: 'MODEL_UNAVAILABLE_OR_UNAPPROVED' };
  if (input.poisoned) return { ok: false, code: 'LIVE_SPEND_RECORD_FAILED' };
  if (!(input.attemptsLeft > 0)) return { ok: false, code: 'QUOTA_SPENT' };
  return { ok: true };
}

/**
 * Activation-state wording for `/api/status` (unit-tested): the reported
 * D9/live state is derived from the actual validated gate, never hardcoded.
 * Unapproved companions describe the block; an approved live companion
 * reports it instead of claiming live is disabled.
 */
export interface ActivationStateWords {
  readonly transport: string;
  readonly liveTransport: string;
  readonly d9: string;
  readonly modelOk: boolean;
}

export function describeActivationState(input: {
  readonly liveConfigured: boolean;
  readonly d9Approved: boolean;
}): ActivationStateWords {
  if (!input.liveConfigured) {
    return {
      transport: 'mock-fixture (no live inference; D9 pending)',
      liveTransport: 'none',
      d9: 'pending (blocks any live call)',
      modelOk: false,
    };
  }
  if (!input.d9Approved) {
    return {
      transport: 'mock-fixture + baseten-live (D9-gated; no live call without owner approval)',
      liveTransport: 'baseten-live (D9-gated)',
      d9: 'pending (blocks any live call)',
      modelOk: false,
    };
  }
  return {
    transport: 'mock-fixture + baseten-live (owner-approved)',
    liveTransport: 'baseten-live (owner-approved)',
    d9: 'approved',
    modelOk: true,
  };
}

export interface CompanionOptions {
  /** Listener port. Ignored when `bind` is false (dispatch-only use). */
  port?: number;
  /** Bind 127.0.0.1. Set false for socket-free unit testing via `dispatch`. */
  bind?: boolean;
  /** Dashboard dist directory to serve same-origin; null = API only. */
  serveRoot?: string | null;
  baseUrl?: string;
  session?: LocalSessionManager;
  permits?: OfflineMockPermitLedger;
  uploads?: StagedUploads;
  transport?: MockTransport;
  /** Latency for the built-in cancelling mock transport; ignored when `transport` is supplied. */
  transportLatencyMs?: number;
  /**
   * Owner-gated Baseten live seam (supplied only by the owner-started `--live`
   * CLI after its own gates). When present, the D9 gate must approve
   * `liveModel` or the attempt refuses before any slot, permit, or quota is
   * touched.
   */
  liveTransport?: BasetenTransport | null;
  /** Exact model ID the live transport claims; checked against the D9 approval. */
  liveModel?: string;
  /**
   * Live attempt budget, separate from the mock success quota. Each approval
   * authorizes one provider attempt per action, spent at send and never
   * restored. Defaults to zero (fail-closed); explicit owner allocation is
   * required alongside D9.
   *
   * A nonzero live budget additionally requires `liveSpentRecordPath`: the
   * durable spent-run record that survives restarts. Startup refuses without
   * it (`LIVE_BUDGET_REQUIRES_RECORD`).
   */
  liveAnalysesLeft?: number;
  liveProposalsLeft?: number;
  /**
   * Path to the durable spent-run record (hash-chained JSONL, created mode
   * 0600 when missing). Required when any live budget is configured; a
   * corrupt record refuses startup. Never a credential, body, or secret —
   * run id, media SHA-256, kind, and timestamp only.
   */
  liveSpentRecordPath?: string;
  /**
   * Optional pinned demonstration-media SHA-256 for the live path. When set
   * (must be 64 lowercase hex), live attempts whose declared media differs
   * refuse with MEDIA_NOT_PINNED before any slot, permit, or quota is
   * touched. The mock path ignores it.
   */
  liveMediaSha256?: string;
  /**
   * Fresh owner bootstrap approval id for initializing a missing or empty
   * spent-run record (format-checked). Required exactly then; a missing or
   * empty record without one refuses startup instead of auto-creating, so
   * deletion or truncation can never silently re-arm the budget. Ignored
   * once the record is already initialized.
   */
  liveBootstrapApprovalId?: string;
  analysesLeft?: number;
  proposalsLeft?: number;
  runTimeoutMs?: number;
  now?: () => number;
}

/** Socket-free request metadata for the dispatch seam (unit tests use this). */
export interface ApiMeta {
  readonly method: string;
  readonly path: string;
  readonly host?: string | null;
  readonly origin?: string | null;
  readonly fetchSite?: string | null;
  readonly contentType?: string | null;
  readonly sessionToken?: string | null;
  /** Raw upload declaration (mirrors the x-live-sha256/x-live-bytes/x-live-action headers). */
  readonly declaredSha256?: string | null;
  readonly declaredBytes?: string | null;
  readonly declaredKind?: string | null;
}

export interface ApiResult {
  readonly status: number;
  readonly body: unknown;
}

export interface Companion {
  readonly port: number;
  readonly serveRoot: string | null;
  readonly sessions: LocalSessionManager;
  readonly permits: OfflineMockPermitLedger;
  readonly uploads: StagedUploads;
  /** Socket-free dispatch: same boundary as HTTP, without a listener. */
  dispatch(meta: ApiMeta, body: Uint8Array): Promise<ApiResult>;
  close(): Promise<void>;
  /** Terminal-only: register a single-use hash-bound mock permit. */
  terminalPermit(kind: MockPermitKind, sha256: string, bytes: number):
    | { ok: true; key: string }
    | { ok: false; code: string };
  /** Terminal-only: revoke sessions, permits, staged bytes; cancel in-flight runs. */
  terminalRevoke(): void;
}

type RunState = 'analyzing' | 'done' | 'refused' | 'cancelled';

interface RunRecord {
  runId: string;
  kind: MockPermitKind;
  sha256: string;
  state: RunState;
  createdAt: number;
  finishedAt: number | null;
  cancelled: boolean;
  result: unknown;
  /** Companion epoch that owned the slot when this run started (revoke bumps it). */
  epoch: number;
  /** Staging identity consumed by this run (null: staging already consumed at accept). */
  stagedUploadId: string | null;
}

function jsonResponse(status: number, body: unknown): ApiResult {
  return { status, body };
}

function refusal(code: string, detail: string, status: number): ApiResult {
  return { status, body: { ok: false, code, detail } };
}

const STATIC_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/** Pure path resolution: null when the request escapes the served root. */
export function resolveStaticPath(serveRoot: string, target: string): string | null {
  const raw = target.split('?')[0] ?? '/';
  if (raw.includes('%') || raw.includes('\\')) return null;
  const rel = raw === '/' ? '/index.html' : raw;
  const resolved = path.normalize(path.join(serveRoot, rel));
  if (resolved !== serveRoot && !resolved.startsWith(`${serveRoot}${path.sep}`)) return null;
  return resolved;
}

export async function createCompanion(options: CompanionOptions = {}): Promise<Companion> {
  const port = options.port ?? DEFAULT_PORT;
  const baseCheck = validateBasetenBaseUrl(options.baseUrl ?? 'https://inference.baseten.co/v1');
  if (!baseCheck.ok) {
    throw Object.assign(new Error(`companion refuses to start: ${baseCheck.code}`), { code: 'ENDPOINT_UNAPPROVED' satisfies StartupRefusal });
  }
  const sessions = options.session ?? new LocalSessionManager();
  const permits = options.permits ?? new OfflineMockPermitLedger();
  const uploads = options.uploads ?? (await StagedUploads.create());
  const now = options.now ?? Date.now;
  const runs = new Map<string, RunRecord>();
  // Cancellation is per-run: each analyzing run gets its own mock transport
  // whose shouldCancel observes only that run's cancelled flag. A stale
  // cancelled run therefore can never cancel a newer epoch's run (the old
  // global "any run cancelled" predicate is gone). A caller-supplied
  // transport (tests) owns its own policy.
  const customTransport = options.transport ?? null;
  const defaultLatencyMs = options.transportLatencyMs ?? 1200;
  // Live seam: constructed only by the owner-started `--live` CLI after its
  // own gates. D9 approval (`validateLiveModel`) is checked per attempt
  // below; anything but the pinned model still refuses.
  const liveTransport = options.liveTransport ?? null;
  const liveModel = options.liveModel;
  // Optional pinned demonstration media for the live path; malformed pins
  // refuse startup rather than silently never matching.
  const liveMediaSha256 = options.liveMediaSha256;
  if (liveMediaSha256 !== undefined && !/^[0-9a-f]{64}$/.test(liveMediaSha256)) {
    throw Object.assign(new Error('companion refuses to start: live media pin is not a 64-hex SHA-256'), { code: 'LIVE_MEDIA_PIN_INVALID' satisfies StartupRefusal });
  }
  // A nonzero live budget without a durable spent-run record would re-arm on
  // restart (the in-memory ledger resets), so startup refuses it outright.
  const liveBudgetRequested = (typeof options.liveAnalysesLeft === 'number' ? options.liveAnalysesLeft : 0) +
    (typeof options.liveProposalsLeft === 'number' ? options.liveProposalsLeft : 0);
  if (liveTransport !== null && liveBudgetRequested > 0 &&
    (options.liveSpentRecordPath === undefined || options.liveSpentRecordPath === '')) {
    throw Object.assign(new Error('companion refuses to start: live budget requires a spent-record path'), { code: 'LIVE_BUDGET_REQUIRES_RECORD' satisfies StartupRefusal });
  }
  // MAJOR-1 (issue #39 audit): EVERY positive live-analysis budget — finite
  // N or unlimited — runs only under an explicit versioned standing approval
  // identity. The owner must supply a `d9live-v2-` bootstrap id; omission
  // never implicitly adopts any existing ledger (historical or standing),
  // and a non-versioned id never authorizes. This check runs before the
  // record opens, so a refusal creates no genesis and spends nothing.
  // Zero-budget diagnostics stay untouched: no identity is required to
  // start unarmed.
  const liveAnalysesRequested = typeof options.liveAnalysesLeft === 'number' ? options.liveAnalysesLeft : 0;
  if (liveTransport !== null && liveAnalysesRequested > 0 &&
    (options.liveBootstrapApprovalId === undefined || !STANDING_APPROVAL_ID_RE.test(options.liveBootstrapApprovalId))) {
    throw Object.assign(new Error('companion refuses to start: a positive live-analysis budget requires the explicit versioned standing approval identity (LIVE_APPROVAL_MISMATCH)'), {
      code: 'LIVE_APPROVAL_MISMATCH' satisfies StartupRefusal,
    });
  }
  // Durable spent-run record with exclusive ownership: missing or empty
  // records initialize only with an explicit bootstrap approval; corrupt,
  // unsafe, rolled-back, or contended state refuses startup (fail closed,
  // never re-arm, never share authorization across processes). A supplied
  // bootstrap id is bound against the record's genesis: a foreign genesis
  // (for example a historical one-shot record presented to a new session)
  // never authorizes, so records and geneses cannot be repurposed.
  let spentRecord: LiveSpentRecord | null = null;
  if (liveTransport !== null && options.liveSpentRecordPath !== undefined && options.liveSpentRecordPath !== '') {
    try {
      spentRecord = openSpentRecord(options.liveSpentRecordPath, {
        bootstrapApprovalId: options.liveBootstrapApprovalId,
      });
    } catch (error) {
      if (error instanceof LiveSpendRecordError) {
        throw Object.assign(new Error(`companion refuses to start: ${error.code}`), {
          code: error.code satisfies StartupRefusal,
        });
      }
      throw error;
    }
    if (options.liveBootstrapApprovalId !== undefined &&
      spentRecord.approvalId() !== options.liveBootstrapApprovalId) {
      try { spentRecord.release(); } catch { /* best-effort lock release */ }
      throw Object.assign(new Error('companion refuses to start: supplied approval does not match the record genesis (LIVE_APPROVAL_MISMATCH)'), {
        code: 'LIVE_APPROVAL_MISMATCH' satisfies StartupRefusal,
      });
    }
    // The pre-open identity check guarantees the supplied id carries the
    // versioned namespace; the binding check just above guarantees the
    // record's genesis is exactly that identity. Together they mean a
    // historical one-shot genesis (no namespace, foreign id) can never
    // back a new session — finite or unlimited — even when its spent count
    // would otherwise allow sends.
  }
  // Live provider-attempt budget, separate from the mock success quota, minus
  // durable recorded spend. Spent exactly once per send via the transport's
  // onSend hook (which also appends the record); failures after send never
  // restore, and sanitized success never spends again.
  const liveAttempts = createLiveAttemptLedger({
    analyses: remainingLiveBudget(options.liveAnalysesLeft ?? 0, spentRecord?.countSpent('analyze') ?? 0),
    proposals: remainingLiveBudget(options.liveProposalsLeft ?? 0, spentRecord?.countSpent('propose') ?? 0),
  });
  // A failed durable record append poisons the live path for the rest of the
  // process: an unrecorded send must never be followed by another send.
  let livePoisoned = false;
  let analysesLeft = options.analysesLeft ?? 3;
  let proposalsLeft = options.proposalsLeft ?? 1;
  const runTimeoutMs = options.runTimeoutMs ?? 120_000;
  const serveRoot = options.serveRoot ?? null;
  const pendingByKey = new Map<string, string>();
  const inflight = new Set<Promise<void>>();
  let verified: ValidatedVideo | null = null;
  let stagedUploadId: string | null = null;
  // Epoch that owns the currently staged bytes (null when nothing staged).
  // Cleanup (revoke, stale settle, refused analyze) only touches staging and
  // the verified fields when they still belong to its own epoch.
  let stagedEpoch: number | null = null;

  function clearStagedFieldsIfOwned(ownerEpoch: number): void {
    if (stagedEpoch === ownerEpoch) {
      verified = null;
      stagedUploadId = null;
      stagedEpoch = null;
    }
  }

  async function discardStagingIfOwned(ownerEpoch: number, ownerUploadId: string | null): Promise<void> {
    if (stagedEpoch !== ownerEpoch) return;
    if (ownerUploadId === null || stagedUploadId !== ownerUploadId) return;
    if (uploads.currentUploadId() !== ownerUploadId) {
      // Uploads layer already moved on; drop only our cached fields.
      clearStagedFieldsIfOwned(ownerEpoch);
      return;
    }
    await uploads.discardIfStaged(ownerUploadId);
    clearStagedFieldsIfOwned(ownerEpoch);
  }
  let permitCounter = 0;
  let runCounter = 0;
  // Single-flight slot for upload/analyze/propose, acquired synchronously
  // before the first await. `epoch` is bumped by terminalRevoke so a stale
  // settling run can never release a newer run's slot.
  let flight: { epoch: number } | null = null;
  let epoch = 0;

  function releaseFlight(runEpoch: number): void {
    if (flight !== null && flight.epoch === runEpoch) flight = null;
  }

  const keyOf = (sha256: string, bytes: number, kind: MockPermitKind): string =>
    `${kind}:${sha256}:${bytes}`;

  function terminalPermit(kind: MockPermitKind, sha256: string, bytes: number):
    | { ok: true; key: string }
    | { ok: false; code: string } {
    if ((kind !== 'analyze' && kind !== 'propose') || !/^[0-9a-f]{64}$/.test(sha256) ||
      !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 30_000_000) {
      return { ok: false, code: 'INVALID_IDENTITY' };
    }
    permitCounter += 1;
    const ledgerId = `term-${permitCounter}`;
    const issued = permits.issueTerminalMockPermit({ runId: ledgerId, sha256, bytes, kind });
    if (!issued.ok) return { ok: false, code: issued.code };
    pendingByKey.set(keyOf(sha256, bytes, kind), ledgerId);
    return { ok: true, key: keyOf(sha256, bytes, kind) };
  }

  function terminalRevoke(): void {
    sessions.revokeAll();
    permits.revokePending();
    pendingByKey.clear();
    // Bump the epoch and free the slot: stale in-flight runs settle as
    // CANCELLED but can never release a newer run's slot, touch newer staged
    // bytes, or clear newer verified fields (see settleRun + discard guards).
    // The doomed staging identity is captured synchronously so the async
    // delete can never touch bytes staged by a newer epoch afterwards.
    // Retire outstanding staging tickets first: a suspended upload resumes
    // stale even when the async delete below has not run yet.
    uploads.invalidateStaged();
    const doomedUploadId = stagedUploadId;
    const doomedEpoch = stagedEpoch;
    epoch += 1;
    flight = null;
    verified = null;
    stagedUploadId = null;
    stagedEpoch = null;
    for (const run of runs.values()) {
      if (run.state === 'analyzing') {
        run.cancelled = true;
      }
    }
    if (doomedUploadId !== null && doomedEpoch !== null) {
      void uploads.discardIfStaged(doomedUploadId);
    } else {
      void uploads.discardIfStaged(null);
    }
  }

  function publicStatus(authenticated: boolean): Record<string, unknown> {
    const words = describeActivationState({
      liveConfigured: liveTransport !== null,
      d9Approved: liveTransport !== null && validateLiveModel(liveModel).ok,
    });
    return {
      service: 'ui-c3-02-companion',
      version: COMPANION_VERSION,
      transport: words.transport,
      paired: authenticated,
      config: { urlOk: true, modelOk: words.modelOk, d9: words.d9 },
      // Mock success quota: spent only by sanitized mock success, never by
      // live attempts (live requests do not consult it; see handleAnalyzePropose).
      quota: { analysesLeft, proposalsLeft },
      // Live provider-attempt budget: effective allocation minus durable
      // recorded spend. Reported counts only — never a billing figure.
      // `unlimited` marks the repeatable standing-policy opt-in (Infinity
      // serializes as null, so the flag carries the meaning instead);
      // `spent` is the durable per-action spend for run/attempt counters.
      live: {
        transport: words.liveTransport,
        armed: liveTransport !== null,
        d9: words.d9,
        modelOk: words.modelOk,
        unlimited: options.liveAnalysesLeft === Number.POSITIVE_INFINITY,
        attemptsLeft: { analyze: liveAttempts.left('analyze'), propose: liveAttempts.left('propose') },
        spent: {
          analyze: spentRecord?.countSpent('analyze') ?? 0,
          propose: spentRecord?.countSpent('propose') ?? 0,
        },
        spentRecord: options.liveSpentRecordPath !== undefined && options.liveSpentRecordPath !== '' ? 'configured' : 'none',
        mediaPin: liveMediaSha256 !== undefined,
        poisoned: livePoisoned,
      },
      busy: flight !== null,
    };
  }

  /**
   * Permit-before-upload: the request declares the exact (sha256, bytes,
   * action) the owner permitted in the terminal. Without a live eligible
   * permit nothing is staged and no trusted-boundary decode work happens.
   * Permit eligibility is checked synchronously before the single-flight
   * slot is acquired, so unpermitted attempts do zero work and never take
   * the slot; the slot itself is acquired synchronously before the first
   * await so two concurrent uploads (or an upload racing an analyze) can
   * never interleave staging/verification on the shared slot.
   */
  async function handleUpload(
    body: Uint8Array,
    declared: { sha256: string | null | undefined; bytes: string | null | undefined; kind: string | null | undefined },
  ): Promise<ApiResult> {
    if (flight !== null) {
      return refusal('RUN_BUSY', 'another live run is in flight; wait or cancel it first', 409);
    }
    const kind = declared.kind;
    const sha = declared.sha256;
    const bytesRaw = declared.bytes;
    if ((kind !== 'analyze' && kind !== 'propose') || typeof sha !== 'string' || !/^[0-9a-f]{64}$/.test(sha) ||
      typeof bytesRaw !== 'string' || !/^[0-9]{1,10}$/.test(bytesRaw)) {
      return refusal('BAD_PAYLOAD', 'upload must declare sha256, bytes and action', 400);
    }
    const declaredBytes = Number.parseInt(bytesRaw, 10);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes <= 0 || declaredBytes > MAX_STAGED_BYTES) {
      return refusal('BAD_PAYLOAD', 'upload must declare sha256, bytes and action', 400);
    }
    const ledgerId = pendingByKey.get(keyOf(sha, declaredBytes, kind));
    if (ledgerId === undefined) {
      return refusal('NO_PERMIT', 'no terminal permit names this file and action; ask the owner to permit it first', 403);
    }
    const eligible = permits.peekEligiblePermit({ runId: ledgerId, sha256: sha, bytes: declaredBytes, kind });
    if (!eligible.ok) {
      return refusal(eligible.code, 'the terminal permit for this file and action is not usable', 403);
    }
    // Synchronous acquisition: no await precedes it, so a concurrent upload
    // or analyze observes the busy slot. The staging ticket is captured in
    // the same critical section: a revoke retires it, so a suspended stage
    // resumes stale and can neither delete nor replace newer bytes.
    flight = { epoch };
    const myEpoch = epoch;
    const ticket = uploads.createStageTicket();
    try {
      const staged = await uploads.stage(body, ticket);
      if (!staged.ok) {
        if (staged.code === 'STALE_OWNER') {
          return refusal('CANCELLED', 'upload revoked before staging completed', 409);
        }
        return refusal(staged.code, staged.detail, 422);
      }
      if (myEpoch !== epoch) {
        await uploads.discardIfStaged(staged.uploadId);
        return refusal('CANCELLED', 'upload revoked before validation completed', 409);
      }
      const checked = await uploads.verify(staged.uploadId);
      if (!checked.ok) {
        // Verify already removed only its own staging identity; drop cached
        // fields only when they still belong to this upload's epoch.
        clearStagedFieldsIfOwned(myEpoch);
        return refusal(checked.code, checked.detail, 422);
      }
      if (myEpoch !== epoch) {
        await uploads.discardIfStaged(staged.uploadId);
        return refusal('CANCELLED', 'upload revoked before validation completed', 409);
      }
      if (checked.video.sha256 !== sha || checked.video.bytes !== declaredBytes) {
        await uploads.discardIfStaged(staged.uploadId);
        clearStagedFieldsIfOwned(myEpoch);
        return refusal('MEDIA_CHANGED', 'staged bytes differ from the declared upload', 422);
      }
      verified = checked.video;
      stagedUploadId = staged.uploadId;
      stagedEpoch = myEpoch;
      const out = jsonResponse(200, {
        ok: true,
        uploadId: staged.uploadId,
        sha256: verified.sha256,
        bytes: verified.bytes,
        durationSec: verified.durationSec,
        width: verified.width,
        height: verified.height,
        codec: verified.videoCodec,
      });
      return out;
    } finally {
      releaseFlight(myEpoch);
    }
  }

  function quotaFor(kind: MockPermitKind): number {
    return kind === 'analyze' ? analysesLeft : proposalsLeft;
  }

  function spendQuota(kind: MockPermitKind): void {
    if (kind === 'analyze') analysesLeft = Math.max(0, analysesLeft - 1);
    else proposalsLeft = Math.max(0, proposalsLeft - 1);
  }

  /**
   * Transport-native reply accepted by the settler: the mock `{mockModel,
   * ...}` envelope or the normalized live `{model, ...}` reply. Both carry
   * sanitized-later text and safe-int usage; the live variant additionally
   * carries the validated finish reason.
   */
  type SettleReply =
    | { mockModel: string; text: string; usage: SanitizedUsage }
    | { model: string; text: string; usage: SanitizedUsage; finishReason: string };

  /**
   * Settle wiring: which sanitizer validates the reply, which identity the
   * success record carries, which provenance refused/unexpected records
   * carry, and whether a sanitized success spends the mock quota. The mock
   * wiring is byte-identical to the historical behavior; the live wiring is
   * used only when D9 approves the model (dormant in this slice). Live
   * attempts are spent separately at the send boundary, never here.
   */
  interface SettleWiring {
    readonly sanitize: (raw: SettleReply) => SanitizeResult | LiveSanitizeResult;
    readonly identity: Record<string, unknown>;
    readonly refusedBase: Record<string, unknown>;
    readonly spendMockQuota: boolean;
    readonly unexpectedRefusal: { code: string; detail: string };
  }

  const mockWiring = (kind: MockPermitKind): SettleWiring => ({
    sanitize: kind === 'analyze' ? sanitizeAnalysisResponse : sanitizeProposalResponse,
    identity: { mockModel: MOCK_MODEL_LABEL },
    refusedBase: { transport: 'mock-fixture', liveInference: false },
    spendMockQuota: true,
    unexpectedRefusal: { code: 'TRANSPORT_REFUSED', detail: 'mock transport refused the internal request' },
  });

  /**
   * Settle a background run: race the transport against the ceiling, record
   * done/refused/cancelled/timeout on the run record, spend quota only on a
   * sanitized success, and release the single-flight slot only when it still
   * belongs to this run's epoch. Transport refusals (typed live errors)
   * settle `refused` with their code and never spend quota.
   */
  async function settleRun(
    run: RunRecord,
    kind: MockPermitKind,
    responsePromise: Promise<SettleReply>,
    wiring: SettleWiring,
  ): Promise<void> {
    const deadline = now() + runTimeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('run exceeded its total time ceiling')), Math.max(0, deadline - now()));
    });
    try {
      const response = await Promise.race([responsePromise, timeout]);
      if (run.cancelled) {
        run.state = 'cancelled';
        run.finishedAt = now();
        run.result = { ok: false as const, code: 'CANCELLED', detail: 'run cancelled before the response landed' };
        // Epoch-scoped: a stale run must never delete a newer epoch's staging.
        await discardStagingIfOwned(run.epoch, run.stagedUploadId ?? null);
        return;
      }
      const sanitized = wiring.sanitize(response);
      if (!sanitized.ok) {
        run.state = 'refused';
        run.finishedAt = now();
        run.result = {
          ok: false, code: sanitized.code, detail: sanitized.detail, ...wiring.refusedBase,
        };
        return;
      }
      // The mock quota is spent only on sanitized mock success. Live
      // attempts are spent separately at the send boundary (never restored,
      // never double-spent here).
      if (wiring.spendMockQuota) spendQuota(kind);
      run.state = 'done';
      run.finishedAt = now();
      run.result = { ok: true, ...sanitized.value, runId: run.runId, sha256: run.sha256, ...wiring.identity };
    } catch (error) {
      if (error instanceof LiveTransportRefused) {
        run.state = 'refused';
        run.finishedAt = now();
        // TRUNCATED usage diagnostics ride the refused record as numbers
        // only (provider-claimed, never billing); anything else refuses
        // without usage.
        run.result = error.usage === undefined
          ? {
            ok: false, code: error.code, detail: error.message,
            transport: 'baseten-live', liveInference: true, provider: 'baseten',
          }
          : {
            ok: false, code: error.code, detail: error.message,
            transport: 'baseten-live', liveInference: true, provider: 'baseten',
            usage: { ...error.usage },
          };
        return;
      }
      run.state = 'cancelled';
      run.finishedAt = now();
      const message = error instanceof Error ? error.message : '';
      const timedOut = message.includes('ceiling') || error instanceof BasetenTimeout;
      const cancelled = error instanceof MockCancelled || error instanceof BasetenCancelled || message.includes('cancelled');
      run.result = (cancelled || timedOut)
        ? { ok: false, code: timedOut ? 'TIMEOUT' : 'CANCELLED', detail: 'run cancelled or timed out; staged bytes already deleted' }
        : { ok: false, ...wiring.unexpectedRefusal };
      // Epoch-scoped: a stale run must never delete a newer epoch's staging.
      await discardStagingIfOwned(run.epoch, run.stagedUploadId ?? null);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      releaseFlight(run.epoch);
    }
  }

  /**
   * Register an accepted run: id issuance, map insertion, and size pruning.
   * Shared by the mock and live branches so both carry identical run identity.
   */
  function registerRun(kind: MockPermitKind, sha256: string, ownerEpoch: number): RunRecord {
    runCounter += 1;
    const runId = `local-${new Date(now()).toISOString().slice(0, 10)}-${String(runCounter).padStart(3, '0')}`;
    // Pinned to the attempt's original epoch (never the current global):
    // settle may only release or clean up this epoch's slot and staging.
    const run: RunRecord = {
      runId, kind, sha256, state: 'analyzing', createdAt: now(), finishedAt: null,
      cancelled: false, result: null, epoch: ownerEpoch, stagedUploadId: null,
    };
    runs.set(runId, run);
    if (runs.size > 20) {
      const oldest = [...runs.values()].filter((r) => r.state !== 'analyzing').sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0))[0];
      if (oldest !== undefined) runs.delete(oldest.runId);
    }
    return run;
  }

  /**
   * Accept a run promptly: every check that can refuse (quota, single-flight,
   * staged identity, permit consumption, read, encode) happens synchronously
   * up to the first await, and the runId is returned while the mock transport
   * still runs in the background — so Cancel can reach the in-flight run.
   */
  async function handleAnalyzePropose(kind: MockPermitKind, payload: unknown): Promise<ApiResult> {
    if (typeof payload !== 'object' || payload === null) {
      return refusal('BAD_PAYLOAD', 'request body must be a JSON object', 400);
    }
    const fields = payload as Record<string, unknown>;
    const { uploadId, sha256, bytes } = fields;
    if (typeof uploadId !== 'string' || typeof sha256 !== 'string' || !Number.isSafeInteger(bytes)) {
      return refusal('BAD_PAYLOAD', 'uploadId, sha256 and bytes are required', 400);
    }
    // Live gate: a supplied live transport is admitted only with a D9-approved
    // model, a healthy spend record, and remaining live budget — checked
    // before any slot, permit, or quota is touched. The mock path below is
    // unaffected by the gate outcome.
    const liveGate = liveTransport !== null ? validateLiveModel(liveModel) : null;
    const liveActive = liveGate !== null && liveGate.ok;
    if (liveTransport !== null) {
      const pre = checkLivePrecheck({
        d9Approved: liveActive,
        poisoned: livePoisoned,
        attemptsLeft: liveAttempts.left(kind),
      });
      if (!pre.ok) {
        const detail = pre.code === 'MODEL_UNAVAILABLE_OR_UNAPPROVED'
          ? 'D9 pending: live Baseten inference is not approved; no live request was made'
          : pre.code === 'LIVE_SPEND_RECORD_FAILED'
            ? 'live spend record unavailable; no live request was made'
            : 'live attempt budget is exhausted for this action; no provider call was made';
        return refusal(pre.code, detail, 403);
      }
      // Pinned demonstration media: the declared bytes must equal the owner
      // pin before any slot, permit, or quota is touched. Mock ignores it.
      if (liveMediaSha256 !== undefined && sha256 !== liveMediaSha256) {
        return refusal('MEDIA_NOT_PINNED', 'live request requires the pinned demonstration media; no provider call was made', 422);
      }
    }
    const liveApprovedModel: string | null = liveActive && liveGate !== null && liveGate.ok ? liveGate.model : null;
    // Mock success quota gates the mock path only. Live requests are governed
    // solely by the live ledger above and never consult or spend mock quota.
    if (!liveActive && quotaFor(kind) <= 0) {
      return refusal('QUOTA_SPENT', 'demo quota exhausted; mock runs stop here', 429);
    }
    // Single-flight acquisition is synchronous: no await precedes it, so two
    // concurrent requests cannot both observe a free slot.
    if (flight !== null) {
      return refusal('RUN_BUSY', 'another live run is already in flight', 409);
    }
    flight = { epoch };
    // Epoch captured at acquisition: after an await, a revoke may have freed
    // this slot and a newer run may own it — never clear another epoch's slot.
    const myEpoch = epoch;
    // Owned staging snapshot: cleanup only touches staging/verified fields
    // when they still belong to this attempt's epoch.
    const ownedUploadId = stagedUploadId;
    const releaseAndRefuse = async (code: string, detail: string, status: number): Promise<ApiResult> => {
      await discardStagingIfOwned(myEpoch, ownedUploadId);
      releaseFlight(myEpoch);
      return refusal(code, detail, status);
    };
    const ledgerId = pendingByKey.get(keyOf(sha256, bytes as number, kind));
    if (ledgerId === undefined) {
      return releaseAndRefuse('NO_PERMIT', 'no terminal permit names this file and action', 403);
    }
    pendingByKey.delete(keyOf(sha256, bytes as number, kind));
    // Single-use semantics: the mock attempt is consumed even when the
    // staged bytes turn out to be wrong (mirrors the I2 ledger contract).
    const consumed = permits.consumeMockAttempt({ runId: ledgerId, sha256, bytes: bytes as number, kind });
    if (!consumed.ok) {
      return releaseAndRefuse(consumed.code, 'stored mock permit could not be consumed', 403);
    }
    // The uploadId is bound to the currently staged upload (declared at the
    // permitted upload); a foreign id fails closed here, spending the permit.
    if (stagedUploadId === null || verified === null || stagedUploadId !== uploadId ||
      verified.sha256 !== sha256 || verified.bytes !== bytes) {
      return releaseAndRefuse('MEDIA_CHANGED', 'staged bytes differ from the validated upload', 422);
    }
    let bytesToEncode: Buffer;
    try {
      bytesToEncode = await uploads.readBytes(verified);
    } catch {
      return releaseAndRefuse('MEDIA_CHANGED', 'staged bytes changed before encoding', 422);
    }
    // Revocation recheck: the run does not exist yet, so a revoke that
    // landed during readBytes is observable only here. A stale attempt must
    // not encode, create a run, invoke transport, spend quota, mutate newer
    // fields, or release a newer slot.
    if (myEpoch !== epoch) {
      releaseFlight(myEpoch);
      return refusal('CANCELLED', 'analyze revoked while reading staged bytes', 409);
    }
    const part = encodeVideoPart(new Uint8Array(bytesToEncode.buffer, bytesToEncode.byteOffset, bytesToEncode.byteLength));
    await uploads.discardIfStaged(ownedUploadId);
    clearStagedFieldsIfOwned(myEpoch);
    // A revoke may also have landed during the consume above; recheck before
    // creating a run or invoking transport.
    if (myEpoch !== epoch) {
      releaseFlight(myEpoch);
      return refusal('CANCELLED', 'analyze revoked before the run started', 409);
    }
    if (!part.ok) {
      releaseFlight(myEpoch);
      return refusal(part.code, 'verified bytes failed wire encoding', 422);
    }
    // Live branch: reachable only when D9 approves the model.
    // It reuses the same permit, quota,
    // single-flight, epoch, cancellation, and settle machinery as mock.
    if (liveTransport !== null && liveApprovedModel !== null) {
      const approved = liveApprovedModel;
      const run = registerRun(kind, sha256, myEpoch);
      const sanitize = (
        raw: { mockModel: string; text: string; usage: SanitizedUsage } | { model: string; text: string; usage: SanitizedUsage; finishReason: string },
      ): SanitizeResult | LiveSanitizeResult =>
        kind === 'analyze'
          ? sanitizeLiveAnalysisResponse(raw, approved)
          : sanitizeLiveProposalResponse(raw, approved);
      // Send-boundary spend: the spender authorizes at most one send per
      // run (its onSend hook), and the transport enforces that
      // authorization synchronously before the single POST — an exhausted
      // ledger blocks the outbound request even though the earlier
      // pre-check passed. The authorization also appends the durable
      // spent-run record; a failed append poisons the live path and the send
      // never happens. Nothing is ever restored: timeout, cancel-after-send,
      // HTTP error, malformed reply, model mismatch, and sanitizer refusal
      // all keep the spent attempt.
      //
      // Durable run identity: the local run counter resets per companion
      // process, so the ledger entry id suffixes the per-ledger spend
      // sequence (`<local-run-id>#spend-<n>`). The sequence is stable within
      // a ledger — single-flight serializes sends and the exclusive lock
      // serializes processes — so repeated requests, including after a
      // restart, always land under unique durable run ids.
      const spendSend = createLiveSendSpender(liveAttempts, kind, () => {
        // Unreachable when startup enforced the record rule (nonzero budget
        // requires a path), but a missing record must fail loudly — never
        // silently send unrecorded.
        if (spentRecord === null) {
          throw new LiveSpendRecordError('LIVE_SPEND_RECORD_FAILED', 'live budget requires a spent-record path');
        }
        const seq = spentRecord.countSpent(kind) + 1;
        spentRecord.record({ runId: `${run.runId}#spend-${seq}`, sha256, kind, spentAt: now() });
      });
      // A record-append failure surfaces as a rejected send promise (the
      // async transport body runs the hook before any await, but a throw
      // inside an async function rejects rather than throwing). The tap below
      // poisons the live path for the rest of the process; the mapper turns
      // the failure into a typed refused run. Nothing was sent in either case.
      const rawResponse = liveTransport.respond(
        { kind, runId: run.runId, sha256, videoBytes: bytes as number, videoPart: part.part },
        { isCancelled: () => run.cancelled, onSend: spendSend },
      );
      rawResponse.then(
        undefined,
        (error: unknown) => {
          if (error instanceof LiveSpendRecordError) livePoisoned = true;
        },
      );
      const settled = settleRun(run, kind,
        rawResponse.then(
          (reply) => {
            if (!reply.ok) {
              throw new LiveTransportRefused(
                reply.code,
                reply.detail,
                reply.code === 'TRANSPORT_TRUNCATED' ? reply.usage : undefined,
              );
            }
            return { model: reply.model, text: reply.text, usage: reply.usage, finishReason: reply.finishReason };
          },
          (error: unknown) => {
            if (error instanceof LiveSpendRecordError) {
              throw new LiveTransportRefused('LIVE_SPEND_RECORD_FAILED', 'live spend record unavailable; no provider request was sent');
            }
            throw error;
          },
        ),
        {
          sanitize,
          identity: { model: approved },
          refusedBase: { transport: 'baseten-live', liveInference: true, provider: 'baseten' },
          spendMockQuota: false,
          unexpectedRefusal: { code: 'TRANSPORT_REFUSED', detail: 'live transport refused the internal request' },
        });
      inflight.add(settled);
      void settled.finally(() => {
        inflight.delete(settled);
      });
      return jsonResponse(200, { ok: true, runId: run.runId, state: 'analyzing' as const, model: approved, provider: 'baseten', transport: 'baseten-live' });
    }
    const run = registerRun(kind, sha256, myEpoch);
    // Per-run transport: cancellation observes only this run's flag, never a
    // stale run's. Caller-supplied transports keep their own policy.
    const runTransport = customTransport ?? createMockTransport({
      latencyMs: defaultLatencyMs,
      shouldCancel: () => run.cancelled,
    });
    const settled = settleRun(run, kind, runTransport.respond({ kind, runId: run.runId, sha256, videoBytes: bytes as number }), mockWiring(kind));
    inflight.add(settled);
    void settled.finally(() => {
      inflight.delete(settled);
    });
    return jsonResponse(200, { ok: true, runId: run.runId, state: 'analyzing' as const });
  }

  function handleCancel(payload: unknown): ApiResult {
    if (typeof payload !== 'object' || payload === null) {
      return refusal('BAD_PAYLOAD', 'runId is required', 400);
    }
    const runId: unknown = (payload as Record<string, unknown>)['runId'];
    if (typeof runId !== 'string') {
      return refusal('BAD_PAYLOAD', 'runId is required', 400);
    }
    const run = runs.get(runId);
    if (run === undefined) return refusal('NO_SUCH_RUN', 'unknown run id', 404);
    if (run.state !== 'analyzing') return refusal('NOT_RUNNING', 'run is not in flight', 409);
    run.cancelled = true;
    return jsonResponse(200, { ok: true, runId, state: 'cancelled' as const });
  }

  function parseJson(bytes: Uint8Array): { ok: true; value: unknown } | { ok: false } {
    if (bytes.length === 0) return { ok: true, value: {} };
    try {
      return { ok: true, value: JSON.parse(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf8')) };
    } catch {
      return { ok: false };
    }
  }

  /**
   * The full loopback boundary as pure logic: Host/Origin/fetch-metadata
   * policy, session authentication, and endpoint handling. The HTTP layer
   * only streams bytes and serves static files around this function.
   */
  async function dispatch(meta: ApiMeta, body: Uint8Array): Promise<ApiResult> {
    const sessionAuthenticated = typeof meta.sessionToken === 'string' && sessions.authenticate(meta.sessionToken);
    const policy = checkCompanionRequest(
      {
        method: meta.method,
        path: meta.path,
        host: meta.host ?? undefined,
        origin: meta.origin ?? undefined,
        fetchSite: meta.fetchSite ?? undefined,
        contentType: meta.contentType ?? undefined,
        bodyBytes: body.length,
      },
      boundPort,
      sessionAuthenticated,
    );
    if (!policy.ok) {
      const status = policy.code === 'SESSION_REQUIRED' ? 401 : policy.code === 'INVALID_ROUTE' ? 404 : 403;
      return refusal(policy.code, 'request refused by the loopback boundary', status);
    }
    if (meta.method === 'GET') {
      if (policy.endpoint === '/api/health') {
        return jsonResponse(200, { ok: true, version: COMPANION_VERSION });
      }
      if (policy.endpoint === '/api/status') {
        return jsonResponse(200, { ok: true, ...publicStatus(sessionAuthenticated) });
      }
      if (policy.endpoint === '/api/events') {
        const runsOut = [...runs.values()].map((r) => ({
          runId: r.runId, kind: r.kind, state: r.state, createdAt: r.createdAt, finishedAt: r.finishedAt,
          result: r.state === 'analyzing' ? null : r.result,
        }));
        return jsonResponse(200, { ok: true, runs: runsOut });
      }
      return refusal('INVALID_ROUTE', 'no such endpoint', 404);
    }
    if (policy.endpoint === '/api/upload') {
      return handleUpload(body, {
        sha256: meta.declaredSha256,
        bytes: meta.declaredBytes,
        kind: meta.declaredKind,
      });
    }
    const parsed = parseJson(body);
    if (!parsed.ok) {
      return refusal('BAD_JSON', 'request body is not valid JSON', 400);
    }
    if (policy.endpoint === '/api/pair') {
      if (typeof parsed.value !== 'object' || parsed.value === null) {
        return refusal('BAD_PAYLOAD', 'pairing body must be a JSON object', 400);
      }
      const value = (parsed.value as Record<string, unknown>)['code'];
      const paired = sessions.pair(value);
      if (!paired.ok) {
        const status = paired.code === 'PAIR_LOCKED' ? 429 : 403;
        return refusal(paired.code, 'pairing refused', status);
      }
      return jsonResponse(200, { ok: true, sessionToken: paired.sessionToken });
    }
    if (policy.endpoint === '/api/cancel') {
      return handleCancel(parsed.value);
    }
    if (policy.endpoint === '/api/analyze' || policy.endpoint === '/api/propose') {
      const kind: MockPermitKind = policy.endpoint === '/api/analyze' ? 'analyze' : 'propose';
      return handleAnalyzePropose(kind, parsed.value);
    }
    return refusal('INVALID_ROUTE', 'no such endpoint', 404);
  }

  /**
   * Bounded body reader. Oversize bodies are drained (up to a fixed grace
   * window) so the server answers with a typed BAD_BODY_SIZE instead of
   * killing the socket; a stream that exceeds even the grace window is
   * destroyed and the caller must not attempt a response on it.
   */
  function readHttpBody(req: IncomingMessage, limit: number): Promise<
    | { ok: true; bytes: Buffer }
    | { ok: false; oversized: boolean; destroyed: boolean }
  > {
    const GRACE_BYTES = 1_048_576;
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let total = 0;
      let oversized = false;
      let settled = false;
      const finish = (result: { ok: false; oversized: boolean; destroyed: boolean }): void => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };
      req.on('data', (chunk: Buffer) => {
        if (settled) return;
        total += chunk.length;
        if (!oversized && total > limit) {
          oversized = true;
          chunks.length = 0;
        }
        if (oversized) {
          if (total > limit + GRACE_BYTES) {
            req.destroy();
            finish({ ok: false, oversized: true, destroyed: true });
            return;
          }
          return; // drain and discard
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (!settled) {
          settled = true;
          if (oversized) resolve({ ok: false, oversized: true, destroyed: false });
          else resolve({ ok: true, bytes: Buffer.concat(chunks) });
        }
      });
      req.on('error', () => {
        finish({ ok: false, oversized, destroyed: false });
      });
    });
  }

  function sendHttp(res: ServerResponse, result: ApiResult): void {
    const text = JSON.stringify(result.body);
    res.writeHead(result.status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
    res.end(text);
  }

  function sendHttpRefusal(res: ServerResponse, code: string, detail: string, status: number): void {
    sendHttp(res, { status, body: { ok: false, code, detail } });
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const target = req.url ?? '/';

    if (!target.startsWith('/api/')) {
      if (serveRoot === null || (method !== 'GET' && method !== 'HEAD')) {
        sendHttpRefusal(res, 'NOT_FOUND', 'no such document', 404);
        return;
      }
      const resolved = resolveStaticPath(serveRoot, target);
      if (resolved === null) {
        sendHttpRefusal(res, 'NOT_FOUND', 'no such document', 404);
        return;
      }
      try {
        const info = await stat(resolved);
        if (!info.isFile()) {
          sendHttpRefusal(res, 'NOT_FOUND', 'no such document', 404);
          return;
        }
        const ext = path.extname(resolved).toLowerCase();
        const type = STATIC_TYPES[ext] ?? 'application/octet-stream';
        const data = method === 'HEAD' ? null : await readFile(resolved);
        res.writeHead(200, { 'content-type': type, 'content-length': info.size });
        res.end(data);
        return;
      } catch {
        sendHttpRefusal(res, 'NOT_FOUND', 'no such document', 404);
        return;
      }
    }

    const meta: ApiMeta = {
      method,
      path: target,
      host: req.headers.host ?? undefined,
      origin: req.headers.origin ?? undefined,
      fetchSite: (req.headers['sec-fetch-site'] as string | undefined) ?? undefined,
      contentType: req.headers['content-type'] ?? undefined,
      sessionToken: (req.headers['x-live-session'] as string | undefined) ?? undefined,
      declaredSha256: (req.headers['x-live-sha256'] as string | undefined) ?? undefined,
      declaredBytes: (req.headers['x-live-bytes'] as string | undefined) ?? undefined,
      declaredKind: (req.headers['x-live-action'] as string | undefined) ?? undefined,
    };
    if (method === 'GET') {
      // GET bodies are never parsed; a GET that carries one is refused so the
      // request-guard's body-size policy holds end to end.
      if ((req.headers['content-length'] ?? '0') !== '0' || req.headers['transfer-encoding'] !== undefined) {
        sendHttpRefusal(res, 'BAD_BODY_SIZE', 'GET requests must not carry a body', 403);
        return;
      }
      sendHttp(res, await dispatch({ ...meta }, new Uint8Array(0)));
      return;
    }
    // Absolute anti-abuse cap; the guard re-checks the per-endpoint limit.
    const body = await readHttpBody(req, 30_000_000);
    if (!body.ok) {
      if (body.oversized && !body.destroyed) {
        sendHttpRefusal(res, 'BAD_BODY_SIZE', 'request body exceeds the endpoint limit', 413);
      } else if (!body.destroyed) {
        sendHttpRefusal(res, 'INTERNAL', 'failed to read the request body', 500);
      }
      return;
    }
    sendHttp(res, await dispatch(meta, new Uint8Array(body.bytes.buffer, body.bytes.byteOffset, body.bytes.byteLength)));
  }

  const server: Server = createHttpServer((req, res) => {
    void route(req, res).catch(() => {
      try {
        sendHttpRefusal(res, 'INTERNAL', 'companion failed closed', 500);
      } catch {
        /* socket already gone */
      }
    });
  });

  let boundPort = port;
  if (options.bind !== false) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: NodeJS.ErrnoException): void => {
          if (error.code === 'EADDRINUSE' || error.code === 'EACCES' || error.code === 'EPERM') {
            reject(Object.assign(new Error(`companion cannot bind 127.0.0.1:${port} (${error.code})`), { code: 'ADDRESS_IN_USE' satisfies StartupRefusal }));
          } else {
            reject(error);
          }
        };
        server.once('error', onError);
        server.listen(port, '127.0.0.1', () => {
          server.off('error', onError);
          const address = server.address();
          if (typeof address === 'object' && address !== null) boundPort = address.port;
          resolve();
        });
      });
    } catch (error) {
      await uploads.destroy().catch(() => undefined);
      throw error;
    }
  }

  return {
    port: boundPort,
    serveRoot,
    sessions,
    permits,
    uploads,
    dispatch,
    async close(): Promise<void> {
      if (options.bind !== false) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      // Let in-flight runs observe cancellation and settle before the staging
      // tree is deleted, so close() never strands a run or temp bytes.
      for (const run of runs.values()) {
        if (run.state === 'analyzing') run.cancelled = true;
      }
      await Promise.allSettled([...inflight]);
      await uploads.destroy();
      // Release exclusive record ownership last: no send can follow, so no
      // other holder can interleave with this process afterwards. Best
      // effort; a leftover stale lock is taken over (or refused) on next
      // open, never silently shared.
      spentRecord?.release();
    },
    terminalPermit,
    terminalRevoke,
  };
}

export type CompanionHandle = Awaited<ReturnType<typeof createCompanion>>;
