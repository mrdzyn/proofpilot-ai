import { HISTORICAL } from '../lib/historical.ts';
import { EvidenceTable, Note, Row, ZoneSection } from '../components/blocks.tsx';
import { NeutralChip, UntrustedMarker } from '../components/chips.tsx';

export function AnalysisZone() {
  return (
    <ZoneSection
      id="z2"
      title="2 · Muse Spark Analysis"
      tone="model"
      blurb={
        <>
          <UntrustedMarker qualifier="MODEL HYPOTHESIS" /> Strictly validated
          text. Never a verdict.
        </>
      }
    >
      <div>
        <p>
          <NeutralChip>Analysis 1 of 2 · INCOMPLETE · discarded</NeutralChip>
        </p>
        <EvidenceTable caption={`Run ${HISTORICAL.run001.id} (historical)`}>
          <Row head="Provider status">{HISTORICAL.run001.providerStatus}</Row>
          <Row head="Local result">{HISTORICAL.run001.localResult}</Row>
          <Row head="Usage">{HISTORICAL.run001.usage}</Row>
        </EvidenceTable>
      </div>
      <div>
        <p>
          <UntrustedMarker qualifier="Analysis 2 of 2 · VIDEO_ANALYZED" />
        </p>
        <EvidenceTable caption={`Run ${HISTORICAL.run002.id} (historical)`}>
          <Row head="Symptom">{HISTORICAL.run002.symptom}</Row>
          <Row head="Usage">{HISTORICAL.run002.usage}</Row>
          <Row head="Remote file">{HISTORICAL.run002.remoteFile}</Row>
        </EvidenceTable>
        <div className="mt-3">
          <Note>
            Consistent with F01, but does not establish the overlay as root cause
            and proves no fix.
          </Note>
        </div>
      </div>
    </ZoneSection>
  );
}
