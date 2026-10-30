// C3-B2B P1 boundary (MAJOR-1 remediation): the neutral Zone P provenance module has a fixed, allow-listed
// transitive import set, can reach no network/credential/process/write capability, and Zone E still imports
// neither inference nor provenance code. No provider is contacted.
//
// The scanner below is a complete fail-closed import enumerator, not a regex snapshot: it strips comments,
// string literals and template literals (tracking `${}` nesting), then parses every remaining `import`,
// `export` and `require` occurrence — single- or double-quoted, static, side-effect, re-export, type-only,
// dynamic (literal, template or computed) and `require()` — and records anything it cannot resolve as an
// explicit violation instead of silently ignoring it. (The pinned TypeScript 7 toolchain is the native port
// with no compiler JS API, so this purpose-built complete parser stands in for the preferred AST analysis;
// every import form named in the MAJOR-1 audit is a mutation test below.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const MODULE = 'packages/provenance/src/provenance-input.ts';
const LEGACY_INPUT = 'packages/inference/src/live-input.ts';
const LEGACY_PIPELINE = 'packages/inference/src/patch-proposal.ts';

/** The complete transitive import set Zone P is allowed: the module itself, the core parser leaves (plus the
 *  type-only status leaf), the intake run-id check (plus its error leaf), and nothing else. Never expanded
 *  to make a test pass. */
const ALLOW_FILES = [
  'packages/provenance/src/provenance-input.ts',
  'packages/provenance/src/proposal-artifact.ts',
  'packages/provenance/src/source-provenance.ts',
  'packages/core/src/patch-proposal.ts',
  'packages/core/src/symptom.ts',
  'packages/core/src/f01-baseline.ts',
  'packages/core/src/status.ts',
  'packages/core/src/css-adjustments.ts',
  'packages/intake/src/consent.ts',
  'packages/intake/src/errors.ts',
].sort();
const ALLOW_BUILTINS = ['node:crypto', 'node:fs/promises', 'node:path'].sort();
/** Read-only filesystem members: a write here would break the read-only zone. `lstat` (P2, reviewed) reads
 *  metadata only and is required to refuse symlinks, which `stat` follows. `open` (P2 remediation, reviewed)
 *  is allowed only for the single no-follow read-only descriptor open asserted below. `realpath` (P2
 *  remediation, reviewed) resolves the read path for the post-read binding check and writes nothing. */
const ALLOW_FS_MEMBERS = ['lstat', 'open', 'readFile', 'readdir', 'realpath', 'stat'].sort();

const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
/** Source without comments, so prose that mentions a capability cannot trip a code-shape check. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

// ---------------------------------------------------------------- fail-closed import scanner

type Scan = {
  /** Resolved local edge `from -> to` (repo- or fixture-relative, posix). */
  edges: string[];
  builtins: string[];
  /** Bare package specifiers (forbidden in Zone P). */
  bare: string[];
  /** Every dynamic `import()` occurrence, literal or not. Rejected outright in Zone P. */
  dynamic: string[];
  /** `require()`, `import =`, import attributes and anything else the scanner cannot resolve. */
  unsupported: string[];
  /** `import x from` / `import type x from` occurrences (blanket-banned in Zone P: a member-smuggling form). */
  defaultImports: string[];
  /** `import * as` occurrences (blanket-banned in Zone P). */
  namespaceImports: string[];
  /** Any `node:fs` (not `node:fs/promises`) occurrence. */
  fsModule: string[];
  /** Constants-only `node:fs` uses (reviewed carve-out for numeric open flags). */
  fsConstantsOnly: string[];
  /** Named members imported from `node:fs/promises` (alias-resolved). */
  fsMembers: string[];
};

/** Mask comments, string literals and template literals to placeholders, keeping template `${}`
 *  spans as real code (recursively masked). Specifiers stay parseable via the placeholder table while
 *  imports hidden in comments, strings or templates can never leak keywords. Unterminated constructs
 *  are tokenizer violations (fail closed). */
function maskStrings(text: string, violations: string[], where: string): { masked: string; strings: string[] } {
  const strings: string[] = [];
  let out = '';
  let i = 0;
  const n = text.length;
  const spaces = (s: string) => s.replace(/[^\n]/g, ' ');
  const placeholder = (raw: string): string => {
    const inner = raw.slice(1, -1).replace(/\\(.)/g, '$1');
    strings.push(inner);
    return `"__S${strings.length - 1}__"`;
  };
  const stringAt = (quote: "'" | '"'): number => {
    let j = i + 1;
    while (j < n) {
      const c = text[j]!;
      if (c === '\\') { j += 2; continue; }
      if (c === quote) return j + 1;
      if (c === '\n') return -1;
      j++;
    }
    return -1;
  };
  const templateAt = (): number => {
    // collect literal chunks (masked to placeholders) and code spans separately
    let j = i + 1;
    let literal = '';
    const flushLiteral = () => {
      if (literal) {
        // re-quote as a plain double-quoted string for placeholder uniformity
        const raw = `"${literal}"`;
        out += placeholder(raw);
        literal = '';
      }
    };
    while (j < n) {
      const c = text[j]!;
      if (c === '\\') { literal += text.slice(j, j + 2); j += 2; continue; }
      if (c === '`') { flushLiteral(); return j + 1; }
      if (c === '$' && text[j + 1] === '{') {
        flushLiteral();
        out += '${';
        let depth = 1;
        let k = j + 2;
        while (k < n && depth > 0) {
          if (text[k] === '{') depth++;
          else if (text[k] === '}') depth--;
          k++;
        }
        const inner = maskStrings(text.slice(j + 2, k - 1), violations, where);
        for (const s of inner.strings) strings.push(s);
        out += inner.masked.replace(/__S(\d+)__/g, (_mm, num: string) => `__S${strings.length - inner.strings.length + Number(num)}__`);
        out += '}';
        j = k;
        continue;
      }
      if (c === '\n') { literal += c; j++; continue; }
      literal += c;
      j++;
    }
    return -1;
  };
  while (i < n) {
    const c = text[i]!;
    const d = text[i + 1];
    if (c === '/' && d === '/') {
      let j = i;
      while (j < n && text[j] !== '\n') j++;
      out += spaces(text.slice(i, j));
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      const j = text.indexOf('*/', i + 2);
      if (j < 0) {
        violations.push(`${where}: unterminated block comment`);
        out += spaces(text.slice(i));
        return { masked: out, strings };
      }
      out += spaces(text.slice(i, j + 2));
      i = j + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      const j = stringAt(c);
      if (j < 0) {
        violations.push(`${where}: unterminated string literal`);
        out += spaces(text.slice(i));
        return { masked: out, strings };
      }
      out += placeholder(text.slice(i, j));
      i = j;
      continue;
    }
    if (c === '`') {
      const j = templateAt();
      if (j < 0) {
        violations.push(`${where}: unterminated template literal`);
        out += spaces(text.slice(i));
        return { masked: out, strings };
      }
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return { masked: out, strings };
}

/** Resolve a parsed specifier through the placeholder table. */
function unmask(spec: string, strings: string[]): string {
  const mm = spec.match(/^__S(\d+)__$/);
  return mm ? strings[Number(mm[1])]! : spec;
}

const QUOTED = `(?:"([^"]*)"|'([^']*)')`;

/** Parse one stripped source file. Every `import`/`export`/`require` keyword is consumed or recorded. */
function scanSource(abs: string, label: string): { edges: string[]; scan: Scan } {
  const text = readFileSync(abs, 'utf8');
  const unsupported: string[] = [];
  const { masked: stripped, strings } = maskStrings(text, unsupported, label);
  const dir = path.posix.dirname(label);
  const edges: string[] = [];
  const scan: Scan = { edges, builtins: [], bare: [], dynamic: [], unsupported, defaultImports: [], namespaceImports: [], fsModule: [], fsConstantsOnly: [], fsMembers: [] };
  const consumed: Array<[number, number]> = [];
  const resolveLocal = (spec: string, at: string): string | null => {
    if (!spec.startsWith('.')) return null;
    if (!spec.endsWith('.ts')) {
      scan.unsupported.push(`${label}: extensionless relative import ${spec} at ${at}`);
      return null;
    }
    return path.posix.normalize(path.posix.join(dir, spec));
  };
  const builtin = (spec: string, at: string, clause: string) => {
    const namedMembers = (): string[] => {
      const out: string[] = [];
      const members = clause.replace(/^\s*\{/, '').replace(/\}\s*$/, '');
      for (const part of members.split(',')) {
        const pm = part.match(/^\s*(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+[A-Za-z_$][\w$]*)?\s*$/);
        const member = pm?.[1];
        if (member && !['as', 'type'].includes(member)) out.push(member);
      }
      return out;
    };
    if (spec === 'node:fs') {
      // Reviewed carve-out: the capability-free numeric-constants table only. Any other `node:fs`
      // member, default or namespace use stays a violation (default/namespace are flagged separately).
      const only = namedMembers();
      if (only.length > 0 && only.every((m) => m === 'constants')) scan.fsConstantsOnly.push(`${label}: constants-only ${spec}`);
      else scan.fsModule.push(`${label}: ${spec} at ${at}`);
      for (const m of only) if (m !== 'constants') scan.fsMembers.push(m);
      return;
    }
    scan.builtins.push(spec);
    if (spec === 'node:fs/promises') {
      for (const m of namedMembers()) scan.fsMembers.push(m);
    }
  };
  const formOf = (kind: 'import' | 'export', clause: string, spec: string, at: string) => {
    if (kind === 'import') {
      const body = clause.replace(/^\s*type\s+/, '').trim();
      if (body.startsWith('*')) scan.namespaceImports.push(`${label}: namespace import from ${spec}`);
      else if (/^[A-Za-z_$][\w$]*\s*(,|$)/.test(body) && !body.startsWith('{')) scan.defaultImports.push(`${label}: default import from ${spec}`);
    }
    const target = resolveLocal(spec, at);
    if (target) edges.push(`${label} -> ${target}`);
    else if (!spec.startsWith('.')) scan.bare.push(`${label} -> ${spec}`);
  };
  const master = /(?<![\w$.])(import\s*\.\s*meta|import\s*\(|require\s*\(|import\b|export\b)/g;
  let m: RegExpExecArray | null;
  while ((m = master.exec(stripped)) !== null) {
    const kw = m[1]!;
    const start = m.index;
    if (/^import\s*\.\s*meta/.test(kw)) {
      consumed.push([start, start + kw.length]);
      continue;
    }
    if (/^import\s*\($/.test(kw)) {
      let depth = 1;
      let j = start + kw.length;
      while (j < stripped.length && depth > 0) {
        if (stripped[j] === '(') depth++;
        else if (stripped[j] === ')') depth--;
        j++;
      }
      const arg = stripped.slice(start + kw.length, j - 1).trim();
      consumed.push([start, j]);
      const lit = arg.match(new RegExp(`^${QUOTED}$`));
      const target = lit ? unmask((lit[1] ?? lit[2])!, strings) : null;
      if (target && target.startsWith('.') && target.endsWith('.ts')) {
        const resolved = resolveLocal(target, `dynamic import`);
        scan.dynamic.push(`${label} -> ${target}`);
        if (resolved) edges.push(`${label} -> ${resolved}`);
      } else if (target && target.startsWith('node:')) {
        scan.dynamic.push(`${label} -> ${target}`);
        builtin(target, 'dynamic import', '');
      } else if (target) {
        scan.dynamic.push(`${label} -> ${target}`);
        scan.bare.push(`${label} -> ${target}`);
      } else {
        scan.dynamic.push(`${label} -> <computed>: ${arg.slice(0, 60)}`);
        scan.unsupported.push(`${label}: unresolvable dynamic import argument`);
      }
      continue;
    }
    if (/^require\s*\($/.test(kw)) {
      let depth = 1;
      let j = start + kw.length;
      while (j < stripped.length && depth > 0) {
        if (stripped[j] === '(') depth++;
        else if (stripped[j] === ')') depth--;
        j++;
      }
      const arg = stripped.slice(start + kw.length, j - 1).trim();
      consumed.push([start, j]);
      scan.unsupported.push(`${label}: require() is not a supported import form`);
      const lit = arg.match(new RegExp(`^${QUOTED}$`));
      const target = lit ? unmask((lit[1] ?? lit[2])!, strings) : null;
      if (target && target.startsWith('.') && target.endsWith('.ts')) {
        const resolved = resolveLocal(target, 'require()');
        if (resolved) edges.push(`${label} -> ${resolved}`);
      } else if (target && target.startsWith('node:')) {
        builtin(target, 'require()', '');
      } else if (target) {
        scan.bare.push(`${label} -> ${target}`);
      }
      continue;
    }
    // bare `import` or `export` keyword: take the clause up to the terminating `;`
    let j = start;
    while (j < stripped.length && stripped[j] !== ';') j++;
    const stmt = stripped.slice(start, Math.min(j + 1, stripped.length));
    consumed.push([start, Math.min(j + 1, stripped.length)]);
    const kind = kw === 'import' ? 'import' : 'export';
    const sideM = kind === 'import' ? stmt.match(new RegExp(`^\\s*import\\s*${QUOTED}\\s*;?$`)) : null;
    if (sideM) {
      const spec = unmask((sideM[1] ?? sideM[2])!, strings);
      if (spec.startsWith('node:')) {
        builtin(spec, 'side-effect import', '');
        continue;
      }
      const target = resolveLocal(spec, 'side-effect import');
      if (target) edges.push(`${label} -> ${target}`);
      else if (!spec.startsWith('.')) scan.bare.push(`${label} -> ${spec}`);
      continue;
    }
    const specM = stmt.match(new RegExp(`(?<![\\w$.])from\\s*${QUOTED}`));
    if (kind === 'import' && /^\s*import\s+[A-Za-z_$][\w$]*\s*=/.test(stmt)) {
      scan.unsupported.push(`${label}: import-equals declaration is not a supported import form`);
      continue;
    }
    if (!specM) {
      if (kind === 'export' && /^\s*export\s*(default\b|[{*]|\b(const|let|var|function|class|type|interface|abstract|async|declare)\b)/.test(stmt)) continue;
      scan.unsupported.push(`${label}: unresolvable ${kind} statement: ${stmt.slice(0, 80)}`);
      continue;
    }
    const spec = unmask((specM[1] ?? specM[2])!, strings);
    if (/\b(with|assert)\s*\{/.test(stmt)) scan.unsupported.push(`${label}: import attributes are not a supported import form`);
    const clause = stmt.slice(kind.length, stmt.indexOf(specM[0]));
    if (spec.startsWith('node:')) {
      builtin(spec, `${kind} clause`, clause);
      if (kind === 'export') {
        // Zone P forbids every builtin re-export: `export *` / `export * as` re-expose unlisted members
        // (including write-capable fs functions), and named re-exports add no provenance value.
        scan.unsupported.push(`${label}: re-export from builtin ${spec} is not permitted`);
      } else {
        const body = clause.replace(/^\s*type\s+/, '').trim();
        if (body.startsWith('*')) scan.namespaceImports.push(`${label}: namespace import from ${spec}`);
        else if (/^[A-Za-z_$][\w$]*\s*(,|$)/.test(body) && !body.startsWith('{')) scan.defaultImports.push(`${label}: default import from ${spec}`);
      }
      continue;
    }
    formOf(kind, clause, spec, `${kind} clause`);
  }
  // no silent skips: every remaining import/export/require keyword must be inside a consumed span
  const masked = stripped.split('').map((ch, idx) => (consumed.some(([a, b]) => idx >= a && idx < b) ? ' ' : ch)).join('');
  for (const left of masked.matchAll(/(?<![\w$.])(import|export|require)(?![\w$])/g)) {
    scan.unsupported.push(`${label}: unparsed import-like keyword at offset ${left.index}`);
  }
  scan.edges = [...new Set(edges)].sort();
  scan.builtins = [...new Set(scan.builtins)].sort();
  scan.bare = [...new Set(scan.bare)].sort();
  scan.fsMembers = [...new Set(scan.fsMembers)].sort();
  return { edges: scan.edges, scan };
}

type Closure = {
  files: string[];
  builtins: string[];
  bare: string[];
  dynamic: string[];
  unsupported: string[];
  defaultImports: string[];
  namespaceImports: string[];
  fsModule: string[];
  fsConstantsOnly: string[];
  fsMembers: string[];
};

/** Transitive closure of one entry file, following every enumerated edge. Missing targets are violations. */
function closureFrom(entryLabel: string): Closure {
  const files = new Set<string>();
  const out: Closure = { files: [], builtins: [], bare: [], dynamic: [], unsupported: [], defaultImports: [], namespaceImports: [], fsModule: [], fsConstantsOnly: [], fsMembers: [] };
  const merge = (s: Scan) => {
    for (const x of s.builtins) if (!out.builtins.includes(x)) out.builtins.push(x);
    for (const x of s.bare) if (!out.bare.includes(x)) out.bare.push(x);
    for (const x of s.dynamic) if (!out.dynamic.includes(x)) out.dynamic.push(x);
    for (const x of s.unsupported) if (!out.unsupported.includes(x)) out.unsupported.push(x);
    for (const x of s.defaultImports) if (!out.defaultImports.includes(x)) out.defaultImports.push(x);
    for (const x of s.namespaceImports) if (!out.namespaceImports.includes(x)) out.namespaceImports.push(x);
    for (const x of s.fsModule) if (!out.fsModule.includes(x)) out.fsModule.push(x);
    for (const x of s.fsConstantsOnly) if (!out.fsConstantsOnly.includes(x)) out.fsConstantsOnly.push(x);
    for (const x of s.fsMembers) if (!out.fsMembers.includes(x)) out.fsMembers.push(x);
  };
  const queue = [entryLabel];
  while (queue.length > 0) {
    const label = queue.pop()!;
    if (files.has(label)) continue;
    const abs = label.startsWith('/') ? label : path.join(root, label);
    if (!existsSync(abs)) {
      out.unsupported.push(`${label}: imported file does not exist`);
      continue;
    }
    files.add(label);
    const { edges, scan } = scanSource(abs, label);
    merge(scan);
    for (const e of edges) queue.push(e.split(' -> ')[1]!);
  }
  out.files = [...files].sort();
  out.builtins.sort();
  out.bare.sort();
  out.fsMembers.sort();
  return out;
}

const closureOf = (entry: string): Closure => closureFrom(entry);

/** A fixture tree outside the repository: absolute labels, resolved against its own root. */
function fixtureRoot(files: Record<string, string>): { dir: string; label: (name: string) => string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'pp-scan-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), content);
  return { dir, label: (name: string) => path.join(dir, name) };
}
const fixClosure = (dir: string, name: string) => closureFrom(path.join(dir, name));

/** The Zone P field policy: every violation reason for a scanned closure. Empty means the closure is allowed
 *  (the exact file-set equality is asserted separately for the real module, never for fixtures). */
function zonePViolations(c: Closure): string[] {
  const v: string[] = [];
  for (const b of c.builtins) if (!ALLOW_BUILTINS.includes(b)) v.push(`builtin not permitted: ${b}`);
  if (c.bare.length > 0) v.push(`bare imports: ${c.bare.join(', ')}`);
  if (c.dynamic.length > 0) v.push(`dynamic imports: ${c.dynamic.join(', ')}`);
  if (c.unsupported.length > 0) v.push(`unsupported forms: ${c.unsupported.join(', ')}`);
  if (c.defaultImports.length > 0) v.push(`default imports: ${c.defaultImports.join(', ')}`);
  if (c.namespaceImports.length > 0) v.push(`namespace imports: ${c.namespaceImports.join(', ')}`);
  if (c.fsModule.length > 0) v.push(`node:fs module: ${c.fsModule.join(', ')}`);
  for (const m of c.fsMembers) if (!ALLOW_FS_MEMBERS.includes(m)) v.push(`fs member not permitted: ${m}`);
  return v;
}

/** Every Zone P production entry module; their closures are unioned for the allow-list check. */
const ZONE_P_ENTRIES = [MODULE, 'packages/provenance/src/proposal-artifact.ts', 'packages/provenance/src/source-provenance.ts'];

function zonePUnion(): { union: Closure; closures: Closure[] } {
  const closures = ZONE_P_ENTRIES.map(closureOf);
  const union: Closure = { files: [], builtins: [], bare: [], dynamic: [], unsupported: [], defaultImports: [], namespaceImports: [], fsModule: [], fsConstantsOnly: [], fsMembers: [] };
  const add = (list: string[], x: string) => { if (!list.includes(x)) list.push(x); };
  for (const c of closures) {
    for (const f of c.files) add(union.files, f);
    for (const b of c.builtins) add(union.builtins, b);
    for (const b of c.bare) add(union.bare, b);
    for (const d of c.dynamic) add(union.dynamic, d);
    for (const u of c.unsupported) add(union.unsupported, u);
    for (const d of c.defaultImports) add(union.defaultImports, d);
    for (const n of c.namespaceImports) add(union.namespaceImports, n);
    for (const f of c.fsModule) add(union.fsModule, f);
    for (const f of c.fsConstantsOnly) add(union.fsConstantsOnly, f);
    for (const m of c.fsMembers) add(union.fsMembers, m);
  }
  union.files.sort();
  union.builtins.sort();
  union.bare.sort();
  union.fsMembers.sort();
  return { union, closures };
}

test('Zone P has exactly the allow-listed transitive import set: no network, provider, credential, env, process or write capability', () => {
  const { union: c, closures } = zonePUnion();
  for (const entry of closures) assert.deepEqual(zonePViolations(entry), [], 'each Zone P entry is individually clean');
  assert.deepEqual(c.files, ALLOW_FILES, 'the transitive file set is exactly the allow-list (never expanded)');
  assert.deepEqual(c.builtins, ALLOW_BUILTINS, 'only crypto, read-only fs and path builtins');
  assert.deepEqual(zonePViolations(c), [], 'no bare, dynamic, unsupported, default/namespace, node:fs or write-capable fs import');
  // Reviewed carve-out: exactly one constants-only `node:fs` use, in the artifact loader, feeding the
  // no-follow open below. Anything else from `node:fs` is an fsModule violation (asserted in zonePViolations).
  assert.deepEqual(c.fsConstantsOnly, ['packages/provenance/src/proposal-artifact.ts: constants-only node:fs']);
  // The single `open(` in Zone P must be the read-only no-follow descriptor open.
  const openSites: string[] = [];
  for (const f of c.files) {
    const text = read(f);
    for (const m of text.matchAll(/(?<![\w$.])open\s*\(/g)) {
      const end = text.indexOf(';', m.index);
      openSites.push(`${f}: ${text.slice(m.index, end === -1 ? m.index + 80 : end)}`);
    }
  }
  assert.equal(openSites.length, 1, `a single descriptor open in Zone P: ${JSON.stringify(openSites)}`);
  assert.match(openSites[0]!, /O_RDONLY/, 'read-only');
  assert.match(openSites[0]!, /O_NOFOLLOW/, 'no-follow');
  assert.match(openSites[0]!, /O_NONBLOCK/, 'never blocks on a FIFO');
  // `realpath` appears only for the post-read binding comparison (root and file), never as a write path.
  const realSites: string[] = [];
  for (const f of c.files) {
    const text = read(f);
    for (const m of text.matchAll(/(?<![\w$.])realpath\s*\(/g)) {
      const end = text.indexOf(';', m.index);
      realSites.push(`${f}: ${text.slice(m.index, end === -1 ? m.index + 80 : end)}`);
    }
  }
  assert.equal(realSites.length, 2, `realpath only binds the read path: ${JSON.stringify(realSites)}`);
  assert.ok(realSites.every((s) => s.startsWith('packages/provenance/src/proposal-artifact.ts:')));
  for (const f of c.files) {
    const text = code(read(f));
    assert.doesNotMatch(text, /process\.(env|argv|cwd|exit|stdin|stdout)/, f);
    assert.doesNotMatch(text, /(?<![A-Za-z_.])fetch\s*\(/, f);
    assert.doesNotMatch(text, /child_process|execFile|spawnSync|\bspawn\b/, f);
    assert.doesNotMatch(text, /writeFile|appendFile|mkdir|rm\s*\(|unlink|rename|copyFile|chmod|createWriteStream|\.open\s*\(/, f);
    assert.doesNotMatch(text, /\beval\s*\(|new Function/, f);
    assert.doesNotMatch(text, /node:(net|http|https|dgram|tls|dns|worker_threads|cluster)/, f);
    assert.doesNotMatch(text, /structuredResponse|createProvider|apiKey|credential|reservation|quota/i, f);
  }
});

test('the legacy live-input.ts adds no capability beyond one re-export edge', () => {
  const input = closureOf(LEGACY_INPUT);
  const inner = closureOf(MODULE);
  assert.deepEqual(input.files, [LEGACY_INPUT, ...inner.files].sort(), 'the shim reaches exactly the neutral module closure and nothing else');
  assert.deepEqual(input.builtins, inner.builtins);
  assert.deepEqual(zonePViolations(input), [], 'the shim introduces no new import form');
});

test('the check discriminates, statically and dynamically: the inference pipeline violates the allow-list (negative control)', () => {
  const pipe = closureOf(LEGACY_PIPELINE);
  assert.ok(pipe.files.some((f) => /inference\/src\/(reservations|config|client)\.ts/.test(f)), 'static imports reach reservation, config and client capabilities');
  assert.ok(pipe.dynamic.some((d) => d.endsWith('proposal-orchestrator.ts')), 'the lazy production-runner import is followed');
  assert.ok(pipe.files.some((f) => f.endsWith('proposal-orchestrator.ts')), '... and its dynamic target is in the closure');
  assert.ok(zonePViolations(pipe).length > 0, 'the pipeline is rejected by the Zone P policy');
  assert.notDeepEqual(pipe.files, ALLOW_FILES, 'the pipeline genuinely violates the allow-list, so the check is not vacuous');
});

test('the legacy live-input.ts is a pure delegation shim: one re-export, no logic of its own', () => {
  const c = closureOf(LEGACY_INPUT);
  assert.deepEqual(c.files.filter((f) => f !== LEGACY_INPUT), closureOf(MODULE).files, 'the shim re-exports exactly the neutral module');
  const text = read(LEGACY_INPUT);
  assert.doesNotMatch(code(text), /\bfunction\b|\bconst\b|\bclass\b|\bimport\s*\(/);
  assert.match(text, /^export \* from '\.\.\/\.\.\/provenance\/src\/provenance-input\.ts';$/m);
});

test('Zone E stays separate: staging, the coordinator and the E1 bridge import no inference or provenance code', () => {
  for (const f of ['packages/core/src/candidate-stage.ts', 'packages/core/src/candidate-coordinator.ts', 'packages/core/src/model-proposal.ts', 'packages/core/src/model-verification.ts']) {
    assert.doesNotMatch(code(read(f)), /inference\/src|packages\/provenance|provenance-input/, f);
  }
});

test('E1 bridge has a minimal direct edge: only the core grammar leaf and the single identity function', () => {
  const f = 'packages/core/src/model-proposal.ts';
  const text = code(read(f));
  const specs = [...new Set([...text.matchAll(/from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!))].sort();
  assert.deepEqual(specs, ['./candidate-coordinator.ts', './css-adjustments.ts'], 'no other module edge out of the bridge');
  assert.doesNotMatch(text, /import\s*\(|require\s*\(/, 'no dynamic import or require in the bridge');
  assert.doesNotMatch(text, /node:/, 'no builtin import in the bridge (identity and rendering delegate to the leaves)');
  const c = closureOf(f);
  assert.ok(!c.files.some((x) => /inference\/src|packages\/provenance/.test(x)), 'the bridge closure reaches no inference or provenance file');
});

test('E2 verifier has a minimal direct edge: grammar, stage, coordinator and the E1 bridge only', () => {
  const f = 'packages/core/src/model-verification.ts';
  const text = code(read(f));
  const specs = [...new Set([...text.matchAll(/from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!))].sort();
  assert.deepEqual(
    specs,
    ['./candidate-coordinator.ts', './candidate-stage.ts', './css-adjustments.ts', './model-proposal.ts', 'node:fs/promises', 'node:path'],
    'no other module edge out of the E2 module',
  );
  assert.doesNotMatch(text, /import\s*\(|require\s*\(/, 'no dynamic import or require in the E2 module');
  const c = closureOf(f);
  assert.ok(!c.files.some((x) => /inference\/src|packages\/provenance/.test(x)), 'the E2 closure reaches no inference or provenance file');
});

test('E2 command is narrow and hard-disabled: five explicit SHAs/ids, no env, no execution switch, real artifact refused', () => {
  const f = 'scripts/c3-b2b-verify-proposal.ts';
  const text = code(read(f));
  for (const opt of ['run-id', 'source-sha', 'source-fixture-tree', 'source-analysis-id', 'verification-sha']) {
    assert.match(text, new RegExp(`['"]${opt}['"]`), `explicit --${opt} parameter`);
  }
  assert.doesNotMatch(text, /process\.env/, 'the command never reads the environment');
  assert.doesNotMatch(text, /--execute|['"]execute['"]/, 'no blanket execution flag exists');
  assert.doesNotMatch(text, /packages\/inference|inference\/src/, 'no inference import');
  assert.doesNotMatch(text, /baseten|modal|apiKey|api_key/i, 'no provider or credential capability');
  assert.match(text, /c3-live-meta-001/, ' the real run id is named');
  assert.match(text, /HARD-DISABLED/, 'the hard-disable names itself');
  assert.match(text, /REAL_ARTIFACT_MESSAGE/, 'refusal precedes every file read, stage and Git call');
  assert.match(text, /sourceAttestation/, 'the Zone P attestation travels with the run and is persisted');
  assert.match(text, /modelVerificationProblems/, 'the command revalidates the persisted bundle before reporting');
});

// ---------------------------------------------------------------- mutation tests: the scanner rejects every missed form

test('mutation: double-quoted static imports and re-exports are enumerated', () => {
  const { dir } = fixtureRoot({
    'a.ts': 'import { x } from "./b.ts";\nexport { y } from "./c.ts";\nvoid x;\nvoid y;\n',
    'b.ts': 'export const x = 1;\n',
    'c.ts': 'export const y = 2;\n',
  });
  const c = fixClosure(dir, 'a.ts');
  assert.ok(c.files.some((f) => f.endsWith('/b.ts')), 'double-quoted import followed');
  assert.ok(c.files.some((f) => f.endsWith('/c.ts')), 'double-quoted re-export followed');
  assert.deepEqual(zonePViolations(c), [], 'legitimate relative edges are not violations');
});

test('mutation: double-quoted side-effect imports are enumerated, including node:fs', () => {
  const { dir } = fixtureRoot({
    'a.ts': 'import "./b.ts";\nimport "node:fs";\n',
    'b.ts': 'export const x = 1;\n',
  });
  const c = fixClosure(dir, 'a.ts');
  assert.ok(c.files.some((f) => f.endsWith('/b.ts')), 'side-effect import followed');
  assert.ok(!c.builtins.includes('node:fs'), 'node:fs is never treated as a permitted builtin');
  assert.ok(c.fsModule.length === 1, 'side-effect node:fs recorded as an fs-module violation');
  assert.ok(zonePViolations(c).some((v) => v.includes('node:fs')), 'node:fs is rejected by the policy');
});

test('mutation: double-quoted literal dynamic imports are followed but rejected outright', () => {
  const { dir } = fixtureRoot({
    'a.ts': 'import "./b.ts";\nexport async function f() { return import("./c.ts"); }\n',
    'b.ts': 'export const x = 1;\n',
    'c.ts': 'export const y = 2;\n',
  });
  const c = fixClosure(dir, 'a.ts');
  assert.ok(c.files.some((f) => f.endsWith('/c.ts')), 'the literal dynamic target is followed');
  assert.ok(c.dynamic.some((d) => d.endsWith('./c.ts')), 'the dynamic import is recorded');
  assert.ok(zonePViolations(c).some((v) => v.startsWith('dynamic imports:')), 'any dynamic import is rejected');
});

test('mutation: computed and template dynamic imports fail closed as unresolvable', () => {
  const { dir } = fixtureRoot({
    'a.ts': 'export async function f(m: string, name: string) {\n  const a = await import(m);\n  const b = await import(`./${name}.ts`);\n  return [a, b];\n}\n',
  });
  const c = fixClosure(dir, 'a.ts');
  assert.equal(c.dynamic.length, 2, 'both computed forms recorded');
  assert.ok(c.unsupported.some((u) => u.includes('unresolvable dynamic import')), 'computed arguments are unsupported');
  assert.ok(zonePViolations(c).some((v) => v.startsWith('dynamic imports:')), 'rejected by the policy');
});

test('mutation: write-capable filesystem imports are detected, including aliases', () => {
  const { dir } = fixtureRoot({
    'a.ts': 'import { readFile, writeFile as wf } from "node:fs/promises";\nexport const f = [readFile, wf];\n',
  });
  const c = fixClosure(dir, 'a.ts');
  assert.ok(c.fsMembers.includes('readFile'), 'read member enumerated');
  assert.ok(c.fsMembers.includes('writeFile'), 'aliased write member resolved to its true name');
  assert.ok(zonePViolations(c).some((v) => v === 'fs member not permitted: writeFile'), 'write member rejected');
});

test('mutation: default and namespace imports are blanket-banned, and node:fs default import is rejected', () => {
  const { dir } = fixtureRoot({
    'a.ts': 'import * as p from "node:path";\nimport q from "node:crypto";\nimport fs from "node:fs";\nexport const v = [p, q, fs];\n',
  });
  const c = fixClosure(dir, 'a.ts');
  assert.equal(c.namespaceImports.length, 1, 'namespace import recorded');
  assert.equal(c.defaultImports.length, 2, 'both default imports recorded');
  const v = zonePViolations(c);
  assert.ok(v.some((x) => x.startsWith('namespace imports:')), 'namespace rejected');
  assert.ok(v.some((x) => x.startsWith('default imports:')), 'default rejected');
  assert.ok(v.some((x) => x.includes('node:fs')), 'node:fs default import rejected');
});

test('mutation: require() and import attributes are unsupported, but literal targets are still followed', () => {
  const { dir } = fixtureRoot({
    'a.ts': 'const x = require("./b.ts");\nimport { data } from "./c.ts" with { type: "json" };\nmodule.exports = [x, data];\n',
    'b.ts': 'export const x = 1;\n',
    'c.ts': 'export const y = 2;\n',
  });
  const c = fixClosure(dir, 'a.ts');
  assert.ok(c.files.some((f) => f.endsWith('/b.ts')), 'require() target followed for completeness');
  assert.ok(c.files.some((f) => f.endsWith('/c.ts')), 'attributed import target followed for completeness');
  assert.ok(c.unsupported.some((u) => u.includes('require()')), 'require() rejected');
  assert.ok(c.unsupported.some((u) => u.includes('import attributes')), 'import attributes rejected');
  assert.ok(zonePViolations(c).some((v) => v.startsWith('unsupported forms:')), 'rejected by the policy');
});

test('mutation: wildcard, namespace and named re-exports from an fs builtin are rejected', () => {
  const { dir } = fixtureRoot({
    'w.ts': 'export * from "node:fs/promises";\n',
    'n.ts': 'export * as fs from "node:fs/promises";\n',
    'r.ts': 'export { readFile } from "node:fs/promises";\n',
  });
  for (const name of ['w.ts', 'n.ts', 'r.ts']) {
    const { scan } = scanSource(path.join(dir, name), path.join(dir, name));
    assert.ok(scan.unsupported.some((u) => u.includes('re-export from builtin node:fs/promises')), `${name}: builtin re-export recorded`);
    assert.ok(zonePViolations(fixClosure(dir, name)).some((v) => v.includes('re-export from builtin')), `${name}: rejected by the policy`);
  }
});

test('mutation: a named read-only fs import remains permitted (positive control)', () => {
  const { dir } = fixtureRoot({
    'a.ts': 'import { readFile } from "node:fs/promises";\nexport const f = readFile;\n',
  });
  const c = fixClosure(dir, 'a.ts');
  assert.deepEqual(c.fsMembers, ['readFile']);
  assert.deepEqual(zonePViolations(c), [], 'named read-only import is not a violation');
});

test('mutation: a legitimate type-only import is permitted and followed', () => {
  const { dir } = fixtureRoot({
    'a.ts': 'import type { T } from "./b.ts";\nexport const x: T = 1;\n',
    'b.ts': 'export type T = number;\n',
  });
  const c = fixClosure(dir, 'a.ts');
  assert.ok(c.files.some((f) => f.endsWith('/b.ts')), 'type-only edge followed');
  assert.deepEqual(zonePViolations(c), [], 'type-only import is not a violation');
});

test('mutation: imports hidden in comments, strings and templates are not enumerated', () => {
  const { dir } = fixtureRoot({
    'a.ts': '// import "node:fs";\n/* require("./evil.ts"); await import(m); */\nconst s = "from \'./nope.ts\'";\nconst t = `import x from "./nope2.ts"`;\nexport const x = [s, t];\n',
  });
  const c = fixClosure(dir, 'a.ts');
  assert.deepEqual(c.files, [path.join(dir, 'a.ts')], 'no phantom edges');
  assert.deepEqual(zonePViolations(c), [], 'no phantom violations');
  assert.deepEqual(c.builtins, [], 'no phantom builtins');
});
