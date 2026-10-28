// C3-0 disposable candidate stage. Builds a complete, hash-verified copy of the trusted F01
// verifier and fixture from an approved Git SHA in a private directory OUTSIDE the repository,
// installs exactly one model-free candidate (host-rendered CSS) and runs the UNMODIFIED trusted
// oracle against it at its normal fixed root and port. Fails closed everywhere.
//
// Not a sandbox: it removes untrusted executable content instead of containing it. Dependency
// bytes come from a contained copy of the trusted install (offline frozen-lockfile install is not
// possible in this environment) and are checked, not enforced; see tasks/PP-META-I2-C3.md.
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, open, readdir, readFile, readlink, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { renderCssAdjustments, CssAdjustmentError, type CssAdjustment } from './css-adjustments.ts';
import { classifyF01Baseline, extractOracleResults, F01_DESKTOP_TEST, F01_MOBILE_TEST, F01_OBSERVATION_ATTACHMENT, type F01Observation, type OracleTestResult } from './f01-baseline.ts';
import { scrubEnv } from './env.ts';
import { listZipEntries, readZipEntry } from './zip-read.ts';
import { readWorktreeState } from './worktree.ts';

export const ORACLE_PORT = 4173;
/** Everything archived from the approved SHA into the stage. */
export const STAGED_GIT_PATHS = ['verifier', 'fixtures/sample-store', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json'] as const;
export const CANDIDATE_CSS_PATH = 'fixtures/sample-store/src/styles.css';
const STYLES_URL = `http://127.0.0.1:${ORACLE_PORT}/styles.css`;
export const ORACLE_TIMEOUT_MS = 120_000;

export type StageFailureCode =
  | 'LOCK_HELD'
  | 'PORT_BUSY'
  | 'SHA_MISMATCH'
  | 'TREE_NOT_CLEAN'
  | 'ARCHIVE_FAILED'
  | 'TRUSTED_FILE_MISMATCH'
  | 'DEPENDENCY_FAILED'
  | 'DEPENDENCY_TAMPER'
  | 'STAGE_ESCAPE'
  | 'TAMPER'
  | 'ORACLE_START_FAILED'
  | 'ORACLE_TIMEOUT'
  | 'EVIDENCE_INCOMPLETE'
  | 'ORACLE_EXIT_ABNORMAL'
  | 'SOURCE_NOT_PROVEN';

export class StageError extends Error {
  readonly code: StageFailureCode;
  constructor(code: StageFailureCode, message: string) {
    super(message);
    this.name = 'StageError';
    this.code = code;
  }
}

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
/** Git blob object id of file bytes (`git hash-object`). */
export const gitBlobSha1 = (b: Uint8Array) =>
  createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');

// ---------------------------------------------------------------- lock and port

/** Exclusive-create lock. A stale lock is NOT cleaned automatically: fail closed. */
export async function acquireOracleLock(lockPath: string): Promise<() => Promise<void>> {
  await mkdir(path.dirname(lockPath), { recursive: true });
  let handle;
  try {
    handle = await open(lockPath, 'wx', 0o600);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new StageError('LOCK_HELD', 'another oracle run holds the lock (or a crashed run left it); confirm nothing is running, then delete the lock file');
    }
    throw e;
  }
  await handle.writeFile(`${process.pid}\n`);
  await handle.close();
  return async () => {
    await rm(lockPath, { force: true });
  };
}

/** Port must be bindable on loopback; otherwise the oracle would test an unknown server. */
export function assertPortFree(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', () => reject(new StageError('PORT_BUSY', `127.0.0.1:${port} is not free; refusing to run the oracle against an unknown server`)));
    s.listen(port, '127.0.0.1', () => s.close(() => resolve()));
  });
}

// ---------------------------------------------------------------- hashing

type TreeEntry = { kind: 'file' | 'link'; value: string };
export type TreeManifest = Map<string, TreeEntry>;

/** Hash a directory tree without following symlinks (file: SHA-256, link: its target text). */
export async function hashTree(root: string): Promise<TreeManifest> {
  const out: TreeManifest = new Map();
  async function walk(dir: string): Promise<void> {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      const st = await lstat(full);
      if (st.isSymbolicLink()) out.set(rel, { kind: 'link', value: await readlink(full) });
      else if (st.isDirectory()) await walk(full);
      else if (st.isFile()) out.set(rel, { kind: 'file', value: sha256(await readFile(full)) });
      else out.set(rel, { kind: 'file', value: `special:${st.mode}` });
    }
  }
  await walk(root);
  return out;
}

export function treeDigest(m: TreeManifest): string {
  const h = createHash('sha256');
  for (const k of [...m.keys()].sort()) {
    const v = m.get(k)!;
    h.update(`${k}\0${v.kind}\0${v.value}\n`);
  }
  return h.digest('hex');
}

export function diffTrees(a: TreeManifest, b: TreeManifest, limit = 5): string[] {
  const out: string[] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(k);
    const y = b.get(k);
    if (!x || !y || x.kind !== y.kind || x.value !== y.value) {
      out.push(`${k}: ${!x ? 'added' : !y ? 'removed' : 'changed'}`);
      if (out.length >= limit) break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- stage construction

export type TrustedFile = { gitBlob: string; sha256: string; bytes: number };
export type StageManifest = {
  approvedSha: string;
  trusted: Record<string, TrustedFile>;
  candidateCss: { path: string; sha256: string; bytes: number; nonce: string };
  dependencies: { files: number; sha256: string };
  workspaceConfig: 'none present at the approved SHA';
};

function git(repoRoot: string, args: string[], input?: Buffer): Buffer {
  return execFileSync('git', args, { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024, ...(input ? { input } : {}) });
}

/** `git archive <sha> -- <paths>` into a fresh 0700 directory outside the repository. */
export async function createStage(repoRoot: string, sha: string, stageRoot = os.tmpdir()): Promise<string> {
  await mkdir(stageRoot, { recursive: true, mode: 0o700 });
  const stage = await mkdtemp(path.join(stageRoot, 'proofpilot-stage-'));
  const repoReal = await realpath(repoRoot);
  const stageReal = await realpath(stage);
  if (stageReal === repoReal || stageReal.startsWith(repoReal + path.sep)) {
    await rm(stage, { recursive: true, force: true });
    throw new StageError('STAGE_ESCAPE', 'the stage must be outside the repository');
  }
  try {
    const tar = git(repoRoot, ['archive', '--format=tar', sha, '--', ...STAGED_GIT_PATHS]);
    execFileSync('tar', ['-x', '-C', stage, '-f', '-'], { input: tar, stdio: ['pipe', 'ignore', 'pipe'] });
  } catch (e) {
    await rm(stage, { recursive: true, force: true });
    throw new StageError('ARCHIVE_FAILED', `could not archive ${sha.slice(0, 12)}: ${String((e as Error).message).split('\n')[0]}`);
  }
  return stage;
}

/** Every staged file (outside node_modules) must equal an approved-SHA blob, with nothing extra or missing. */
export async function verifyTrustedFiles(repoRoot: string, sha: string, stage: string): Promise<Record<string, TrustedFile>> {
  const listing = git(repoRoot, ['ls-tree', '-r', '-z', sha, '--', ...STAGED_GIT_PATHS]).toString('utf8').split('\0').filter(Boolean);
  const expected = new Map<string, string>();
  for (const line of listing) {
    const m = /^(\d+) (\w+) ([0-9a-f]{40})\t(.+)$/.exec(line);
    if (!m || m[2] !== 'blob' || m[1] === '120000' || m[1] === '160000') {
      throw new StageError('TRUSTED_FILE_MISMATCH', `unexpected tree entry in approved SHA: ${line.slice(0, 80)}`);
    }
    expected.set(m[4]!, m[3]!);
  }
  const staged = await hashTree(stage);
  const out: Record<string, TrustedFile> = {};
  for (const [rel, entry] of staged) {
    if (rel === 'node_modules' || rel.startsWith('node_modules/')) continue;
    if (entry.kind !== 'file' || !expected.has(rel)) throw new StageError('TRUSTED_FILE_MISMATCH', `unexpected staged entry: ${rel}`);
  }
  for (const [rel, oid] of expected) {
    const bytes = await readFile(path.join(stage, rel)).catch(() => null);
    if (!bytes) throw new StageError('TRUSTED_FILE_MISMATCH', `missing staged file: ${rel}`);
    if (gitBlobSha1(bytes) !== oid) throw new StageError('TRUSTED_FILE_MISMATCH', `staged file differs from the approved blob: ${rel}`);
    out[rel] = { gitBlob: oid, sha256: sha256(bytes), bytes: bytes.length };
  }
  if (Object.keys(out).length === 0) throw new StageError('TRUSTED_FILE_MISMATCH', 'no trusted files were staged');
  return out;
}

/**
 * Dependencies: a contained copy (new inodes, symlinks kept relative) of the trusted install.
 * A fresh offline frozen-lockfile install is not possible here (pnpm 12 offline mode needs
 * registry metadata that is not cached). The copy is hash-compared with its source, every link
 * must resolve inside the stage and no file may be hard-linked outside it.
 */
export async function provisionDependencies(trustedNodeModules: string, stage: string): Promise<{ source: TreeManifest }> {
  try {
    await stat(trustedNodeModules);
    const source = await hashTree(trustedNodeModules);
    await cp(trustedNodeModules, path.join(stage, 'node_modules'), { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false });
    const copy = await hashTree(path.join(stage, 'node_modules'));
    const d = diffTrees(source, copy);
    if (d.length) throw new StageError('DEPENDENCY_FAILED', `dependency copy differs from the trusted install: ${d.join('; ')}`);
    const pin = JSON.parse(await readFile(path.join(stage, 'package.json'), 'utf8')).devDependencies?.['@playwright/test'];
    const installed = JSON.parse(await readFile(path.join(stage, 'node_modules/@playwright/test/package.json'), 'utf8')).version;
    if (typeof pin !== 'string' || pin !== installed) {
      throw new StageError('DEPENDENCY_FAILED', `installed @playwright/test ${installed} does not equal the approved pin ${pin}`);
    }
    return { source };
  } catch (e) {
    if (e instanceof StageError) throw e;
    throw new StageError('DEPENDENCY_FAILED', `dependencies could not be provisioned: ${String((e as Error).message).split('\n')[0]}`);
  }
}

/** Every path in the stage must resolve inside it; no hard-linked files (writes could escape). */
export async function assertStageContained(stage: string): Promise<void> {
  const root = await realpath(stage);
  async function walk(dir: string): Promise<void> {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      const st = await lstat(full);
      if (st.isSymbolicLink()) {
        const target = await realpath(full).catch(() => null);
        if (!target || !(target === root || target.startsWith(root + path.sep))) {
          throw new StageError('STAGE_ESCAPE', `link leaves the stage: ${path.relative(root, full)}`);
        }
      } else if (st.isDirectory()) {
        await walk(full);
      } else if (st.isFile() && st.nlink > 1) {
        throw new StageError('STAGE_ESCAPE', `hard-linked file in the stage: ${path.relative(root, full)}`);
      }
    }
  }
  await walk(root);
}

export const candidateMarker = (nonce: string) => `\n/* proofpilot-candidate nonce=${nonce} */\n`;

export async function writeCandidateCss(stage: string, nonce: string, rules: string): Promise<{ bytes: Buffer; sha256: string }> {
  const file = path.join(stage, CANDIDATE_CSS_PATH);
  const baseline = await readFile(file);
  const bytes = Buffer.concat([baseline, Buffer.from(candidateMarker(nonce) + rules, 'utf8')]);
  await writeFile(file, bytes);
  return { bytes, sha256: sha256(bytes) };
}

/** Re-hash trusted files, the candidate CSS and the dependency copy; any difference is a tamper. */
export async function verifyStageIntegrity(stage: string, manifest: StageManifest, sourceDeps: TreeManifest, trustedNodeModules: string): Promise<void> {
  for (const [rel, f] of Object.entries(manifest.trusted)) {
    if (rel === CANDIDATE_CSS_PATH) continue;
    const bytes = await readFile(path.join(stage, rel)).catch(() => null);
    if (!bytes || sha256(bytes) !== f.sha256) throw new StageError('TAMPER', `trusted staged file changed: ${rel}`);
  }
  const css = await readFile(path.join(stage, CANDIDATE_CSS_PATH)).catch(() => null);
  if (!css || sha256(css) !== manifest.candidateCss.sha256) throw new StageError('TAMPER', 'candidate styles.css changed after it was written');
  const extra = await hashTree(stage);
  for (const rel of extra.keys()) {
    if (rel === 'node_modules' || rel.startsWith('node_modules/')) continue;
    if (!(rel in manifest.trusted)) throw new StageError('TAMPER', `unexpected file appeared in the stage: ${rel}`);
  }
  const deps = await hashTree(path.join(stage, 'node_modules')).catch(() => null);
  if (!deps) throw new StageError('DEPENDENCY_TAMPER', 'staged dependencies disappeared');
  const d = diffTrees(sourceDeps, deps);
  if (d.length) throw new StageError('DEPENDENCY_TAMPER', `staged dependencies changed: ${d.join('; ')}`);
  const src = diffTrees(sourceDeps, await hashTree(trustedNodeModules));
  if (src.length) throw new StageError('DEPENDENCY_TAMPER', `the trusted install changed: ${src.join('; ')}`);
}

// ---------------------------------------------------------------- oracle + proofs

async function runOracle(stage: string, evidenceDir: string, timeoutMs: number): Promise<number> {
  await mkdir(evidenceDir, { recursive: true });
  const out = await open(path.join(evidenceDir, 'oracle-stdout.txt'), 'w', 0o600);
  const child = spawn(
    process.execPath,
    [path.join(stage, 'node_modules/@playwright/test/cli.js'), 'test', '-c', 'verifier/playwright.config.ts'],
    { cwd: stage, env: { ...scrubEnv(process.env), PROOFPILOT_EVIDENCE_DIR: evidenceDir }, stdio: ['ignore', out.fd, out.fd], detached: true },
  );
  try {
    return await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          process.kill(-child.pid!, 'SIGKILL');
        } catch {
          /* already gone */
        }
        reject(new StageError('ORACLE_TIMEOUT', `the oracle did not finish within ${timeoutMs} ms`));
      }, timeoutMs);
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(new StageError('ORACLE_START_FAILED', `could not start the oracle: ${e.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve(code ?? -1);
      });
    });
  } finally {
    await out.close();
    try {
      process.kill(-child.pid!, 'SIGKILL'); // never leave the fixture server holding the port
    } catch {
      /* nothing left */
    }
  }
}

export type TraceProof = { test: string; served: boolean; bytesEqualStaged: boolean; hasNonce: boolean; servedSha256: string | null };

/** Read the response body that Chromium actually received for /styles.css from a Playwright trace. */
export function proveServedCss(traceZip: Buffer, stagedCss: Buffer, nonce: string): Omit<TraceProof, 'test'> {
  const entries = listZipEntries(traceZip);
  const byName = new Map(entries.map((e) => [e.name, e]));
  let served: Buffer | null = null;
  for (const net of entries.filter((e) => e.name.endsWith('trace.network'))) {
    for (const line of readZipEntry(traceZip, net).toString('utf8').split('\n')) {
      if (!line.trim()) continue;
      let rec: any;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      const snap = rec?.snapshot;
      if (rec?.type !== 'resource-snapshot' || snap?.request?.url !== STYLES_URL || snap?.response?.status !== 200) continue;
      const file = snap.response?.content?._file;
      const entry = typeof file === 'string' ? byName.get(file) : undefined;
      if (entry) served = readZipEntry(traceZip, entry);
    }
  }
  if (!served) return { served: false, bytesEqualStaged: false, hasNonce: false, servedSha256: null };
  return {
    served: true,
    bytesEqualStaged: served.equals(stagedCss),
    hasNonce: served.includes(Buffer.from(candidateMarker(nonce), 'utf8')),
    servedSha256: sha256(served),
  };
}

// ---------------------------------------------------------------- orchestration

export type CandidateOutcome = 'ORACLE_PASS' | 'PATCH_FAILED' | 'PATCH_REJECTED' | 'INCONCLUSIVE';

export type CandidateRecord = {
  schemaVersion: 1;
  label: string;
  approvedSha: string;
  outcome: CandidateOutcome;
  failure: { code: StageFailureCode | CssAdjustmentError['code']; message: string } | null;
  oracleRan: boolean;
  oracleExitCode: number | null;
  adjustments: CssAdjustment[];
  renderedCss: string | null;
  manifest: StageManifest | null;
  /** Mobile/desktop as observed by the unmodified oracle. */
  mobile: { status: string; hitTestTarget: string | null; cartCountAfter: string | null } | null;
  desktop: { status: string; hitTestTarget: string | null; cartCountAfter: string | null } | null;
  /** Same failure signature as the original baseline (tap intercepted, cart stays 0, desktop passes). */
  baselineIdentical: boolean;
  sourceProof: TraceProof[];
  integrityAfterRun: 'intact' | 'violated' | 'not-checked';
  stageRemoved: boolean;
  /** Evidence files that must exist and be hashed for a pass or fail to count (relative to the evidence dir). */
  requiredEvidence: string[];
  evidence: Array<{ path: string; sha256: string; bytes: number }>;
  /** True only when every required artifact was hashed, the record was persisted and read back, and the hashes still match. */
  evidenceFinalized: boolean;
};

export type RunCandidateOptions = {
  repoRoot: string;
  approvedSha: string;
  label: string;
  adjustments: readonly CssAdjustment[];
  evidenceDir: string;
  lockPath: string;
  trustedNodeModules?: string;
  stageRoot?: string;
  timeoutMs?: number;
  /** Test-only points to simulate tampering and faults. */
  hooks?: {
    beforeRun?: (stage: string) => Promise<void> | void;
    afterRun?: (stage: string) => Promise<void> | void;
    /** Replace the oracle process exit code (simulates an abnormal runner exit). */
    adjustOracleExit?: (code: number) => number;
    /** Runs after the oracle finished and before evidence is finalised (simulates missing evidence). */
    beforeFinalize?: (evidenceDir: string) => Promise<void> | void;
  };
  /** Evidence I/O; injectable so faults can be simulated deterministically. */
  io?: Partial<EvidenceIO>;
};

export type EvidenceIO = {
  hashFile: (file: string) => Promise<{ sha256: string; bytes: number }>;
  writeRecord: (file: string, text: string) => Promise<void>;
};

const defaultIO: EvidenceIO = {
  hashFile: async (file) => {
    const b = await readFile(file);
    return { sha256: sha256(b), bytes: b.length };
  },
  writeRecord: async (file, text) => {
    const tmp = `${file}.tmp`;
    await writeFile(tmp, text, { mode: 0o600 });
    await rename(tmp, file); // atomic: a partial record is never visible
  },
};

export const RECORD_FILE = 'candidate-record.json';

/**
 * Pure outcome decision from the oracle's own results and its process exit code. A pass needs exit 0
 * AND both trusted tests passed with the add-to-cart tap and cart 1. A failure counts as PATCH_FAILED
 * only for Playwright's ordinary "tests failed" exit (1) with both rows complete; anything else
 * (nonzero exit with passing rows, exit 0 with failing rows, signals, crashes) abstains.
 */
export function decideOutcome(input: { exitCode: number | null; mobile: { status: string; hit: string | null; cart: string | null }; desktop: { status: string; hit: string | null; cart: string | null } }): { outcome: 'ORACLE_PASS' | 'PATCH_FAILED' | 'INCONCLUSIVE'; reason: string | null } {
  const { exitCode, mobile, desktop } = input;
  const ok = (t: typeof mobile) => t.status === 'passed' && t.cart === '1' && t.hit === 'add-to-cart';
  const settled = (t: typeof mobile) => t.status === 'passed' || t.status === 'failed';
  if (exitCode === null || !Number.isInteger(exitCode)) return { outcome: 'INCONCLUSIVE', reason: 'the oracle process did not report an exit code' };
  if (!settled(mobile) || !settled(desktop)) return { outcome: 'INCONCLUSIVE', reason: `oracle ended with mobile=${mobile.status}, desktop=${desktop.status}` };
  if (ok(mobile) && ok(desktop)) {
    return exitCode === 0
      ? { outcome: 'ORACLE_PASS', reason: null }
      : { outcome: 'INCONCLUSIVE', reason: `both trusted tests passed but the oracle process exited ${exitCode}` };
  }
  if (mobile.status === 'passed' && desktop.status === 'passed') {
    return { outcome: 'INCONCLUSIVE', reason: 'tests passed without the expected tap target and cart count' };
  }
  // at least one test genuinely failed
  return exitCode === 1
    ? { outcome: 'PATCH_FAILED', reason: null }
    : { outcome: 'INCONCLUSIVE', reason: `a trusted test failed but the oracle process exited ${exitCode} instead of 1` };
}

async function loadObservations(results: OracleTestResult[]): Promise<void> {
  for (const r of results) {
    const a = r.attachments.find((x) => x.name === F01_OBSERVATION_ATTACHMENT && x.path);
    r.observation = a ? (JSON.parse(await readFile(a.path!, 'utf8')) as F01Observation) : null;
  }
}

const brief = (r: OracleTestResult | undefined) =>
  r ? { status: r.status, hitTestTarget: r.observation?.hitTestTarget ?? null, cartCountAfter: r.observation?.cartCountAfter ?? null } : null;

export async function runCandidate(opts: RunCandidateOptions): Promise<CandidateRecord> {
  const trustedNodeModules = opts.trustedNodeModules ?? path.join(opts.repoRoot, 'node_modules');
  const record: CandidateRecord = {
    schemaVersion: 1,
    label: opts.label,
    approvedSha: opts.approvedSha,
    outcome: 'INCONCLUSIVE',
    failure: null,
    oracleRan: false,
    oracleExitCode: null,
    adjustments: opts.adjustments.map((a) => ({ ...a })),
    renderedCss: null,
    manifest: null,
    mobile: null,
    desktop: null,
    baselineIdentical: false,
    sourceProof: [],
    integrityAfterRun: 'not-checked',
    stageRemoved: false,
    requiredEvidence: [],
    evidence: [],
    evidenceFinalized: false,
  };
  const fail = (code: NonNullable<CandidateRecord['failure']>['code'], message: string, outcome: CandidateOutcome = 'INCONCLUSIVE') => {
    record.failure = { code, message };
    record.outcome = outcome;
  };

  // 1. Trusted rendering first: a rejected candidate creates nothing (no lock, stage or browser).
  try {
    record.renderedCss = renderCssAdjustments(opts.adjustments);
  } catch (e) {
    if (e instanceof CssAdjustmentError) {
      fail(e.code, e.message, 'PATCH_REJECTED');
      return record;
    }
    throw e;
  }

  let release: (() => Promise<void>) | null = null;
  let stage: string | null = null;
  let sourceDeps: TreeManifest | null = null;
  try {
    release = await acquireOracleLock(opts.lockPath);
    await assertPortFree(ORACLE_PORT);

    const head = git(opts.repoRoot, ['rev-parse', 'HEAD']).toString().trim();
    if (head !== opts.approvedSha) throw new StageError('SHA_MISMATCH', `HEAD ${head.slice(0, 12)} is not the approved SHA ${opts.approvedSha.slice(0, 12)}`);
    const wt = readWorktreeState(opts.repoRoot, STAGED_GIT_PATHS);
    if (wt.kind !== 'clean') throw new StageError('TREE_NOT_CLEAN', `trusted input paths are ${wt.kind}${wt.kind === 'dirty' ? `: ${wt.paths.join(', ')}` : ''}`);

    stage = await createStage(opts.repoRoot, opts.approvedSha, opts.stageRoot);
    const trusted = await verifyTrustedFiles(opts.repoRoot, opts.approvedSha, stage);
    sourceDeps = (await provisionDependencies(trustedNodeModules, stage)).source;
    await assertStageContained(stage);

    const nonce = randomBytes(12).toString('hex');
    const css = await writeCandidateCss(stage, nonce, record.renderedCss);
    record.manifest = {
      approvedSha: opts.approvedSha,
      trusted,
      candidateCss: { path: CANDIDATE_CSS_PATH, sha256: css.sha256, bytes: css.bytes.length, nonce },
      dependencies: { files: sourceDeps.size, sha256: treeDigest(sourceDeps) },
      workspaceConfig: 'none present at the approved SHA',
    };

    await opts.hooks?.beforeRun?.(stage);
    await verifyStageIntegrity(stage, record.manifest, sourceDeps, trustedNodeModules); // nothing may change between manifest and run
    await assertPortFree(ORACLE_PORT);

    record.oracleRan = true;
    const rawExit = await runOracle(stage, opts.evidenceDir, opts.timeoutMs ?? ORACLE_TIMEOUT_MS);
    record.oracleExitCode = opts.hooks?.adjustOracleExit ? opts.hooks.adjustOracleExit(rawExit) : rawExit;
    await opts.hooks?.afterRun?.(stage);
    try {
      await verifyStageIntegrity(stage, record.manifest, sourceDeps, trustedNodeModules);
      record.integrityAfterRun = 'intact';
    } catch (e) {
      record.integrityAfterRun = 'violated';
      throw e;
    }

    // Evidence: the oracle's own report and observations, never model text.
    const reportPath = path.join(opts.evidenceDir, 'oracle-report.json');
    const results = extractOracleResults(JSON.parse(await readFile(reportPath, 'utf8').catch(() => 'null')));
    await loadObservations(results);
    const mobile = results.filter((r) => r.title === F01_MOBILE_TEST);
    const desktop = results.filter((r) => r.title === F01_DESKTOP_TEST);
    if (mobile.length !== 1 || desktop.length !== 1 || !mobile[0]!.observation || !desktop[0]!.observation) {
      throw new StageError('EVIDENCE_INCOMPLETE', 'the oracle report lacks exactly one mobile and one desktop result with observations');
    }
    record.mobile = brief(mobile[0]);
    record.desktop = brief(desktop[0]);

    // Prove the staged candidate was what the browser received, for both viewports.
    for (const r of [mobile[0]!, desktop[0]!]) {
      const trace = r.attachments.find((a) => a.name === 'trace' && a.path);
      if (!trace?.path) throw new StageError('SOURCE_NOT_PROVEN', `no trace archive for ${r.title}`);
      const proof = proveServedCss(await readFile(trace.path), css.bytes, nonce);
      record.sourceProof.push({ test: r.title.split(':')[0]!, ...proof });
      if (!proof.served || !proof.bytesEqualStaged || !proof.hasNonce) {
        throw new StageError('SOURCE_NOT_PROVEN', `the trace does not show the staged candidate being served for ${r.title}`);
      }
    }

    // Evidence that must exist (and be hashed) for any verdict: report, stdout, and per viewport the
    // oracle observation and the Playwright trace.
    const rel = (p: string) => path.relative(opts.evidenceDir, p).split(path.sep).join('/');
    record.requiredEvidence = ['oracle-report.json', 'oracle-stdout.txt'];
    for (const r of [mobile[0]!, desktop[0]!]) {
      const obs = r.attachments.find((a) => a.name === F01_OBSERVATION_ATTACHMENT && a.path);
      const trace = r.attachments.find((a) => a.name === 'trace' && a.path);
      record.requiredEvidence.push(rel(obs!.path!), rel(trace!.path!));
    }
    const decision = decideOutcome({
      exitCode: record.oracleExitCode,
      mobile: { status: mobile[0]!.status, hit: mobile[0]!.observation?.hitTestTarget ?? null, cart: mobile[0]!.observation?.cartCountAfter ?? null },
      desktop: { status: desktop[0]!.status, hit: desktop[0]!.observation?.hitTestTarget ?? null, cart: desktop[0]!.observation?.cartCountAfter ?? null },
    });
    if (decision.outcome === 'INCONCLUSIVE') throw new StageError('ORACLE_EXIT_ABNORMAL', decision.reason ?? 'inconclusive oracle outcome');
    record.outcome = decision.outcome;
    record.baselineIdentical = classifyF01Baseline(results).verdict === 'REPRODUCED';
  } catch (e) {
    if (e instanceof StageError) {
      fail(e.code, e.message);
      record.outcome = 'INCONCLUSIVE';
    } else {
      fail('EVIDENCE_INCOMPLETE', `unexpected ${String((e as Error)?.message ?? e).split('\n')[0]}`);
    }
  } finally {
    if (stage) {
      await rm(stage, { recursive: true, force: true });
      record.stageRemoved = !(await stat(stage).then(() => true, () => false));
    }
    if (release) await release();
  }

  // Evidence finalisation is a mandatory gate: a pass or a fail only stands if every required artifact
  // exists and is hashed, the record was persisted atomically, and a read-back verifies it.
  const io: EvidenceIO = { ...defaultIO, ...opts.io };
  const verdictClaimed = record.outcome === 'ORACLE_PASS' || record.outcome === 'PATCH_FAILED';
  try {
    await opts.hooks?.beforeFinalize?.(opts.evidenceDir);
    if (verdictClaimed) {
      await finalizeEvidence(record, opts.evidenceDir, io);
    } else {
      // Already not a verdict: keep a diagnostic record (best effort) without touching the failure reason.
      await mkdir(opts.evidenceDir, { recursive: true });
      await io.writeRecord(path.join(opts.evidenceDir, RECORD_FILE), JSON.stringify(record, null, 2) + '\n').catch(() => undefined);
    }
  } catch (e) {
    const message = String((e as Error)?.message ?? e).split('\n')[0];
    record.evidenceFinalized = false;
    record.outcome = 'INCONCLUSIVE';
    record.failure = { code: 'EVIDENCE_INCOMPLETE', message: `evidence could not be finalised: ${message}` };
    // Never leave a stale passing record behind; best effort to persist the downgraded one.
    await rm(path.join(opts.evidenceDir, RECORD_FILE), { force: true }).catch(() => undefined);
    await io.writeRecord(path.join(opts.evidenceDir, RECORD_FILE), JSON.stringify(record, null, 2) + '\n').catch(() => undefined);
  }
  return record;
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) out.push(path.join(e.parentPath, e.name));
  }
  return out.sort();
}

/** Hash all evidence, persist the record atomically, then read it back and re-verify every hash. Throws on any failure. */
export async function finalizeEvidence(record: CandidateRecord, evidenceDir: string, io: EvidenceIO): Promise<void> {
  await mkdir(evidenceDir, { recursive: true });
  const recordPath = path.join(evidenceDir, RECORD_FILE);
  await rm(recordPath, { force: true });
  const files = (await listFiles(evidenceDir)).filter((f) => path.basename(f) !== `${RECORD_FILE}.tmp`);
  const entries: CandidateRecord['evidence'] = [];
  for (const f of files) {
    const h = await io.hashFile(f);
    entries.push({ path: path.relative(evidenceDir, f).split(path.sep).join('/'), sha256: h.sha256, bytes: h.bytes });
  }
  const have = new Set(entries.map((e) => e.path));
  const missing = record.requiredEvidence.filter((r) => !have.has(r));
  if (record.requiredEvidence.length < 6) throw new Error('the required evidence list is incomplete');
  if (missing.length) throw new Error(`required evidence is missing: ${missing.join(', ')}`);
  record.evidence = entries;
  record.evidenceFinalized = true;
  await io.writeRecord(recordPath, JSON.stringify(record, null, 2) + '\n');
  const problems = await verifyPersistedEvidence(evidenceDir, io);
  if (problems.length) throw new Error(`persisted evidence failed verification: ${problems.join('; ')}`);
}

/**
 * Re-read the persisted record and check it against the files on disk. Returns the problems found
 * (empty means the record, its required artifacts and every hash are intact).
 */
export async function verifyPersistedEvidence(evidenceDir: string, io: Pick<EvidenceIO, 'hashFile'> = defaultIO): Promise<string[]> {
  const problems: string[] = [];
  let rec: CandidateRecord;
  try {
    rec = JSON.parse(await readFile(path.join(evidenceDir, RECORD_FILE), 'utf8'));
  } catch {
    return [`${RECORD_FILE} is missing or unreadable`];
  }
  if (rec.evidenceFinalized !== true) problems.push('record is not marked finalized');
  if (!Array.isArray(rec.requiredEvidence) || rec.requiredEvidence.length < 6) problems.push('required evidence list is incomplete');
  const byPath = new Map((rec.evidence ?? []).map((e) => [e.path, e]));
  for (const r of rec.requiredEvidence ?? []) if (!byPath.has(r)) problems.push(`required artifact not hashed: ${r}`);
  for (const e of rec.evidence ?? []) {
    try {
      const h = await io.hashFile(path.join(evidenceDir, e.path));
      if (h.sha256 !== e.sha256 || h.bytes !== e.bytes) problems.push(`hash mismatch: ${e.path}`);
    } catch {
      problems.push(`evidence file unreadable: ${e.path}`);
    }
  }
  const onDisk = (await listFiles(evidenceDir)).map((f) => path.relative(evidenceDir, f).split(path.sep).join('/')).filter((f) => f !== RECORD_FILE);
  for (const f of onDisk) if (!byPath.has(f)) problems.push(`unhashed file on disk: ${f}`);
  return problems;
}
