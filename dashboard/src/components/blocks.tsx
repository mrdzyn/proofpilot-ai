import type { ReactNode } from 'react';

// Zone shell: real <section> with labelled heading; `tone` is model (gray wash +
// cyan top rule), evidence (white + black top rule), or neutral.
export function ZoneSection({
  id,
  title,
  blurb,
  tone,
  single,
  children,
}: {
  id: string;
  title: string;
  blurb: ReactNode;
  tone: 'model' | 'evidence' | 'neutral';
  single?: boolean;
  children: ReactNode;
}) {
  const head =
    tone === 'model'
      ? 'bg-[#f4f4f5] border-b border-[#9aa1ab] border-t-[3px] border-t-[#22c6f0]'
      : tone === 'evidence'
        ? 'bg-white border-b border-[#d8dce1] border-t-[3px] border-t-[#111111]'
        : 'bg-white border-b border-[#d8dce1]';
  return (
    <section
      aria-labelledby={id}
      className="mt-10 rounded-lg border border-[#d8dce1] overflow-hidden"
    >
      <div className={`px-5 py-4 ${head}`}>
        <h2 id={id} className="m-0 mb-1 text-xl font-semibold">
          {title}
        </h2>
        <div className="text-sm text-[#3d4148]">{blurb}</div>
      </div>
      <div
        className={`p-5 grid gap-5 grid-cols-1 ${single ? '' : 'lg:grid-cols-2'}`}
      >
        {children}
      </div>
    </section>
  );
}

export function EvidenceTable({
  caption,
  children,
}: {
  caption: string;
  children: ReactNode;
}) {
  return (
    <table className="w-full text-sm border-collapse">
      <caption className="text-left font-semibold pb-2">{caption}</caption>
      <tbody>{children}</tbody>
    </table>
  );
}

export function Row({ head, children }: { head: string; children: ReactNode }) {
  return (
    <tr className="border-t border-[#d8dce1] first:border-t-0">
      <th
        scope="row"
        className="text-left py-2 pr-2.5 align-top font-semibold whitespace-nowrap"
      >
        {head}
      </th>
      <td className="py-2 align-top">{children}</td>
    </tr>
  );
}

export function CodeBlock({
  label,
  code,
}: {
  label: string;
  code: string;
}) {
  return (
    <pre
      aria-label={label}
      className="bg-[#111111] text-[#f5f5f5] p-4 rounded-lg font-mono text-sm overflow-x-auto m-0"
    >
      <code>{code}</code>
    </pre>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="border-l-[3px] border-l-[#22c6f0] bg-[#f7f8fa] px-3 py-2 text-sm m-0">
      <strong>Note. </strong>
      {children}
    </p>
  );
}
