// UI-C3-02-I3: Zone L — Live Analysis via the localhost companion (MOCK ONLY).
//
// Same-origin fetch only; no credentials, no provider calls. Every live value
// renders under an explicit MOCK FIXTURE banner with run identity, mock model
// label, and usage. Historical Meta Muse Spark 1.3 results are untouched and
// live in their own zones; nothing here can earn a trusted verdict.
//
// Approved order (permit BEFORE upload): the browser hashes the selected file
// locally, the owner issues a hash/byte/action-bound terminal permit, and only
// then is the upload accepted. /api/analyze answers promptly with a runId so
// Cancel reaches the in-flight run.
import { useEffect, useRef, useState } from 'react';
import { ZoneSection, EvidenceTable, Row, Note } from '../components/blocks.tsx';
import { LoadingState, ErrorState } from '../components/states.tsx';
import { NeutralChip, ErrorChip } from '../components/chips.tsx';
import { describeRunProvenance } from './liveProvenance.ts';

type Phase =
  | 'unavailable'
  | 'unpaired'
  | 'pairing'
  | 'config-blocked'
  | 'ready'
  | 'uploading'
  | 'analyzing'
  | 'complete'
  | 'proposed'
  | 'refused'
  | 'cancelled'
  | 'quota';

interface FileMeta {
  name: string;
  sha256: string;
  bytes: number;
}

interface UploadMeta {
  uploadId: string;
  sha256: string;
  bytes: number;
  durationSec: number;
  width: number;
  height: number;
  codec: string;
}

interface RunResult {
  runId: string;
  state: 'done' | 'refused' | 'cancelled' | 'analyzing';
  result: Record<string, unknown> | null;
}

interface Refusal {
  code: string;
  detail: string;
  recovery: string;
}

const quotaSpentRecovery = (live: boolean): string => live
  ? 'The live spend ledger is exhausted for this record path. Every send was permanently recorded; do not restart to re-arm — no further live request is possible on this record.'
  : 'The demo quota for this companion session is exhausted. Restart the companion for a fresh demo budget.';

const RECOVERY: Record<string, string> = {
  NO_PERMIT: 'Ask the owner to run the terminal permit command for this exact hash, bytes and action BEFORE uploading, then press Upload again.',
  QUOTA_SPENT: 'The demo quota for this companion session is exhausted. Restart the companion for a fresh demo budget.',
  RUN_BUSY: 'Wait for the in-flight run to finish, or cancel it first.',
  SESSION_REQUIRED: 'Pair again using a fresh terminal code.',
  UPLOAD_TOO_LARGE: 'Pick a synthetic MP4 within the 25 MB media limit.',
  NOT_MP4: 'Pick a real H.264 MP4 file.',
  MEDIA_INVALID: 'Pick a different synthetic MP4; this file failed trusted validation.',
  MEDIA_CHANGED: 'The staged bytes changed mid-run. Hash again, register a fresh permit, upload again.',
  CANCELLED: 'The run was cancelled. Staged bytes were deleted.',
  TIMEOUT: 'The run exceeded its ceiling. Hash again, register a fresh permit, upload again.',
  LOCAL_HASH_FAILED: 'The browser could not hash the file locally. Reload this page from the loopback companion and try again.',
  MODEL_UNAVAILABLE_OR_UNAPPROVED: 'Live Baseten inference is not approved for this run. The mock path is unaffected.',
};

async function api<T>(path: string, init?: RequestInit, session?: string | null): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (session !== undefined && session !== null) headers['X-Live-Session'] = session;
  const res = await fetch(path, { ...init, headers });
  return (await res.json()) as T;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function LiveZone() {
  const [phase, setPhase] = useState<Phase>('unavailable');
  const [session, setSession] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null);
  const [hashing, setHashing] = useState(false);
  const [upload, setUpload] = useState<UploadMeta | null>(null);
  const [run, setRun] = useState<RunResult | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [kind, setKind] = useState<'analyze' | 'propose'>('analyze');
  // Live-mode awareness (issue #39): null means the mock path. Resolved from
  // /api/status after pairing and refreshed after every settled run, so the
  // labels, counters, and recovery text always describe the armed path.
  const [liveMode, setLiveMode] = useState<{ unlimited: boolean; left: number | null; spent: number } | null>(null);

  const refreshLiveMode = async (token: string): Promise<void> => {
    try {
      const data = await api<{
        ok: boolean;
        live?: {
          armed?: boolean;
          unlimited?: boolean;
          attemptsLeft?: { analyze?: number | null };
          spent?: { analyze?: number };
        };
      }>('/api/status', { method: 'GET' }, token);
      if (data.ok && data.live?.armed === true) {
        setKind('analyze');
        setLiveMode({
          unlimited: data.live.unlimited === true,
          left: typeof data.live.attemptsLeft?.analyze === 'number' ? data.live.attemptsLeft.analyze : null,
          spent: typeof data.live.spent?.analyze === 'number' ? data.live.spent.analyze : 0,
        });
      } else if (data.ok) {
        setLiveMode(null);
      }
      // Non-ok status: keep the previous mode (safe mock assumption stands).
    } catch {
      // Status unreadable: stay on the safe mock assumption.
    }
  };
  const pollRef = useRef<number | null>(null);
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = session;

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => {
        if (!cancelled) setPhase(r.ok ? 'unpaired' : 'unavailable');
      })
      .catch(() => {
        if (!cancelled) setPhase('unavailable');
      });
    return () => {
      cancelled = true;
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, []);

  function stopPolling(): void {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function doPair(): Promise<void> {
    setPhase('pairing');
    setRefusal(null);
    try {
      const out = await api<{ ok: boolean; sessionToken?: string; code?: string; detail?: string }>(
        '/api/pair',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim() }) },
      );
      if (out.ok && typeof out.sessionToken === 'string') {
        setSession(out.sessionToken);
        const status = await api<{
          ok: boolean;
          config?: { modelOk?: boolean };
          live?: {
            armed?: boolean;
            unlimited?: boolean;
            attemptsLeft?: { analyze?: number | null };
            spent?: { analyze?: number };
          };
        }>(
          '/api/status',
          { method: 'GET' },
          out.sessionToken,
        );
        if (status.ok && status.config?.modelOk === false) {
          // Live model not approved for this companion; the mock demo below still runs.
          setLiveMode(null);
          setPhase('ready');
        } else if (status.ok) {
          if (status.live?.armed === true) {
            // Owner-armed live path: label it as live before any action.
            setKind('analyze');
            setLiveMode({
              unlimited: status.live.unlimited === true,
              left: typeof status.live.attemptsLeft?.analyze === 'number' ? status.live.attemptsLeft.analyze : null,
              spent: typeof status.live.spent?.analyze === 'number' ? status.live.spent.analyze : 0,
            });
          } else {
            setLiveMode(null);
          }
          setPhase('ready');
        } else {
          setPhase('config-blocked');
        }
      } else {
        setRefusal({ code: out.code ?? 'PAIR_INVALID', detail: out.detail ?? 'pairing refused', recovery: 'Ask the owner for a fresh terminal pairing code.' });
        setPhase('unpaired');
      }
    } catch {
      setPhase('unavailable');
    }
  }

  async function doSelectFile(selected: File | undefined): Promise<void> {
    if (!selected) return;
    setFile(selected);
    setFileMeta(null);
    setUpload(null);
    setRefusal(null);
    setHashing(true);
    try {
      const buf = await selected.arrayBuffer();
      const sha256 = await sha256Hex(buf);
      setFileMeta({ name: selected.name, sha256, bytes: buf.byteLength });
    } catch {
      setRefusal({ code: 'LOCAL_HASH_FAILED', detail: 'local hashing failed', recovery: RECOVERY['LOCAL_HASH_FAILED'] ?? '' });
    } finally {
      setHashing(false);
    }
  }

  async function doUpload(): Promise<void> {
    if (session === null || file === null || fileMeta === null) return;
    setPhase('uploading');
    setRefusal(null);
    try {
      const buf = await file.arrayBuffer();
      const out = await api<{ ok: boolean; code?: string; detail?: string } & Partial<UploadMeta>>(
        '/api/upload',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Live-Sha256': fileMeta.sha256,
            'X-Live-Bytes': String(fileMeta.bytes),
            'X-Live-Action': kind,
          },
          body: buf,
        },
        session,
      );
      if (out.ok && typeof out.sha256 === 'string' && typeof out.uploadId === 'string') {
        setUpload(out as UploadMeta);
        setPhase('ready');
      } else {
        setRefusal({ code: out.code ?? 'MEDIA_INVALID', detail: out.detail ?? 'upload refused', recovery: RECOVERY[out.code ?? ''] ?? 'Pick a different synthetic MP4.' });
        setPhase('refused');
      }
    } catch {
      setPhase('unavailable');
    }
  }

  function startPolling(runId: string, activeKind: 'analyze' | 'propose'): void {
    stopPolling();
    pollRef.current = window.setInterval(() => {
      const token = sessionRef.current;
      if (token === null) {
        stopPolling();
        return;
      }
      void api<{ ok: boolean; runs: RunResult[] }>('/api/events', { method: 'GET' }, token)
        .then((events) => {
          const found = events.runs.find((r) => r.runId === runId);
          if (!found || found.state === 'analyzing') return;
          stopPolling();
          setRun(found);
          // Counters (attempts left / spent) change on every settle.
          if (token !== null) void refreshLiveMode(token);
          // A terminal run consumed the staging (server discards at encode):
          // clear it so the next cycle starts from a fresh upload.
          if (found.state === 'done') {
            setUpload(null);
            setPhase(activeKind === 'analyze' ? 'complete' : 'proposed');
          } else if (found.state === 'cancelled') {
            setUpload(null);
            setPhase('cancelled');
          } else {
            const result = (found.result ?? {}) as { code?: string; detail?: string };
            const code = result.code ?? 'REFUSED';
            const recovery = code === 'QUOTA_SPENT' ? quotaSpentRecovery(liveMode !== null) : (RECOVERY[code] ?? 'See the run record below.');
            setRefusal({ code, detail: result.detail ?? 'run refused', recovery });
            setPhase(code === 'QUOTA_SPENT' ? 'quota' : 'refused');
          }
        })
        .catch(() => {
          stopPolling();
          setPhase('unavailable');
        });
    }, 500);
  }

  async function doAnalyze(): Promise<void> {
    if (session === null || upload === null) return;
    setPhase('analyzing');
    setRefusal(null);
    try {
      const out = await api<{ ok: boolean; runId?: string; state?: string; code?: string; detail?: string }>(
        `/api/${kind}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId: upload.uploadId, sha256: upload.sha256, bytes: upload.bytes }),
        },
        session,
      );
      // The companion accepts promptly with a runId while the mock transport
      // still runs in the background — Cancel below can reach the in-flight run.
      if (out.ok && typeof out.runId === 'string') {
        setRun({ runId: out.runId, state: 'analyzing', result: null });
        startPolling(out.runId, kind);
      } else {
        const code = out.code ?? 'REFUSED';
        const recovery = code === 'QUOTA_SPENT' ? quotaSpentRecovery(liveMode !== null) : (RECOVERY[code] ?? 'See the companion terminal.');
        setRefusal({ code, detail: out.detail ?? 'request refused', recovery });
        setPhase(code === 'QUOTA_SPENT' ? 'quota' : 'refused');
      }
    } catch {
      setPhase('unavailable');
    }
  }

  async function doCancel(): Promise<void> {
    if (session === null || run === null) return;
    try {
      await api(
        '/api/cancel',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: run.runId }) },
        session,
      );
    } catch {
      setPhase('unavailable');
    }
  }

  function changeKind(next: 'analyze' | 'propose'): void {
    setKind(next);
    // The staged upload is authorized for the previous action only; switching
    // actions needs a fresh permit and a fresh upload of the same bytes.
    setUpload(null);
  }

  const result = (run?.result ?? {}) as Record<string, unknown>;
  const usage = (result['usage'] ?? {}) as { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  // Mock vs live provenance for the result table. The live branch renders
  // only when a run record carries `transport: 'baseten-live'`, which only
  // an owner-started `--live` companion produces.
  const prov = describeRunProvenance(result);

  return (
    <ZoneSection
      id="zL"
      title="L · Live Analysis via the localhost companion (explicit opt-in, mock demo)"
      tone="model"
      blurb={
        liveMode !== null ? (
          <>
            <NeutralChip>LIVE VIA BASETEN — OWNER-ARMED, USES PAID INFERENCE</NeutralChip>{' '}
            <NeutralChip>D9 APPROVED — LIVE OWNER-ONLY</NeutralChip> Every action below sends to the provider only after a fresh terminal
            permit plus your explicit click; each send is permanently recorded.
          </>
        ) : (
          <>
            Optional loopback companion demo. <NeutralChip>MOCK FIXTURE — NOT A PROVIDER RESPONSE</NeutralChip>{' '}
            <NeutralChip>D9 APPROVED — LIVE OWNER-ONLY</NeutralChip>
          </>
        )
      }
    >
      {phase === 'unavailable' && (
        <p className="text-sm text-[#5b6068] m-0">
          Companion not connected. Zone L is dormant: start the owner companion
          (scripts/c3-live-analysis.ts) serving this dashboard, then reload to
          pair. Historical zones above keep working offline.
        </p>
      )}
      {(phase === 'unpaired' || phase === 'pairing') && (
        <div>
          <p className="text-sm text-[#3d4148]">Pair this page with the owner companion. The 8-character code is printed only in the companion terminal.</p>
          <label className="text-sm font-semibold" htmlFor="live-pair-code">Terminal pairing code</label>
          <div className="flex flex-wrap gap-2 mt-1">
            <input
              id="live-pair-code"
              className="mono border border-[#9aa1ab] rounded px-2 py-1 text-sm max-w-full"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={16}
              autoComplete="off"
              inputMode="text"
            />
            <button
              type="button"
              className="px-3 py-1 text-sm font-semibold border-2 border-[#111111] rounded bg-white"
              onClick={() => void doPair()}
              disabled={phase === 'pairing'}
            >
              {phase === 'pairing' ? 'Pairing…' : 'Pair'}
            </button>
          </div>
          {refusal !== null && phase === 'unpaired' && (
            <div className="mt-2"><ErrorState message={`Pairing refused (${refusal.code}).`} recovery={refusal.recovery} /></div>
          )}
        </div>
      )}
      {phase === 'config-blocked' && (
        <ErrorState
          message="Companion configuration blocked."
          recovery="The companion refused its own startup checks. See the companion terminal; do not proceed."
        />
      )}
      {(phase === 'ready' || phase === 'uploading' || phase === 'analyzing' || phase === 'complete' || phase === 'proposed' || phase === 'refused' || phase === 'cancelled' || phase === 'quota') && (
        <div>
          {liveMode !== null ? (
            <Note>
              Live mode: the Analyze action below sends one provider request to the hackathon-approved model (paid inference) after your
              explicit click — never automatically. Attempts left: {liveMode.unlimited ? 'unlimited' : String(liveMode.left ?? '?')} · sent
              and permanently recorded: {liveMode.spent}. Proposals stay disabled (zero-proposal policy). Model identity, usage, and run
              id are echoed from the sanitized record; credentials and raw provider payloads never render.
            </Note>
          ) : (
            <Note>
              Every run below uses the in-process mock transport and canned fixture text unless this page is paired with an owner-started
              `--live` companion. Model identity, usage, and run id are echoed from the sanitized record.
            </Note>
          )}
          <div className="mt-3">
            <span className="text-sm font-semibold" id="live-action-label">Action (named in the terminal permit)</span>
            <div className="flex flex-wrap gap-2 mt-1" role="radiogroup" aria-labelledby="live-action-label">
              {(['analyze', 'propose'] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={kind === a}
                  className="px-3 py-1 text-sm font-semibold border-2 rounded bg-white"
                  style={{ borderColor: kind === a ? '#111111' : '#9aa1ab' }}
                  onClick={() => changeKind(a)}
                  disabled={phase === 'uploading' || phase === 'analyzing' || (liveMode !== null && a === 'propose')}
                  title={liveMode !== null && a === 'propose' ? 'Proposals stay disabled (zero-proposal policy)' : undefined}
                >
                  {a}
                </button>
              ))}
            </div>
            {liveMode !== null && (
              <p className="text-sm text-[#3d4148] mt-1">Proposals stay disabled (zero-proposal policy); live sends are analyses only.</p>
            )}
          </div>
          <div className="mt-3">
            <label className="text-sm font-semibold" htmlFor="live-mp4">Synthetic F01 MP4</label>
            <input
              id="live-mp4"
              type="file"
              accept="video/mp4,.mp4"
              className="block mt-1 text-sm max-w-full"
              onChange={(e) => void doSelectFile(e.target.files?.[0])}
              disabled={phase === 'uploading' || phase === 'analyzing'}
            />
          </div>
          {hashing && <div className="mt-2"><LoadingState what="local SHA-256 hashing (bytes never leave the browser)" /></div>}
          {fileMeta !== null && !hashing && (
            <EvidenceTable caption="Local file hash — computed in the browser, nothing uploaded yet">
              <Row head="SHA-256 (local)"><span className="mono break-all">{fileMeta.sha256}</span></Row>
              <Row head="Media">{`${fileMeta.name} · ${(fileMeta.bytes / 1024).toFixed(1)} KB`}</Row>
              <Row head="Permit (first)">Ask the owner to run in the companion terminal: <span className="mono break-all">permit {kind} {fileMeta.sha256} {fileMeta.bytes}</span> — then press Upload below.</Row>
            </EvidenceTable>
          )}
          {fileMeta !== null && upload === null && (phase === 'ready' || phase === 'refused' || phase === 'cancelled' || phase === 'complete' || phase === 'proposed' || phase === 'quota') && (
            <div className="mt-2">
              <button
                type="button"
                className="px-3 py-1 text-sm font-semibold border-2 border-[#111111] rounded bg-white"
                onClick={() => void doUpload()}
              >
                Upload to companion
              </button>
            </div>
          )}
          {phase === 'uploading' && <div className="mt-2"><LoadingState what="permitted upload and trusted validation" /></div>}
          {upload !== null && (phase === 'ready' || phase === 'refused') && (
            <EvidenceTable caption="Validated staged upload — playback bytes only, nothing sent anywhere">
              <Row head="SHA-256 (companion)"><span className="mono break-all">{upload.sha256}</span></Row>
              <Row head="Media">{`${upload.width}×${upload.height} · ${upload.durationSec.toFixed(2)} s · ${upload.codec} · ${(upload.bytes / 1024).toFixed(1)} KB`}</Row>
              <Row head="Authorized action"><span className="mono">{kind}</span> — staged for this action only.</Row>
            </EvidenceTable>
          )}
          {upload !== null && (phase === 'ready' || phase === 'refused' || phase === 'cancelled') && (
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                className="px-3 py-1 text-sm font-semibold border-2 border-[#111111] rounded bg-white"
                onClick={() => void doAnalyze()}
              >
                {kind === 'analyze'
                  ? (liveMode !== null ? 'Analyze live with Baseten (billable inference)' : 'Analyze with mock fixture')
                  : 'Propose correction (mock)'}
              </button>
            </div>
          )}
          {phase === 'analyzing' && (
            <div className="mt-2">
              <LoadingState what={`${liveMode !== null ? `live ${kind} (billable)` : `mock ${kind}`} — polling the companion run record`} />
              <div className="mt-2">
                <button
                  type="button"
                  className="px-3 py-1 text-sm font-semibold border-2 border-[#b91c1c] text-[#b91c1c] rounded bg-white"
                  onClick={() => void doCancel()}
                >
                  Cancel run
                </button>
              </div>
            </div>
          )}
          {(phase === 'complete' || phase === 'proposed') && run !== null && (
            <EvidenceTable caption={prov.isLive
              ? `Live Baseten ${kind} result — quoted text (UNVERIFIED), run ${run.runId}`
              : `Mock ${kind} result — quoted fixture text, run ${run.runId}`}>
              <Row head="Verdict">
                <ErrorChip>{phase === 'complete' ? prov.verdictChip : prov.proposalChip}</ErrorChip>
              </Row>
              <Row head="Model">{prov.isLive ? prov.model : String(result['mockModel'] ?? 'mock-fixture-model (not a live model)')}</Row>
              <Row head="Run">{prov.isLive
                ? `${run.runId} · provider: baseten · model: ${prov.model} · transport: baseten-live · live inference: yes`
                : `${run.runId} · transport: ${String(result['transport'] ?? 'mock-fixture')} · live inference: no`}</Row>
              <Row head="Usage">{`prompt ${usage.promptTokens ?? '?'} · completion ${usage.completionTokens ?? '?'} · total ${usage.totalTokens ?? '?'} (${prov.usageNote})`}</Row>
              {phase === 'complete' && <Row head={prov.isLive ? 'Observations (quoted, unverified)' : 'Observations'}>{String(result['observations'] ?? '')}</Row>}
              {phase === 'proposed' && (
                <Row head="Correction triple">
                  {JSON.stringify(result['adjustments'] ?? [])} — escaped read-only text, never executed. Rendered CSS: <span className="mono">{String(result['renderedCss'] ?? '')}</span>
                </Row>
              )}
            </EvidenceTable>
          )}
          {phase === 'refused' && refusal !== null && (
            <div className="mt-2"><ErrorState message={`Refused (${refusal.code}): ${refusal.detail}`} recovery={refusal.recovery} />
              {refusal.code === 'TRANSPORT_TRUNCATED' &&
                typeof usage.promptTokens === 'number' && typeof usage.completionTokens === 'number' && typeof usage.totalTokens === 'number' && (
                <p className="text-sm text-[#3d4148] mt-1">Provider-claimed usage (diagnostic only, not billing): prompt {usage.promptTokens} · completion {usage.completionTokens} · total {usage.totalTokens}.</p>
              )}
            </div>
          )}
          {phase === 'cancelled' && (
            <Note>The run was cancelled. Staged bytes were deleted; hash the file again for the next attempt.</Note>
          )}
          {phase === 'quota' && (
            <ErrorState
              message={refusal !== null ? `Demo quota exhausted (${refusal.code}).` : 'Demo quota exhausted.'}
              recovery={liveMode !== null ? quotaSpentRecovery(true) : 'This companion session has no mock runs left. Restart the companion for a fresh demo budget.'}
            />
          )}
        </div>
      )}
    </ZoneSection>
  );
}
