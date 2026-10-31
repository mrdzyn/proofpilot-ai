import { AnalysisZone } from './zones/AnalysisZone.tsx';
import { CorrectionZone } from './zones/CorrectionZone.tsx';
import { EvidenceZone } from './zones/EvidenceZone.tsx';
import { RecordingZone } from './zones/RecordingZone.tsx';
import { VerificationZone } from './zones/VerificationZone.tsx';
import { HISTORICAL } from './lib/historical.ts';

export function App() {
  return (
    <div className="max-w-[1080px] mx-auto px-6 py-8">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:bg-[#111111] focus:text-white focus:px-4 focus:py-2 focus:rounded"
      >
        Skip to dashboard content
      </a>
      <header className="pt-10 pb-2 border-b-2 border-[#111111]">
        <p className="m-0 mb-2 text-sm text-[#3d4148]">
          Meta Global AI Developer Hackathon · Push the Frontier
        </p>
        <h1 className="m-0 mb-2 text-4xl leading-tight font-bold tracking-tight">
          ProofPilot AI — Local Demo Dashboard
        </h1>
        <p className="m-0 mb-4 text-lg text-[#3d4148]">
          Don&rsquo;t just fix the bug. Prove it&rsquo;s fixed.
        </p>
        <p className="m-0 font-mono text-[13px] text-[#3d4148]">
          <strong className="text-[#111111]">{HISTORICAL.commit}</strong> · F01
          synthetic fixture · historical record{' '}
          <span className="inline-block ml-3 px-2.5 py-0.5 border-[1.5px] border-[#111111] rounded-full text-xs font-semibold tracking-wide align-middle">
            LOCAL ONLY
          </span>
        </p>
      </header>
      <main id="main">
        <RecordingZone />
        <AnalysisZone />
        <CorrectionZone />
        <VerificationZone />
        <EvidenceZone />
        <section aria-label="Limitations" className="mt-10 border-t-2 border-[#111111] pt-4 text-sm text-[#3d4148]">
          <p>
            <strong>Limitations.</strong> Synthetic fixture only — no customer
            data, no real shop. A model hypothesis is not a verdict. The
            model&rsquo;s value equalling PC-1 proves nothing about the model
            and transfers no verification. Portal video rules and submission
            fields are verified separately in the signed-in event portal.
          </p>
        </section>
      </main>
      <footer className="mt-6 text-[13px] text-[#5b6068]">
        ProofPilot AI · UI-C3-01B local dashboard · historical values are reviewed
        records · no network, no backend, no secrets on this page
      </footer>
    </div>
  );
}
