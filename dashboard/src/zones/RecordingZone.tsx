import { useEffect, useRef, useState } from 'react';
import { HISTORICAL } from '../lib/historical.ts';
import { EvidenceTable, Note, Row, ZoneSection } from '../components/blocks.tsx';
import { NeutralChip } from '../components/chips.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/states.tsx';

const MAX_MP4_BYTES = 25 * 1024 * 1024;
const MAX_DURATION_S = 30;

interface Selection {
  gen: number;
  fileName: string;
  fileBytes: number;
  url: string;
}

interface Meta {
  gen: number;
  durationS: number;
  width: number;
  height: number;
  codecHint: string;
  lastFrameDecodable: boolean;
}

interface Digest {
  gen: number;
  sha256: string;
}

interface Refusal {
  gen: number;
  message: string;
  recovery: string;
}

const REFUSAL_RECOVERY =
  'Pick an MP4 (H.264) recording longer than 0 s, of 30 s or less, with real video dimensions; nothing was uploaded.';

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
  const [sel, setSel] = useState<Selection | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Immutable selection identity: every async completion is attributed only
  // to the pick it belongs to; a newer pick invalidates older work.
  const genRef = useRef(0);

  useEffect(() => {
    const current = sel;
    return () => {
      if (current) URL.revokeObjectURL(current.url);
    };
  }, [sel]);

  function revokeSelection(): void {
    setSel((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  async function onPick(file: File | undefined): Promise<void> {
    if (!file) return;
    const looksMp4 =
      file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4');
    if (!looksMp4) {
      revokeSelection();
      setMeta(null);
      setDigest(null);
      setRefusal({
        gen: -1,
        message: 'Refused: not an MP4 file.',
        recovery: 'Pick an MP4 (H.264) recording of 30 s or less.',
      });
      return;
    }
    if (file.size > MAX_MP4_BYTES) {
      revokeSelection();
      setMeta(null);
      setDigest(null);
      setRefusal({
        gen: -1,
        message: `Refused: file is ${formatBytes(file.size)} (limit 25 MB).`,
        recovery: 'Pick a shorter or smaller recording; nothing was uploaded.',
      });
      return;
    }
    const gen = genRef.current + 1;
    genRef.current = gen;
    revokeSelection();
    const url = URL.createObjectURL(file);
    setSel({ gen, fileName: file.name, fileBytes: file.size, url });
    setMeta(null);
    setDigest(null);
    setRefusal(null);
    try {
      const buf = await file.arrayBuffer();
      const sha256 = await sha256Hex(buf);
      // Attribute the digest only to the selection that produced it.
      if (genRef.current === gen) setDigest({ gen, sha256 });
    } catch {
      if (genRef.current === gen) {
        revokeSelection();
        setMeta(null);
        setDigest(null);
        setRefusal({
          gen,
          message: 'Refused: the file could not be read.',
          recovery: 'Pick the file again.',
        });
      }
    }
  }

  function metadataRefusal(
    gen: number,
    durationS: number,
    width: number,
    height: number,
  ): Refusal | null {
    if (!Number.isFinite(durationS) || durationS <= 0) {
      return {
        gen,
        message: 'Refused: the file reports no usable duration.',
        recovery: REFUSAL_RECOVERY,
      };
    }
    if (durationS > MAX_DURATION_S) {
      return {
        gen,
        message: `Refused: duration ${durationS.toFixed(2)} s exceeds the 30 s playback limit.`,
        recovery: REFUSAL_RECOVERY,
      };
    }
    if (width <= 0 || height <= 0) {
      return {
        gen,
        message: 'Refused: the file reports no video dimensions.',
        recovery: REFUSAL_RECOVERY,
      };
    }
    return null;
  }

  function onMetadata(): void {
    const video = videoRef.current;
    if (!video || !sel || sel.gen !== genRef.current) return;
    const gen = sel.gen;
    const failed = metadataRefusal(gen, video.duration, video.videoWidth, video.videoHeight);
    if (failed) {
      revokeSelection();
      setMeta(null);
      setDigest(null);
      setRefusal(failed);
      return;
    }
    const durationS = video.duration;
    const width = video.videoWidth;
    const height = video.videoHeight;
    const codecHint = video.canPlayType('video/mp4; codecs="avc1.42E01E"');
    setMeta({
      gen,
      durationS,
      width,
      height,
      codecHint: codecHint === '' ? 'no hint' : codecHint,
      lastFrameDecodable: false,
    });
    // Best-effort last-frame decode check: seek near the end.
    if (durationS > 0.2) {
      try {
        video.currentTime = Math.max(0, durationS - 0.05);
      } catch {
        /* seek unsupported: stays not-decodable, honestly reported */
      }
    }
  }

  function onSeeked(): void {
    setMeta((prev) => {
      if (!prev || !sel || prev.gen !== sel.gen) return prev;
      return { ...prev, lastFrameDecodable: true };
    });
  }

  function onVideoError(): void {
    if (!sel) return;
    const gen = sel.gen;
    revokeSelection();
    setMeta(null);
    setDigest(null);
    setRefusal({
      gen,
      message: 'The selected file could not be played.',
      recovery:
        'Pick a valid H.264 MP4 recording; this one appears corrupt or unsupported.',
    });
  }

  const ready =
    sel !== null &&
    meta !== null &&
    digest !== null &&
    meta.gen === sel.gen &&
    digest.gen === sel.gen;
  const suitable = ready && meta !== null && meta.lastFrameDecodable;

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
        {sel ? (
          <video
            key={sel.url}
            ref={videoRef}
            src={sel.url}
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
        {!sel && !refusal && (
          <EmptyState>No file chosen yet; limits are listed above.</EmptyState>
        )}
        {sel && !ready && !refusal && <LoadingState what="clip metadata" />}
        {refusal && (!sel || refusal.gen === sel.gen || refusal.gen === -1) && (
          <ErrorState message={refusal.message} recovery={refusal.recovery} />
        )}
        {ready && sel && meta && digest && (
          <EvidenceTable caption="Selected file — playback suitability only, not certified intake">
            <Row head="File">
              {sel.fileName} · {formatBytes(sel.fileBytes)}
            </Row>
            <Row head="SHA-256 (local)">
              <span className="mono">{digest.sha256}</span>
            </Row>
            <Row head="Duration">{`${meta.durationS.toFixed(2)} s`}</Row>
            <Row head="Dimensions">{`${meta.width}×${meta.height}`}</Row>
            <Row head="Codec hint">{meta.codecHint} (hint only, not proof)</Row>
            <Row head="Last frame">
              {meta.lastFrameDecodable ? 'decoded (best effort)' : 'not confirmed'}
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
