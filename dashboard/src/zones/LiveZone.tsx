// UI-C3-02-I3: Zone L — Live Analysis via the localhost companion (MOCK ONLY).
//
// Same-origin fetch only; no credentials, no provider calls. Every live value
// renders under an explicit MOCK FIXTURE banner with run identity, mock model
// label, and usage. Historical Meta Muse Spark 1.3 results are untouched and
// live in their own zones; nothing here can earn a trusted verdict.
import { useEffect, useRef, useState } from 'react';
import { ZoneSection, EvidenceTable, Row, Note } from '../components/blocks.tsx';
import { LoadingState, ErrorState } from '../components/states.tsx';
import { NeutralChip, ErrorChip } from '../components/chips.tsx';

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

const RECOVERY: Record<string, string> = {
  NO_PERMIT: 'Ask the owner to register a terminal permit for this exact file and action, then try again.',
  QUOTA_SPENT: 'The demo quota for this companion session is exhausted. Restart the companion for a fresh demo budget.',
  RUN_BUSY: 'Wait for the in-flight run to finish, or cancel it first.',
  SESSION_REQUIRED: 'Pair again using a fresh terminal code.',
  UPLOAD_TOO_LARGE: 'Pick a synthetic MP4 within the 25 MB media limit.',
  NOT_MP4: 'Pick a real H.264 MP4 file.',
  MEDIA_INVALID: 'Pick a different synthetic MP4; this file failed trusted validation.',
  MEDIA_CHANGED: 'The staged bytes changed mid-run. Upload again and register a fresh permit.',
  CANCELLED: 'The run was cancelled. Staged bytes were deleted.',
  TIMEOUT: 'The run exceeded its ceiling. Upload again and register a fresh permit.',
};

async function api<T>(path: string, init?: RequestInit, session?: string | null): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (session !== undefined && session !== null) headers['X-Live-Session'] = session;
  const res = await fetch(path, { ...init, headers });
  return (await res.json()) as T;
}

export function LiveZone() {
  const [phase, setPhase] = useState<Phase>('unavailable');
  const [session, setSession] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [upload, setUpload] = useState<UploadMeta | null>(null);
  const [run, setRun] = useState<RunResult | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [kind, setKind] = useState<'analyze' | 'propose'>('analyze');
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
        const status = await api<{ ok: boolean; config?: { modelOk?: boolean } }>(
          '/api/status',
          { method: 'GET' },
          out.sessionToken,
        );
        if (status.ok && status.config?.modelOk === false) {
          // D9 pending: live inference blocked; the mock demo below still runs.
          setPhase('ready');
        } else if (status.ok) {
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

  async function doUpload(file: File | undefined): Promise<void> {
    if (!file || session === null) return;
    setPhase('uploading');
    setRefusal(null);
    try {
      const buf = await file.arrayBuffer();
      const out = await api<{ ok: boolean; code?: string; detail?: string } & Partial<UploadMeta>>(
        '/api/upload',
        { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf },
        session,
      );
      if (out.ok && typeof out.sha256 === 'string') {
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
          if (found.state === 'done') setPhase(activeKind === 'analyze' ? 'complete' : 'proposed');
          else if (found.state === 'cancelled') setPhase('cancelled');
          else {
            const result = (found.result ?? {}) as { code?: string; detail?: string };
            const code = result.code ?? 'REFUSED';
            setRefusal({ code, detail: result.detail ?? 'run refused', recovery: RECOVERY[code] ?? 'See the run record below.' });
            setPhase(code === 'QUOTA_SPENT' ? 'quota' : 'refused');
          }
        })
        .catch(() => {
          stopPolling();
          setPhase('unavailable');
        });
    }, 500);
  }

  async function doAnalyze(activeKind: 'analyze' | 'propose'): Promise<void> {
    if (session === null || upload === null) return;
    setKind(activeKind);
    setPhase('analyzing');
    setRefusal(null);
    try {
      const out = await api<{ ok: boolean; runId?: string; state?: string; code?: string; detail?: string }>(
        `/api/${activeKind}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId: upload.uploadId, sha256: upload.sha256, bytes: upload.bytes }),
        },
        session,
      );
      if (out.ok && typeof out.runId === 'string') {
        startPolling(out.runId, activeKind);
      } else {
        const code = out.code ?? 'REFUSED';
        setRefusal({ code, detail: out.detail ?? 'request refused', recovery: RECOVERY[code] ?? 'See the companion terminal.' });
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

  const result = (run?.result ?? {}) as Record<string, unknown>;
  const usage = (result['usage'] ?? {}) as { promptTokens?: number; completionTokens?: number; totalTokens?: number };

  return (
    <ZoneSection
      id="zL"
      title="L · Live Analysis via the localhost companion (explicit opt-in, mock demo)"
      tone="model"
      blurb={
        <>
          Optional loopback companion demo. <NeutralChip>MOCK FIXTURE — NOT A PROVIDER RESPONSE</NeutralChip>{' '}
          <NeutralChip>D9 PENDING — NO LIVE MODEL</NeutralChip>
        </>
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
          <div className="flex gap-2 mt-1">
            <input
              id="live-pair-code"
              className="mono border border-[#9aa1ab] rounded px-2 py-1 text-sm"
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
          <Note>
            D9 is pending, so no live model exists in this slice: every run below uses the in-process mock transport and canned fixture text. Model identity,
            usage, and run id are echoed from the sanitized mock record.
          </Note>
          <div className="mt-3">
            <label className="text-sm font-semibold" htmlFor="live-mp4">Synthetic F01 MP4</label>
            <input
              id="live-mp4"
              type="file"
              accept="video/mp4,.mp4"
              className="block mt-1 text-sm"
              onChange={(e) => void doUpload(e.target.files?.[0])}
              disabled={phase === 'uploading' || phase === 'analyzing'}
            />
          </div>
          {phase === 'uploading' && <div className="mt-2"><LoadingState what="upload and trusted validation" /></div>}
          {upload !== null && (phase === 'ready' || phase === 'refused') && (
            <EvidenceTable caption="Validated upload — playback bytes only, nothing sent anywhere">
              <Row head="SHA-256 (local)"><span className="mono">{upload.sha256}</span></Row>
              <Row head="Media">{`${upload.width}×${upload.height} · ${upload.durationSec.toFixed(2)} s · ${upload.codec} · ${(upload.bytes / 1024).toFixed(1)} KB`}</Row>
              <Row head="Permit">Ask the owner to run in the companion terminal: <span className="mono">permit analyze {upload.sha256.slice(0, 12)}… {upload.bytes}</span> (full hash shown above), and <span className="mono">permit propose …</span> for a correction.</Row>
            </EvidenceTable>
          )}
          {upload !== null && (phase === 'ready' || phase === 'refused' || phase === 'cancelled') && (
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                className="px-3 py-1 text-sm font-semibold border-2 border-[#111111] rounded bg-white"
                onClick={() => void doAnalyze('analyze')}
              >
                Analyze with mock fixture
              </button>
              <button
                type="button"
                className="px-3 py-1 text-sm font-semibold border-2 border-[#111111] rounded bg-white"
                onClick={() => void doAnalyze('propose')}
              >
                Propose correction (mock)
              </button>
            </div>
          )}
          {phase === 'analyzing' && (
            <div className="mt-2">
              <LoadingState what={`mock ${kind} — polling the companion run record`} />
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
            <EvidenceTable caption={`Mock ${kind} result — quoted fixture text, run ${run.runId}`}>
              <Row head="Verdict">
                <ErrorChip>{phase === 'complete' ? 'MOCK FIXTURE — NOT A PROVIDER RESPONSE' : 'UNTRUSTED PROPOSAL — NOT VERIFIED (MOCK)'}</ErrorChip>
              </Row>
              <Row head="Model">{String(result['mockModel'] ?? 'mock-fixture-model (D9 pending: not a live model)')}</Row>
              <Row head="Run">{`${run.runId} · transport: ${String(result['transport'] ?? 'mock-fixture')} · live inference: no`}</Row>
              <Row head="Usage">{`prompt ${usage.promptTokens ?? '?'} · completion ${usage.completionTokens ?? '?'} · total ${usage.totalTokens ?? '?'} (fixture counts, not billing)`}</Row>
              {phase === 'complete' && <Row head="Observations">{String(result['observations'] ?? '')}</Row>}
              {phase === 'proposed' && (
                <Row head="Correction triple">
                  {JSON.stringify(result['adjustments'] ?? [])} — escaped read-only text, never executed. Rendered CSS: <span className="mono">{String(result['renderedCss'] ?? '')}</span>
                </Row>
              )}
            </EvidenceTable>
          )}
          {phase === 'refused' && refusal !== null && (
            <div className="mt-2"><ErrorState message={`Refused (${refusal.code}): ${refusal.detail}`} recovery={refusal.recovery} /></div>
          )}
          {phase === 'cancelled' && (
            <Note>The run was cancelled or timed out. Staged bytes were deleted; the permit was spent.</Note>
          )}
          {phase === 'quota' && (
            <ErrorState
              message="Demo quota exhausted."
              recovery="This companion session has no mock runs left. Restart the companion for a fresh demo budget."
            />
          )}
        </div>
      )}
    </ZoneSection>
  );
}
