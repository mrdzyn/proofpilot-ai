// Bounded validating parser for dashboard JSON evidence imports.
// One pass: lexical JSON parse with duplicate-key refusal and container-depth
// bound (root object = depth 1; the committed example reaches depth 6;
// refuse depth > 8), then exact-key schema validation, then view-model projection.
// Rendering reads only the projected view-model, never the raw file.

import {
  DashboardImportError,
  type BaselineView,
  type ImportedView,
  type ScoreboardView,
} from './types.ts';

export const MAX_FILE_CHARS = 262_144;
const MAX_STRING_CHARS = 4_096;
const MAX_ARRAY_ITEMS = 64;
const MAX_REPLAYS = 8;
const MAX_DEPTH = 8;
const HEX40 = /^[0-9a-f]{40}$/;

const CANDIDATE_STATUSES = new Set([
  'VERIFIED',
  'PATCH_FAILED',
  'INCONCLUSIVE',
  'NOT_REPRODUCED',
  'ORACLE_PASS',
]);
const REPLAY_OUTCOMES = new Set(['ORACLE_PASS', 'PATCH_FAILED', 'INCONCLUSIVE']);
const VERDICTS = new Set(['REPRODUCED', 'NOT_REPRODUCED', 'INCONCLUSIVE']);
const REGRESSIONS = new Set(['PASS', 'FAIL', 'NOT_RUN']);

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

interface Cursor {
  text: string;
  pos: number;
  depth: number;
}

function fail(code: 'MALFORMED_JSON' | 'DUPLICATE_KEY' | 'TOO_DEEP' | 'STRING_TOO_LONG' | 'TOO_MANY_ITEMS', message: string): never {
  throw new DashboardImportError(code, message);
}

function skipWs(c: Cursor): void {
  while (c.pos < c.text.length) {
    const ch = c.text[c.pos];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') c.pos += 1;
    else break;
  }
}

function parseString(c: Cursor): string {
  // c.text[c.pos] === '"'
  let out = '';
  c.pos += 1;
  for (;;) {
    if (c.pos >= c.text.length) fail('MALFORMED_JSON', 'unterminated string');
    const ch = c.text[c.pos] as string;
    if (ch === '"') {
      c.pos += 1;
      if (out.length > MAX_STRING_CHARS) fail('STRING_TOO_LONG', 'string exceeds 4096 characters');
      return out;
    }
    if (ch === '\\') {
      const esc = c.text[c.pos + 1];
      if (esc === undefined) fail('MALFORMED_JSON', 'bad escape at end of input');
      if (esc === 'u') {
        const hex = c.text.slice(c.pos + 2, c.pos + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('MALFORMED_JSON', 'bad unicode escape');
        out += String.fromCharCode(parseInt(hex, 16));
        c.pos += 6;
      } else {
        const simple: Record<string, string> = {
          '"': '"',
          '\\': '\\',
          '/': '/',
          b: '\b',
          f: '\f',
          n: '\n',
          r: '\r',
          t: '\t',
        };
        const rep = simple[esc];
        if (rep === undefined) fail('MALFORMED_JSON', `bad escape \\${esc}`);
        out += rep;
        c.pos += 2;
      }
    } else {
      if (ch < ' ') fail('MALFORMED_JSON', 'unescaped control character in string');
      out += ch;
      c.pos += 1;
    }
  }
}

function parseNumber(c: Cursor): number {
  const m = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(c.text.slice(c.pos));
  if (!m) fail('MALFORMED_JSON', 'bad number');
  const digits: string | undefined = m[0];
  if (digits === undefined) fail('MALFORMED_JSON', 'bad number');
  c.pos += digits.length;
  const n = Number(digits);
  if (!Number.isFinite(n)) fail('MALFORMED_JSON', 'non-finite number');
  return n;
}

function parseValue(c: Cursor, depth: number): Json {
  if (depth > MAX_DEPTH) fail('TOO_DEEP', `nesting exceeds depth ${String(MAX_DEPTH)}`);
  skipWs(c);
  const ch = c.text[c.pos];
  if (ch === '{') return parseObject(c, depth);
  if (ch === '[') return parseArray(c, depth);
  if (ch === '"') return parseString(c);
  if (ch === 't' && c.text.startsWith('true', c.pos)) {
    c.pos += 4;
    return true;
  }
  if (ch === 'f' && c.text.startsWith('false', c.pos)) {
    c.pos += 5;
    return false;
  }
  if (ch === 'n' && c.text.startsWith('null', c.pos)) {
    c.pos += 4;
    return null;
  }
  if (ch === '-' || (ch !== undefined && ch >= '0' && ch <= '9')) return parseNumber(c);
  fail('MALFORMED_JSON', `unexpected character ${ch ?? 'end of input'}`);
}

function parseObject(c: Cursor, depth: number): { [k: string]: Json } {
  c.pos += 1; // {
  const out: { [k: string]: Json } = {};
  skipWs(c);
  if (c.text[c.pos] === '}') {
    c.pos += 1;
    return out;
  }
  for (;;) {
    skipWs(c);
    if (c.text[c.pos] !== '"') fail('MALFORMED_JSON', 'object key must be a string');
    const key = parseString(c);
    if (Object.prototype.hasOwnProperty.call(out, key)) fail('DUPLICATE_KEY', `duplicate key ${JSON.stringify(key)}`);
    skipWs(c);
    if (c.text[c.pos] !== ':') fail('MALFORMED_JSON', 'expected colon after object key');
    c.pos += 1;
    out[key] = parseValue(c, depth + 1);
    skipWs(c);
    const next = c.text[c.pos];
    if (next === ',') {
      c.pos += 1;
      continue;
    }
    if (next === '}') {
      c.pos += 1;
      return out;
    }
    fail('MALFORMED_JSON', 'expected comma or closing brace in object');
  }
}

function parseArray(c: Cursor, depth: number): Json[] {
  c.pos += 1; // [
  const out: Json[] = [];
  skipWs(c);
  if (c.text[c.pos] === ']') {
    c.pos += 1;
    return out;
  }
  for (;;) {
    out.push(parseValue(c, depth + 1));
    if (out.length > MAX_ARRAY_ITEMS) fail('TOO_MANY_ITEMS', 'array exceeds 64 items');
    skipWs(c);
    const next = c.text[c.pos];
    if (next === ',') {
      c.pos += 1;
      continue;
    }
    if (next === ']') {
      c.pos += 1;
      return out;
    }
    fail('MALFORMED_JSON', 'expected comma or closing bracket in array');
  }
}

export function parseBoundedJson(text: string): Json {
  if (text.length === 0) throw new DashboardImportError('EMPTY', 'file is empty');
  if (text.length > MAX_FILE_CHARS) throw new DashboardImportError('TOO_LARGE', 'file exceeds 256 KiB');
  const c: Cursor = { text, pos: 0, depth: 0 };
  const value = parseValue(c, 1);
  skipWs(c);
  if (c.pos !== c.text.length) throw new DashboardImportError('MALFORMED_JSON', 'trailing content after JSON value');
  return value;
}

// --- schema validation (exact keys; unknown keys refuse) ---

function isRecord(v: Json): v is { [k: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function shapeError(what: string): never {
  throw new DashboardImportError('BAD_SHAPE', `schema mismatch: ${what}`);
}

function field(obj: { [k: string]: Json }, key: string): Json {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) shapeError(`missing key ${JSON.stringify(key)}`);
  return obj[key] as Json;
}

function checkKeys(obj: { [k: string]: Json }, want: readonly string[], what: string): void {
  const keys = Object.keys(obj);
  if (keys.length !== want.length || !want.every((k) => Object.prototype.hasOwnProperty.call(obj, k))) {
    shapeError(`${what} must have exactly keys [${want.join(', ')}]`);
  }
}

function asString(v: Json, what: string): string {
  if (typeof v !== 'string') shapeError(`${what} must be a string`);
  return v as string;
}

function asNumber(v: Json, what: string): number {
  if (typeof v !== 'number') shapeError(`${what} must be a number`);
  return v as number;
}

function asBoolean(v: Json, what: string): boolean {
  if (typeof v !== 'boolean') shapeError(`${what} must be a boolean`);
  return v as boolean;
}

function asArray(v: Json, what: string): Json[] {
  if (!Array.isArray(v)) shapeError(`${what} must be an array`);
  return v as Json[];
}

function asStringArray(v: Json, what: string): string[] {
  return asArray(v, what).map((e, i) => asString(e, `${what}[${String(i)}]`));
}

function oneOf(v: Json, set: Set<string>, what: string): string {
  const s = asString(v, what);
  if (!set.has(s)) shapeError(`${what} must be one of ${[...set].join(', ')}`);
  return s;
}

function checkReplay(replay: Json, what: string): void {
  if (!isRecord(replay)) shapeError(`${what} must be an object`);
  checkKeys(replay, [
    'n',
    'outcome',
    'failureCode',
    'failureMessage',
    'oracleExitCode',
    'evidenceDir',
    'recordSha256',
    'candidateCssSha256',
    'nonce',
    'mobile',
    'desktop',
    'servedCssSha256',
    'evidenceFinalized',
    'evidenceProblems',
  ], what);
  asNumber(field(replay, 'n'), `${what}.n`);
  oneOf(field(replay, 'outcome'), REPLAY_OUTCOMES, `${what}.outcome`);
  const fc = field(replay, 'failureCode');
  if (fc !== null && typeof fc !== 'string') shapeError(`${what}.failureCode must be string or null`);
  const fm = field(replay, 'failureMessage');
  if (fm !== null && typeof fm !== 'string') shapeError(`${what}.failureMessage must be string or null`);
  const exit = field(replay, 'oracleExitCode');
  if (exit !== null && typeof exit !== 'number') shapeError(`${what}.oracleExitCode must be number or null`);
  asString(field(replay, 'evidenceDir'), `${what}.evidenceDir`);
  asString(field(replay, 'recordSha256'), `${what}.recordSha256`);
  // Null when staging never completed (e.g. NC-7 busy-port: no CSS staged).
  const stagedCss = field(replay, 'candidateCssSha256');
  if (stagedCss !== null && typeof stagedCss !== 'string') shapeError(`${what}.candidateCssSha256 must be string or null`);
  const nonce = field(replay, 'nonce');
  if (nonce !== null && typeof nonce !== 'string') shapeError(`${what}.nonce must be string or null`);
  for (const side of ['mobile', 'desktop'] as const) {
    const m = field(replay, side);
    if (m === null) continue; // fault-injected replays never ran the browser
    if (!isRecord(m)) shapeError(`${what}.${side} must be an object or null`);
    checkKeys(m, ['status', 'hitTestTarget', 'cartCountAfter'], `${what}.${side}`);
    asString(field(m, 'status'), `${what}.${side}.status`);
    const hit = field(m, 'hitTestTarget');
    if (hit !== null && typeof hit !== 'string') shapeError(`${what}.${side}.hitTestTarget must be string or null`);
    const cart = field(m, 'cartCountAfter');
    if (cart !== null && typeof cart !== 'string') shapeError(`${what}.${side}.cartCountAfter must be string or null`);
  }
  asStringArray(field(replay, 'servedCssSha256'), `${what}.servedCssSha256`);
  asBoolean(field(replay, 'evidenceFinalized'), `${what}.evidenceFinalized`);
  asStringArray(field(replay, 'evidenceProblems'), `${what}.evidenceProblems`);
}

function checkCandidate(candidate: Json, what: string): { id: string; description: string; status: string; replaysPassed: number; replaysAttempted: number } {
  if (!isRecord(candidate)) shapeError(`${what} must be an object`);
  checkKeys(candidate, [
    'id',
    'description',
    'provenance',
    'candidateId',
    'adjustments',
    'renderedCss',
    'fault',
    'replaysRequired',
    'replaysAttempted',
    'replaysPassed',
    'status',
    'reason',
    'expected',
    'expectationMet',
    'expectationProblems',
    'replays',
  ], what);
  const id = asString(field(candidate, 'id'), `${what}.id`);
  const description = asString(field(candidate, 'description'), `${what}.description`);
  asString(field(candidate, 'provenance'), `${what}.provenance`);
  asString(field(candidate, 'candidateId'), `${what}.candidateId`);
  for (const [i, adj] of asArray(field(candidate, 'adjustments'), `${what}.adjustments`).entries()) {
    if (!isRecord(adj)) shapeError(`${what}.adjustments[${String(i)}] must be an object`);
    checkKeys(adj, ['selector', 'property', 'value'], `${what}.adjustments[${String(i)}]`);
    asString(field(adj, 'selector'), `${what}.adjustments[${String(i)}].selector`);
    asString(field(adj, 'property'), `${what}.adjustments[${String(i)}].property`);
    asString(field(adj, 'value'), `${what}.adjustments[${String(i)}].value`);
  }
  asString(field(candidate, 'renderedCss'), `${what}.renderedCss`);
  const fault = field(candidate, 'fault');
  if (fault !== null && typeof fault !== 'string') shapeError(`${what}.fault must be string or null`);
  asNumber(field(candidate, 'replaysRequired'), `${what}.replaysRequired`);
  const replaysAttempted = asNumber(field(candidate, 'replaysAttempted'), `${what}.replaysAttempted`);
  const replaysPassed = asNumber(field(candidate, 'replaysPassed'), `${what}.replaysPassed`);
  const status = oneOf(field(candidate, 'status'), CANDIDATE_STATUSES, `${what}.status`);
  const reason = field(candidate, 'reason');
  if (reason !== null && typeof reason !== 'string') shapeError(`${what}.reason must be string or null`);
  oneOf(field(candidate, 'expected'), CANDIDATE_STATUSES, `${what}.expected`);
  asBoolean(field(candidate, 'expectationMet'), `${what}.expectationMet`);
  asStringArray(field(candidate, 'expectationProblems'), `${what}.expectationProblems`);
  const replays = asArray(field(candidate, 'replays'), `${what}.replays`);
  if (replays.length > MAX_REPLAYS) throw new DashboardImportError('TOO_MANY_ITEMS', 'replays exceeds 8 entries');
  replays.forEach((r, i) => checkReplay(r, `${what}.replays[${String(i)}]`));
  return { id, description, status, replaysPassed, replaysAttempted };
}

export function importScoreboard(text: string): ScoreboardView {
  const doc = parseBoundedJson(text);
  if (!isRecord(doc)) shapeError('scoreboard must be a JSON object');
  const keys = Object.keys(doc);
  const allowed = new Set([
    '_example',
    'schemaVersion',
    'label',
    'complete',
    'approvedSha',
    'createdAt',
    'modelOrProviderCalls',
    'modalCalls',
    'baseline',
    'candidates',
    'nc5',
    'notes',
  ]);
  for (const k of keys) {
    if (!allowed.has(k)) shapeError(`unexpected top-level key ${JSON.stringify(k)}`);
  }
  const required = [
    'schemaVersion',
    'label',
    'complete',
    'approvedSha',
    'createdAt',
    'modelOrProviderCalls',
    'modalCalls',
    'baseline',
    'candidates',
    'nc5',
    'notes',
  ] as const;
  for (const k of required) {
    if (!Object.prototype.hasOwnProperty.call(doc, k)) shapeError(`missing top-level key ${k}`);
  }
  if (asNumber(field(doc, 'schemaVersion'), 'schemaVersion') !== 1) shapeError('schemaVersion must be 1');
  const label = asString(field(doc, 'label'), 'label');
  asBoolean(field(doc, 'complete'), 'complete');
  const approvedSha = asString(field(doc, 'approvedSha'), 'approvedSha');
  if (!HEX40.test(approvedSha)) shapeError('approvedSha must be 40 lowercase hex characters');
  const createdAt = asString(field(doc, 'createdAt'), 'createdAt');
  asNumber(field(doc, 'modelOrProviderCalls'), 'modelOrProviderCalls');
  asNumber(field(doc, 'modalCalls'), 'modalCalls');
  const baseline = field(doc, 'baseline');
  if (!isRecord(baseline)) shapeError('baseline must be an object');
  checkKeys(baseline, ['reproduced', 'reasons', 'replay'], 'baseline');
  const baselineReproduced = asBoolean(field(baseline, 'reproduced'), 'baseline.reproduced');
  asStringArray(field(baseline, 'reasons'), 'baseline.reasons');
  checkReplay(field(baseline, 'replay'), 'baseline.replay');
  const candidates = asArray(field(doc, 'candidates'), 'candidates');
  const rows = candidates.map((c, i) => checkCandidate(c, `candidates[${String(i)}]`));
  if (!isRecord(field(doc, 'nc5'))) shapeError('nc5 must be an object');
  asStringArray(field(doc, 'notes'), 'notes');
  // Optional documentation string: direct read (may be absent), never trusted.
  const maybeExample: Json | undefined = (doc as { [k: string]: Json })['_example'];
  const claimsExample = typeof maybeExample === 'string';
  return {
    kind: 'scoreboard',
    label,
    approvedSha,
    createdAt,
    baselineReproduced,
    rows,
    sourceTag: 'owner-imported evidence',
    claimsExampleNote: claimsExample,
  };
}

export function importBaselineSummary(text: string): BaselineView {
  const doc = parseBoundedJson(text);
  if (!isRecord(doc)) shapeError('baseline-summary must be a JSON object');
  checkKeys(doc, [
    'runId',
    'oracleExitCode',
    'classification',
    'gitHead',
    'fixtureTree',
    'worktreeDirty',
    'worktree',
    'certified',
    'certificationReasons',
    'artifacts',
  ], 'baseline-summary');
  const runId = asString(field(doc, 'runId'), 'runId');
  asNumber(field(doc, 'oracleExitCode'), 'oracleExitCode');
  const classification = field(doc, 'classification');
  if (!isRecord(classification)) shapeError('classification must be an object');
  checkKeys(classification, ['verdict', 'regression', 'interceptedBy', 'reasons'], 'classification');
  const verdict = oneOf(field(classification, 'verdict'), VERDICTS, 'classification.verdict');
  const regression = oneOf(field(classification, 'regression'), REGRESSIONS, 'classification.regression');
  const interceptedBy = field(classification, 'interceptedBy');
  if (interceptedBy !== null && typeof interceptedBy !== 'string') shapeError('classification.interceptedBy must be string or null');
  asStringArray(field(classification, 'reasons'), 'classification.reasons');
  asString(field(doc, 'gitHead'), 'gitHead');
  asString(field(doc, 'fixtureTree'), 'fixtureTree');
  asBoolean(field(doc, 'worktreeDirty'), 'worktreeDirty');
  const worktree = field(doc, 'worktree');
  if (!isRecord(worktree)) shapeError('worktree must be an object');
  const kind = field(worktree, 'kind');
  if (kind === 'clean') checkKeys(worktree, ['kind'], 'worktree');
  else if (kind === 'dirty') {
    checkKeys(worktree, ['kind', 'paths'], 'worktree');
    asStringArray(field(worktree, 'paths'), 'worktree.paths');
  } else if (kind === 'unknown') {
    checkKeys(worktree, ['kind', 'reason'], 'worktree');
    asString(field(worktree, 'reason'), 'worktree.reason');
  } else shapeError('worktree.kind must be clean, dirty, or unknown');
  const certified = asBoolean(field(doc, 'certified'), 'certified');
  asStringArray(field(doc, 'certificationReasons'), 'certificationReasons');
  for (const [i, a] of asArray(field(doc, 'artifacts'), 'artifacts').entries()) {
    if (!isRecord(a)) shapeError(`artifacts[${String(i)}] must be an object`);
    checkKeys(a, ['relativePath', 'sha256', 'bytes'], `artifacts[${String(i)}]`);
    asString(field(a, 'relativePath'), `artifacts[${String(i)}].relativePath`);
    asString(field(a, 'sha256'), `artifacts[${String(i)}].sha256`);
    asNumber(field(a, 'bytes'), `artifacts[${String(i)}].bytes`);
  }
  return { kind: 'baseline', runId, verdict, regression, certified, sourceTag: 'owner-imported evidence' };
}

export function importEvidence(text: string): ImportedView {
  // Dispatch on shape without trusting it: try scoreboard first (it requires
  // the scoreboard-only `candidates` key), else baseline-summary.
  const doc = parseBoundedJson(text);
  if (!isRecord(doc)) shapeError('evidence file must be a JSON object');
  if (Object.prototype.hasOwnProperty.call(doc, 'candidates')) return importScoreboard(text);
  return importBaselineSummary(text);
}
