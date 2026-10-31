import { HISTORICAL } from '../lib/historical.ts';
import {
  CodeBlock,
  EvidenceTable,
  Row,
  ZoneSection,
} from '../components/blocks.tsx';
import { ErrorChip, NeutralChip } from '../components/chips.tsx';

export function EvidenceZone() {
  return (
    <ZoneSection
      id="z5"
      title="5 · Evidence & Security"
      tone="neutral"
      blurb="Read-only inspection states. What is shown, what is refused, and what remains open."
    >
      <div>
        <EvidenceTable caption="Run identity and availability">
          <Row head="Commit">
            <span className="mono">{HISTORICAL.commit}</span> (PR #24)
          </Row>
          <Row head="CI">
            Common validation + Stack validation green on merged PRs #19–#24
          </Row>
          <Row head="Replays">PC-1: 3 attempted, 3 passed · baseline gate certified</Row>
          <Row head="Lifetime quota">
            {HISTORICAL.guardrails.quota}
          </Row>
        </EvidenceTable>
      </div>
      <div>
        <EvidenceTable caption="Limitations and refusals">
          <Row head="Real proposal">
            <>
              <ErrorChip>⛔ HARD-DISABLED</ErrorChip> executing{' '}
              <span className="mono">{HISTORICAL.proposal.runId}</span> needs a
              separate owner decision, enrollment, and security review — none
              granted.
            </>
          </Row>
          <Row head="Residuals">
            Same-UID writer residual and unsigned-artifact origin NOT accepted
            (owner decision open).
          </Row>
          <Row head="Billing">
            Actual account charge unverified. Token counts are not costs.
          </Row>
          <Row head="Sandbox">
            Staging harness is a spike, not a sandbox. No model HTML/JS ever
            runs. <NeutralChip>LOCAL ONLY</NeutralChip>
          </Row>
        </EvidenceTable>
        <div className="mt-3">
          <CodeBlock
            label="Real-artifact refusal, read-only text"
            code={HISTORICAL.guardrails.refusal}
          />
          <p className="text-sm mt-2 mb-0">
            Exit code {HISTORICAL.guardrails.exitCode}. The stored model
            proposal is never staged, loaded, or executed here.
          </p>
        </div>
      </div>
    </ZoneSection>
  );
}
