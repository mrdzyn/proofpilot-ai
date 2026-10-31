import { useEffect, useRef, useState } from 'react';
import { HISTORICAL } from '../lib/historical.ts';
import { EvidenceTable, Note, Row, ZoneSection } from '../components/blocks.tsx';
import { NeutralChip } from '../components/chips.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/states.tsx';

const MAX_MP4_BYTES = 25 * 1024 * 1024;
const MAX_DURATION_S = 30;

type ProbeState =
  | { kind: 'idle' }
  | { kind: 'loading'; fileName: string; fileBytes: number }
  | { kind: 'error'; message: string; recovery: string }
  | {
      kind: 'ready';
      fileName: string;
      fileBytes: number;
      durationS: number;
      width: number;
      height: number;
      codecHint: string;
      sha256: string;
      lastFrameDecodable: boolean;
    };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function RecordingZone() {
  const [url, setUrl] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeState>({ kind: 'idle' });
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  async function onPick(file: File | undefined): Promise<void> {
    if (!file) return;
    if (url) URL.revokeObjectURL(url);
    const looksMp4 =
      file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4');
    if (!looksMp4) {
      setUrl(null);
      setProbe({
        kind: 'error',
        message: 'Refused: not an MP4 file.',
        recovery: 'Pick an MP4 (H.264) recording of 30 s or less.',
      });
      return;
    }
    if (file.size > MAX_MP4_BYTES) {
      setUrl(null);
      setProbe({
        kind: 'error',
        message: `Refused: file is ${formatBytes(file.size)} (limit 25 MB).`,
        recovery: 'Pick a shorter or smaller recording; nothing was uploaded.',
      });
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    setProbe({ kind: 'loading', fileName: file.name, fileBytes: file.size });
    try {
      const buf = await file.arrayBuffer();
      const sha = await sha256Hex(buf);
      // Stash the hash on the element for the metadata handler below.
      if (videoRef.current) videoRef.current.dataset.sha256 = sha;
    } catch {
      setProbe({
        kind: 'error',
        message: 'Refused: the file could not be read.',
        recovery: 'Pick the file again.',
      });
    }
  }

  function onMetadata(): void {
    const video = videoRef.current;
    if (!video) return;
    const sha = video.dataset.sha256 ?? 'computing…';
    const durationS = video.duration;
    const width = video.videoWidth;
    const height = video.videoHeight;
    const codecHint = video.canPlayType('video/mp4; codecs="avc1.42E01E"');
    setProbe((prev) => {
      if (prev.kind !== 'loading') return prev;
      return {
        kind: 'ready',
        fileName: prev.fileName,
        fileBytes: prev.fileBytes,
        durationS,
        width,
        height,
        codecHint: codecHint === '' ? 'no hint' : codecHint,
        sha256: sha,
        lastFrameDecodable: false,
      };
    });
    // Best-effort last-frame decode check: seek near the end.
    if (Number.isFinite(durationS) && durationS > 0.2) {
      try {
        video.currentTime = Math.max(0, durationS - 0.05);
      } catch {
        /* seek unsupported: stays not-decodable, honestly reported */
      }
    }
  }

  function onSeeked(): void {
    setProbe((prev) =>
      prev.kind === 'ready' ? { ...prev, lastFrameDecodable: true } : prev,
    );
  }

  function onVideoError(): void {
    setProbe((prev) =>
      prev.kind === 'loading' || prev.kind === 'ready'
        ? {
            kind: 'error',
            message: 'The selected file could not be played.',
            recovery: 'Pick a valid H.264 MP4 recording; this one appears corrupt or unsupported.',
          }
        : prev,
    );
  }

  const suitable =
    probe.kind === 'ready' &&
    Number.isFinite(probe.durationS) &&
    probe.durationS > 0 &&
    probe.durationS <= MAX_DURATION_S &&
    probe.width > 0 &&
    probe.height > 0 &&
    probe.lastFrameDecodable;

  return (
    <ZoneSection
      id="z1"
      title="1 · F01 Recording"
      tone="neutral"
      blurb={
        <>
          Owner-selected local MP4. Never uploads. <NeutralChip>SYNTHETIC FIXTURE</NeutralChip>
        </>
      }
    >
      <div>
        {url ? (
          <video
            key={url}
            ref={videoRef}
            src={url}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={onMetadata}
            onSeeked={onSeeked}
            onError={onVideoError}
            aria-label="Owner-selected F01 defect clip"
            className="w-full rounded-lg bg-black max-h-[420px]"
          />
        ) : (
          <div
            role="img"
            aria-label="Placeholder for the owner-selected mobile defect clip"
            className="w-full rounded-lg bg-black text-white flex items-center justify-center text-center text-sm p-4 min-h-[240px]"
          >
            Mobile defect clip plays here
            <br />
            (owner file pick, 390×844)
          </div>
        )}
      </div>
      <div>
        <div className="mb-3">
          <label htmlFor="mp4" className="block font-semibold mb-1.5">
            Recording file
          </label>
          <input
            type="file"
            id="mp4"
            accept="video/mp4,.mp4"
            aria-describedby="mp4hint"
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
          <p id="mp4hint" className="text-[13px] text-[#5b6068] m-0">
            MP4 · H.264 · ≤ 30 s · ≤ 25 MB. Validated locally before display.
            This file never leaves your machine.
          </p>
        </div>
        {probe.kind === 'idle' && (
          <EmptyState>No file chosen yet; limits are listed above.</EmptyState>
        )}
        {probe.kind === 'loading' && <LoadingState what="clip metadata" />}
        {probe.kind === 'error' && (
          <ErrorState message={probe.message} recovery={probe.recovery} />
        )}
        {probe.kind === 'ready' && (
          <EvidenceTable caption="Selected file — playback suitability only, not certified intake">
            <Row head="File">
              {probe.fileName} · {formatBytes(probe.fileBytes)}
            </Row>
            <Row head="SHA-256 (local)">
              <span className="mono">{probe.sha256}</span>
            </Row>
            <Row head="Duration">
              {Number.isFinite(probe.durationS)
                ? `${probe.durationS.toFixed(2)} s`
                : 'unknown'}
            </Row>
            <Row head="Dimensions">
              {probe.width > 0 ? `${probe.width}×${probe.height}` : 'unknown'}
            </Row>
            <Row head="Codec hint">{probe.codecHint} (hint only, not proof)</Row>
            <Row head="Last frame">
              {probe.lastFrameDecodable ? 'decoded (best effort)' : 'not confirmed'}
            </Row>
            <Row head="Suitability">
              {suitable ? (
                <>Suitable for playback — nothing stronger is claimed</>
              ) : (
                <>Not confirmed suitable — see rows above</>
              )}
            </Row>
          </EvidenceTable>
        )}
        <div className="mt-4">
          <EvidenceTable caption={`Historical certified set ${HISTORICAL.fixtureSet}`}>
            <Row head="Mobile defect">
              <>
                <span className="mono">{HISTORICAL.mobileClip.file}</span>
                <br />
                {HISTORICAL.mobileClip.dimensions} · {HISTORICAL.mobileClip.duration} · SHA-256{' '}
                <span className="mono">
                  {HISTORICAL.mobileClip.sha256.slice(0, 8)}…{HISTORICAL.mobileClip.sha256.slice(-6)}
                </span>
              </>
            </Row>
            <Row head="Desktop control">
              <>
                <span className="mono">{HISTORICAL.desktopClip.file}</span>
                <br />
                {HISTORICAL.desktopClip.dimensions} · {HISTORICAL.desktopClip.duration} · SHA-256{' '}
                <span className="mono">
                  {HISTORICAL.desktopClip.sha256.slice(0, 8)}…{HISTORICAL.desktopClip.sha256.slice(-6)}
                </span>
              </>
            </Row>
            <Row head="Observed">
              Mobile: {HISTORICAL.mobileClip.observed}. Desktop:{' '}
              {HISTORICAL.desktopClip.observed}.
            </Row>
          </EvidenceTable>
          <div className="mt-3">
            <Note>
              Playback suitability is not certified intake: playing a file proves
              it plays locally, not container/codec conformance or exact-SHA
              certification.
            </Note>
          </div>
        </div>
      </div>
    </ZoneSection>
  );
}
