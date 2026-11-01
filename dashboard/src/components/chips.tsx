// Status chips: text label plus text glyph, never color alone.
// Grayscale + dark cyan markers; red is reserved for errors and hard refusals.
const base =
  'inline-block px-2.5 py-0.5 rounded-full text-[13px] font-semibold border-[1.5px] mr-2 mb-2';

export function VerdictChip({ children }: { children: string }) {
  return (
    <span className={`${base} border-[#111111] text-[#111111]`}>
      {children}
    </span>
  );
}

export function UntrustedMarker({ qualifier }: { qualifier: string }) {
  return (
    <span className={`${base} border-[#0e87ad] text-[#0b6e87]`}>
      ⚠ UNTRUSTED — {qualifier}
    </span>
  );
}

export function UnverifiedImportChip() {
  return (
    <span className={`${base} border-[#0e87ad] text-[#0b6e87]`}>
      ◇ UNVERIFIED IMPORT — FILE-REPORTED VERDICT
    </span>
  );
}

export function NeutralChip({ children }: { children: string }) {
  return (
    <span className={`${base} border-[#9aa1ab] text-[#3d4148]`}>
      {children}
    </span>
  );
}

export function ErrorChip({ children }: { children: string }) {
  return (
    <span className={`${base} border-[#b91c1c] text-[#b91c1c]`}>
      {children}
    </span>
  );
}
