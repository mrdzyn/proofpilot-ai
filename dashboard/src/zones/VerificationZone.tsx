import { useState } from 'react';
import { HISTORICAL } from '../lib/historical.ts';
import { importPickedJson, type ImportOutcome } from '../lib/importJson.ts';
import type { ImportedView } from '../../../packages/dashboard-import/src/types.ts';
import {
  EvidenceTable,
  Note,
  Row,
  ZoneSection,
} from '../components/blocks.tsx';
import {
  ErrorChip,
  NeutralChip,
  UnverifiedImportChip,
  VerdictChip,
} from '../components/chips.tsx';
import { EmptyState, ErrorState, LoadingState } from '../components/states.tsx';

const ex = HISTORICAL.scoreboardExample;

function ImportedScoreboard({ view }: { view: Extract<ImportedView, { kind: 'scoreboard' }> }) {
  return (
    <div className="mt-3">
      <p>
        <UnverifiedImportChip />
        {view.claimsExampleNote && <> (file claims to be an example)</>}
      </p>
      <EvidenceTable caption="Owner-imported file, quoted as claims — trusted chip withheld">
        <Row head="Label">{view.label}</Row>
        <Row head="Baseline">
          {view.baselineReproduced ? 'REPRODUCED (file-reported)' : 'NOT REPRODUCED (file-reported)'}
        </Row>
        {view.rows.map((r) => (
          <Row key={r.id} head={r.id}>
            {r.status} (file-reported) · {r.replaysPassed}/{r.replaysAttempted} replays — {r.description}
          </Row>
        ))}
        <Row head="Provenance">owner-imported evidence (syntactically valid, unauthenticated)</Row>
      </EvidenceTable>
    </div>
  );
}

function ImportedBaseline({ view }: { view: Extract<ImportedView, { kind: 'baseline' }> }) {
  return (
    <div className="mt-3">
      <p>
        <UnverifiedImportChip />
      </p>
      <EvidenceTable caption="Owner-imported file, quoted as a claim — trusted chip withheld">
        <Row head="Run">{view.runId}</Row>
        <Row head="Verdict">{view.verdict} (file-reported)</Row>
        <Row head="Regression">{view.regression} (file-reported)</Row>
        <Row head="Certified">{view.certified ? 'YES (file-reported)' : 'NO (file-reported)'}</Row>
        <Row head="Provenance">owner-imported evidence (syntactically valid, unauthenticated)</Row>
      </EvidenceTable>
    </div>
  );
}

export function VerificationZone() {
  const [busy, setBusy] = useState(false);
  // Last accepted import survives later refusals: success replaces it,
  // failure leaves it on screen and only adds the error banner.
  const [accepted, setAccepted] = useState<Extract<
    ImportOutcome,
    { ok: true }
  > | null>(null);
  const [refusal, setRefusal] = useState<Extract<
    ImportOutcome,
    { ok: false }
  > | null>(null);

  async function onPick(file: File | undefined): Promise<void> {
    if (!file) return;
    setBusy(true);
    try {
      const next = await importPickedJson(file);
      if (next.ok) {
        setAccepted(next);
        setRefusal(null);
      } else {
        setRefusal(next);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ZoneSection
      id="z4"
      title="4 · Independent Verification"
      tone="evidence"
      blurb={
        <>
          Trusted oracle evidence. The model never judges.{' '}
          <NeutralChip>HAND-AUTHORED CONTROLS ONLY — NO MODEL INPUT</NeutralChip>
        </>
      }
    >
      <div>
        <EvidenceTable caption="Certified F01 baseline (trusted oracle, exact clean SHA)">
          <Row head="Verdict">
            <>
              <ErrorChip>✖ REPRODUCED</ErrorChip> mobile fails by interception,
              desktop passes
            </>
          </Row>
          <Row head="Certification">
            exact-SHA certified: YES · <span className="mono">modelOrProviderCalls: {ex.modelOrProviderCalls}</span>
          </Row>
        </EvidenceTable>
        <p>
          <VerdictChip>✔ PC-1 VERIFIED 3/3</VerdictChip> hand-authored correct
          fix · three fresh stages · three distinct nonces · oracle exit 0 each
        </p>
        <EvidenceTable caption="Negative controls (fail exactly as they should)">
          <Row head="NC-1 · NC-1b · NC-3">
            <ErrorChip>✖ PATCH_FAILED</ErrorChip>
          </Row>
          <Row head="NC-6 · NC-7">
            <NeutralChip>■ INCONCLUSIVE</NeutralChip> injected faults (tamper /
            busy port)
          </Row>
          <Row head="NC-5">
            <NeutralChip>NOT_REPRODUCED</NeutralChip> · never VERIFIED
          </Row>
        </EvidenceTable>
        <div className="mt-3">
          <Note>
            Historical example: run <span className="mono">{ex.run}</span> at{' '}
            <span className="mono">{ex.approvedSha}</span>. {HISTORICAL.ownerQa.result}{' '}
            (against <span className="mono">{HISTORICAL.ownerQa.base}</span>).
          </Note>
        </div>
      </div>
      <div>
        <div className="mb-3">
          <label htmlFor="evjson" className="block font-semibold mb-1.5">
            Owner-imported evidence (optional)
          </label>
          <input
            type="file"
            id="evjson"
            accept=".json,application/json"
            aria-describedby="evhint"
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
          <p id="evhint" className="text-[13px] text-[#5b6068] m-0">
            Scoreboard or baseline JSON. Checked against the import allowlist
            first; unknown keys and oversize/deep/malformed files are refused
            with a typed error. No import can earn a trusted verdict:
            file-claimed verdicts are shown only as quoted claims.
          </p>
        </div>
        {busy && <LoadingState what="evidence JSON" />}
        {!busy && accepted === null && refusal === null && (
          <EmptyState>No file imported — historical example shown.</EmptyState>
        )}
        {!busy && refusal !== null && (
          <ErrorState message={refusal.message} recovery={refusal.recovery} />
        )}
        {!busy &&
          accepted !== null &&
          accepted.view.kind === 'scoreboard' && <ImportedScoreboard view={accepted.view} />}
        {!busy &&
          accepted !== null &&
          accepted.view.kind === 'baseline' && <ImportedBaseline view={accepted.view} />}
      </div>
    </ZoneSection>
  );
}
