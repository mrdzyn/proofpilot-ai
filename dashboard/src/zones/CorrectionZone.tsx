import { HISTORICAL } from '../lib/historical.ts';
import { CodeBlock, EvidenceTable, Row, ZoneSection } from '../components/blocks.tsx';
import { UntrustedMarker } from '../components/chips.tsx';

const p = HISTORICAL.proposal;

export function CorrectionZone() {
  return (
    <ZoneSection
      id="z3"
      title="3 · Proposed Correction"
      tone="model"
      single
      blurb={
        <>
          <UntrustedMarker qualifier="NOT VERIFIED" /> Third and final Meta
          attempt. Documented text only — never loaded from the artifact store.
        </>
      }
    >
      <div>
        <CodeBlock
          label="Documented CSS adjustment, read-only text"
          code={p.renderedCss}
        />
      </div>
      <div>
        <EvidenceTable caption="Proposal record (from the reviewed execution report, §2)">
          <Row head="Adjustments">
            <>
              Exactly one: selector <span className="mono">{p.adjustment.selector}</span> ·
              property <span className="mono">{p.adjustment.property}</span> ·
              value <span className="mono">{p.adjustment.value}</span>
            </>
          </Row>
          <Row head="Tokens">{p.tokens}</Row>
          <Row head="Response">
            <>
              <span className="mono">
                {p.responseId.slice(0, 8)}…{p.responseId.slice(-8)}
              </span>{' '}
              · input {p.inputChars} chars · SHA-256{' '}
              <span className="mono">
                {p.inputSha256.slice(0, 8)}…{p.inputSha256.slice(-4)}
              </span>
            </>
          </Row>
          <Row head="Status">
            Accepted by the closed-grammar validator. Never staged, never run in
            a browser, never verified. Equal in value to hand-authored PC-1 —
            that equality transfers no verification.
          </Row>
        </EvidenceTable>
      </div>
    </ZoneSection>
  );
}
