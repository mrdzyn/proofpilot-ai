// UI-C3-L-DEMO-01: Zone L Evidence Replay — the full C3 story with zero
// companions, zero pairing, zero provider calls and zero new browser runs.
//
// Everything on screen comes from the sanitized bundle
// (dashboard/src/assets/replay/ + lib/replayEvidence.ts): committed bytes,
// hash-verified at bundling time. No fetch, no credentials, no secrets, no
// absolute paths, no raw artifacts, no signing keys. A failed media load
// renders an explicit unavailable state, never a fabricated placeholder.
import { useState } from 'react';
import {
  CodeBlock,
  EvidenceTable,
  Note,
  Row,
  ZoneSection,
} from '../components/blocks.tsx';
import {
  ErrorChip,
  NeutralChip,
  UntrustedMarker,
  VerdictChip,
} from '../components/chips.tsx';
import { ErrorState } from '../components/states.tsx';
import {
  REPLAY_BASETEN,
  REPLAY_EVIDENCE_RUN,
  REPLAY_MEDIA,
  REPLAY_PROPOSAL,
  REPLAY_RUN_ID,
  REPLAY_VERDICTS,
} from '../lib/replayEvidence.ts';

const STEPS = [
  'F01 failure',
  'Baseten analysis',
  'Meta proposal',
  'PC-1 fix',
  'Three replays',
] as const;

function MediaImg({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <ErrorState
        message="Screenshot unavailable."
        recovery="The bundled evidence asset failed to load; no image is substituted. Rebuild the dashboard bundle from verified evidence."
      />
    );
  }
  return (
    <figure className="m-0">
      <img
        src={src}
        alt={alt}
        className="max-w-full h-auto rounded border border-[#d8dce1]"
        onError={() => setFailed(true)}
      />
      <figcaption className="text-[13px] text-[#5b6068] mt-1">{caption}</figcaption>
    </figure>
  );
}

function StageVideo() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <ErrorState
        message="Recording unavailable in this checkout."
        recovery="Video evidence is never committed to the repository. Export the verified clip (SHA-256 e9df68b14c48…) to dashboard/public/replay/ to play it locally. The stills below show the same before/after states; no footage is substituted."
      />
    );
  }
  return (
    <figure className="m-0">
      <video
        controls
        preload="metadata"
        playsInline
        aria-label="Certified F01 mobile defect recording: two Add to Cart taps, cart stays 0"
        className="max-w-full h-auto rounded border border-[#d8dce1]"
        onError={() => setFailed(true)}
      >
        <source src={REPLAY_MEDIA.defectVideo.src} type="video/mp4" />
        Your browser cannot play this MP4. The stills below show the same
        before/after states.
      </video>
      <figcaption className="text-[13px] text-[#5b6068] mt-1">
        Certified mobile defect clip (SHA-256{' '}
        <span className="mono">
          {REPLAY_MEDIA.defectVideo.sha256.slice(0, 12)}…
        </span>
        ). Taps land on the overlay; the cart never moves.
      </figcaption>
    </figure>
  );
}

function StageNav({
  step,
  setStep,
}: {
  step: number;
  setStep: (n: number) => void;
}) {
  return (
    <nav aria-label="Evidence replay stages" className="mt-1">
      <ol className="flex flex-wrap gap-2 m-0 p-0 list-none">
        {STEPS.map((label, i) => (
          <li key={label} className="m-0 p-0">
            <button
              type="button"
              aria-current={i === step ? 'step' : undefined}
              onClick={() => setStep(i)}
              className="px-3 py-1 text-sm font-semibold border-2 rounded-full bg-white"
              style={{ borderColor: i === step ? '#111111' : '#9aa1ab' }}
            >
              {i + 1} · {label}
            </button>
          </li>
        ))}
      </ol>
      <div className="flex gap-2 mt-3">
        <button
          type="button"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="px-3 py-1 text-sm font-semibold border-2 border-[#111111] rounded bg-white disabled:opacity-40"
        >
          ← Previous
        </button>
        <button
          type="button"
          onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))}
          disabled={step === STEPS.length - 1}
          className="px-3 py-1 text-sm font-semibold border-2 border-[#111111] rounded bg-white disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </nav>
  );
}

export function ReplayZone() {
  const [step, setStep] = useState(0);
  return (
    <ZoneSection
      id="zL-replay"
      title="L · Evidence Replay — the full C3 story, no companion needed"
      tone="evidence"
      blurb={
        <>
          A guided replay of already-verified evidence: five stages, zero
          provider calls, zero new browser runs.{' '}
          <NeutralChip>OFFLINE REPLAY — NOTHING EXECUTES</NeutralChip>{' '}
          <VerdictChip>✔ PC-1 HAND-AUTHORED — VERIFIED 3/3</VerdictChip>{' '}
          <UntrustedMarker qualifier="META PROPOSAL — ACCEPTED, NOT VERIFIED" />{' '}
          <NeutralChip>BASETEN ANALYSIS — OWNER-OBSERVED, UNVERIFIED</NeutralChip>
        </>
      }
    >
      <div>
        <StageNav step={step} setStep={setStep} />
        {step === 0 && (
          <div>
            <h3 className="text-lg font-semibold mt-4 mb-2">
              Stage 1 · The F01 failure (Cart 0)
            </h3>
            <StageVideo />
            <div className="grid gap-5 grid-cols-1 lg:grid-cols-2 mt-3">
              <MediaImg
                src={REPLAY_MEDIA.baselineCart0.src}
                alt="Baseline mobile screenshot after tapping Add to Cart: cart badge still reads 0"
                caption="After tap, Cart 0 — the tap never reached the button (identical before/after bytes)."
              />
            </div>
            <div className="mt-3">
              <EvidenceTable caption="Certified baseline verdict (trusted oracle)">
                <Row head="Outcome">
                  <>
                    <ErrorChip>✖ PATCH_FAILED</ErrorChip> mobile fails by
                    interception, desktop passes
                  </>
                </Row>
                <Row head="Mobile">
                  hit-test promo-overlay · cart count after tap: 0
                </Row>
                <Row head="Provenance">
                  Certified recording + fresh-stage oracle replay · 0
                  model/provider calls
                </Row>
              </EvidenceTable>
            </div>
          </div>
        )}
        {step === 1 && (
          <div>
            <h3 className="text-lg font-semibold mt-4 mb-2">
              Stage 2 · Baseten Muse Spark Open video analysis (UNVERIFIED)
            </h3>
            <Note>
              Three owner-supervised attempts were refused and are spent. A
              later owner-observed attempt was accepted (below) — a single
              UNVERIFIED observation, not a fix or diagnosis. No Baseten
              analysis generated the Meta correction; that came from a
              separate earlier Meta request.
            </Note>
            <div className="mt-3">
              <EvidenceTable caption="Three refused attempts (owner-observed, spent)">
                {REPLAY_BASETEN.attempts.map((a) => (
                  <Row key={a.id} head={a.id}>
                    <>
                      <ErrorChip>{`✖ ${a.result}`}</ErrorChip> {a.detail}
                    </>
                  </Row>
                ))}
              </EvidenceTable>
            </div>
            <div className="mt-3">
              <EvidenceTable caption="One accepted analysis (owner-observed, UNVERIFIED — not a fix)">
                <Row head="Attempt">
                  {REPLAY_BASETEN.acceptedAttempt.id}
                </Row>
                <Row head="Run">
                  <span className="mono">
                    {REPLAY_BASETEN.acceptedAttempt.runId}
                  </span>{' '}
                  · provenance{' '}
                  <span className="mono">
                    {REPLAY_BASETEN.acceptedAttempt.provenance}
                  </span>
                </Row>
                <Row head="Model">
                  {REPLAY_BASETEN.model} · analysis cap{' '}
                  {REPLAY_BASETEN.acceptedAttempt.analysisCap} · zero
                  proposals, no retries
                </Row>
                <Row head="Observations">
                  <>
                    <UntrustedMarker qualifier="UNVERIFIED MODEL OUTPUT" /> “
                    {REPLAY_BASETEN.acceptedAttempt.observations}”
                  </>
                </Row>
                <Row head="Usage">
                  {REPLAY_BASETEN.acceptedAttempt.usage}
                </Row>
                <Row head="Status">
                  <NeutralChip>
                    {REPLAY_BASETEN.acceptedAttempt.status}
                  </NeutralChip>{' '}
                  {REPLAY_BASETEN.billing}
                </Row>
                <Row head="Spend">
                  {REPLAY_BASETEN.acceptedAttempt.spend}
                </Row>
              </EvidenceTable>
            </div>
          </div>
        )}
        {step === 2 && (
          <div>
            <h3 className="text-lg font-semibold mt-4 mb-2">
              Stage 3 · Historical Meta proposal (ACCEPTED, NOT VERIFIED)
            </h3>
            <p className="text-sm text-[#3d4148]">
              <UntrustedMarker qualifier="NOT VERIFIED" /> Separate earlier
              Meta request (<span className="mono">muse-spark-1.3</span>,
              Oct 29 2026). Documented text only — never loaded from the
              artifact store, never staged, never executed.
            </p>
            <CodeBlock
              label="Documented CSS adjustment, read-only text"
              code={REPLAY_PROPOSAL.renderedCss}
            />
            <div className="mt-3">
              <EvidenceTable caption="Proposal record (from the reviewed execution report)">
                <Row head="Run">{REPLAY_PROPOSAL.runId}</Row>
                <Row head="Model">
                  {REPLAY_PROPOSAL.requestedModel} ·{' '}
                  {REPLAY_PROPOSAL.requestedAt}
                </Row>
                <Row head="Input">
                  {REPLAY_PROPOSAL.inputChars} chars · SHA-256{' '}
                  <span className="mono">
                    {REPLAY_PROPOSAL.inputSha256.slice(0, 12)}…
                  </span>
                </Row>
                <Row head="Status">{REPLAY_PROPOSAL.status}</Row>
              </EvidenceTable>
            </div>
          </div>
        )}
        {step === 3 && (
          <div>
            <h3 className="text-lg font-semibold mt-4 mb-2">
              Stage 4 · Hand-authored PC-1 correction (VERIFIED 3/3)
            </h3>
            <p className="text-sm text-[#3d4148]">
              <VerdictChip>✔ PC-1 VERIFIED 3/3</VerdictChip> The same CSS
              value, staged through the offline verifier — three fresh
              stages, three distinct nonces, oracle exit 0 each.
            </p>
            <CodeBlock
              label="Applied CSS correction, read-only text"
              code={REPLAY_VERDICTS.pc1.css}
            />
            <div className="mt-3">
              <MediaImg
                src={REPLAY_MEDIA.fixedMobileCart1.src}
                alt="Corrected mobile screenshot after tapping Add to Cart: cart badge reads 1"
                caption="After tap, Cart 1 — identical pixels in all three replays."
              />
            </div>
          </div>
        )}
        {step === 4 && (
          <div>
            <h3 className="text-lg font-semibold mt-4 mb-2">
              Stage 5 · Three replays + desktop control + scoreboard
            </h3>
            <div className="mt-1">
              <EvidenceTable caption="Replay verdicts (trusted oracle, evidence finalized)">
                <Row head="Summary">
                  <>
                    <VerdictChip>{`✔ ${REPLAY_VERDICTS.pc1.outcome}`}</VerdictChip>{' '}
                    {REPLAY_VERDICTS.pc1.summary} · hand-authored PC-1 only,
                    never the model proposal
                  </>
                </Row>
                {REPLAY_VERDICTS.pc1.replayRuns.map((r) => (
                  <Row key={r.n} head={`Replay ${r.n}`}>
                    <>
                      <VerdictChip>{`✔ ${r.outcome} · exit ${r.oracleExit}`}</VerdictChip>{' '}
                      nonce <span className="mono">{r.nonce}</span> ·{' '}
                      <span className="mono">{r.evidenceDir}</span>
                      <br />
                      mobile passed/add-to-cart · Cart 1 · desktop passed ·
                      Cart 1<br />
                      record <span className="mono">
                        {r.recordSha256.slice(0, 16)}…
                      </span>{' '}
                      · report <span className="mono">
                        {r.oracleReportSha256.slice(0, 16)}…
                      </span>
                    </>
                  </Row>
                ))}
                <Row head="Desktop control">
                  <>
                    <VerdictChip>✔ PASSED</VerdictChip> two-column layout,
                    Cart 1 — no regression
                  </>
                </Row>
                <Row head="Scoreboard">
                  re-verified OK from persisted evidence · provider calls:{' '}
                  {REPLAY_VERDICTS.pc1.providerCalls}
                </Row>
              </EvidenceTable>
            </div>
            <div className="mt-3">
              <MediaImg
                src={REPLAY_MEDIA.fixedDesktopCart1.src}
                alt="Corrected desktop screenshot after tapping Add to Cart: cart badge reads 1"
                caption="Desktop control: Cart 1, layout intact."
              />
            </div>
            <div className="mt-3">
              <EvidenceTable caption="Evidence root (verify with shasum -a 256)">
                <Row head="Run">{REPLAY_RUN_ID}</Row>
                <Row head="Scoreboard">
                  <span className="mono">
                    {REPLAY_VERDICTS.pc1.scoreboardSha256.slice(0, 16)}…
                  </span>
                </Row>
                <Row head="Baseline report">
                  <span className="mono">
                    {REPLAY_VERDICTS.baseline.oracleReportSha256.slice(0, 16)}…
                  </span>
                </Row>
                <Row head="Replay reports">
                  <>
                    {REPLAY_VERDICTS.pc1.replayRuns.map((r) => (
                      <span key={r.n} className="mono">
                        R{r.n} {r.oracleReportSha256.slice(0, 16)}…{' '}
                      </span>
                    ))}
                    (full hashes in the bundled manifest)
                  </>
                </Row>
              </EvidenceTable>
            </div>
            <div className="mt-3">
              <Note>
                What remains: the stored Meta proposal needs its authorized
                C3 run (owner approval → signed enrollment → isolated
                verification). Until then it stays ACCEPTED, NOT VERIFIED —
                PC-1's verdict is the hand-authored control's, and it is
                never transferred.
              </Note>
            </div>
          </div>
        )}
      </div>
      <div>
        <EvidenceTable caption="Provenance labels (read these first)">
          <Row head="PC-1">
            <>
              <VerdictChip>✔ HAND-AUTHORED — VERIFIED 3/3</VerdictChip>{' '}
              synthetic control, trusted oracle
            </>
          </Row>
          <Row head="Meta proposal">
            <>
              <UntrustedMarker qualifier="ACCEPTED — NOT VERIFIED" /> stored
              model artifact, never staged or executed
            </>
          </Row>
          <Row head="Baseten analysis">
            <>
              <NeutralChip>OWNER-OBSERVED — UNVERIFIED</NeutralChip> 1
              accepted analysis (single observation, not a fix); 3 refusals
              recorded spent
            </>
          </Row>
        </EvidenceTable>
        <p className="text-[13px] text-[#5b6068]">
          Evidence run{' '}
          <span className="mono">{REPLAY_EVIDENCE_RUN}</span> · full hashes in
          the bundled manifest · rebuilt by one dashboard build command, no
          network.
        </p>
      </div>
    </ZoneSection>
  );
}
