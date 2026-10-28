// Stage mechanics without a browser: hashing, lock and port preflight, archive/verify, dependency
// copy, containment, tamper detection and the trace-based source proof. A throwaway git repo
// stands in for the real one; nothing here touches the real tree, the network or a model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { appendFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import {
  acquireOracleLock,
  assertPortFree,
  assertStageContained,
  candidateMarker,
  CANDIDATE_CSS_PATH,
  createStage,
  decideOutcome,
  finalizeEvidence,
  RECORD_FILE,
  verifyPersistedEvidence,
  type CandidateRecord,
  type EvidenceIO,
  diffTrees,
  gitBlobSha1,
  hashTree,
  listZipEntries,
  proveServedCss,
  provisionDependencies,
  readZipEntry,
  StageError,
  STAGED_GIT_PATHS,
  treeDigest,
  verifyStageIntegrity,
  verifyTrustedFiles,
  writeCandidateCss,
  ZipError,
  type StageManifest,
} from '../../packages/core/src/index.ts';

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const tmp = (p = 'pp-stage-test-') => mkdtempSync(path.join(os.tmpdir(), p));
const gitIn = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd, encoding: 'utf8' }).trim();

/** Minimal repo laid out like the real one (only the staged paths). */
function fakeRepo(): { dir: string; sha: string } {
  const dir = tmp('pp-fake-repo-');
  const put = (rel: string, body: string) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), body);
  };
  put('verifier/playwright.config.ts', '// config\n');
  put('verifier/f01/f01.oracle.spec.ts', '// spec\n');
  put('fixtures/sample-store/server.mjs', '// server\n');
  put('fixtures/sample-store/src/styles.css', '.a{color:red}\n');
  put('fixtures/sample-store/src/product.html', '<html></html>\n');
  put('package.json', JSON.stringify({ devDependencies: { '@playwright/test': '1.64.1' } }));
  put('pnpm-lock.yaml', 'lockfileVersion: 9\n');
  put('tsconfig.json', '{}\n');
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'add', '-A');
  gitIn(dir, 'commit', '-q', '-m', 'init');
  return { dir, sha: gitIn(dir, 'rev-parse', 'HEAD') };
}

function fakeNodeModules(version = '1.64.1'): string {
  const nm = tmp('pp-fake-nm-');
  mkdirSync(path.join(nm, '.pnpm/@playwright+test@1.64.1/node_modules/@playwright/test'), { recursive: true });
  writeFileSync(path.join(nm, '.pnpm/@playwright+test@1.64.1/node_modules/@playwright/test/package.json'), JSON.stringify({ version }));
  mkdirSync(path.join(nm, '@playwright'), { recursive: true });
  symlinkSync('../.pnpm/@playwright+test@1.64.1/node_modules/@playwright/test', path.join(nm, '@playwright/test'));
  return nm;
}

// ------------------------------------------------------------ hashing

test('gitBlobSha1 equals git hash-object', () => {
  const dir = tmp();
  const bytes = Buffer.from('hello\nworld\n');
  writeFileSync(path.join(dir, 'f'), bytes);
  assert.equal(gitBlobSha1(bytes), gitIn(dir, 'hash-object', 'f'));
});

test('hashTree/diffTrees see changes, additions, removals and symlink retargets without following links', () => {
  const dir = tmp();
  writeFileSync(path.join(dir, 'a'), '1');
  symlinkSync('a', path.join(dir, 'l'));
  const before = hashTree(dir);
  return before.then(async (m0) => {
    writeFileSync(path.join(dir, 'a'), '2');
    writeFileSync(path.join(dir, 'b'), '3');
    rmSync(path.join(dir, 'l'));
    symlinkSync('b', path.join(dir, 'l'));
    const m1 = await hashTree(dir);
    assert.equal(treeDigest(m0) === treeDigest(m1), false);
    assert.deepEqual(diffTrees(m0, m1).sort(), ['a: changed', 'b: added', 'l: changed']);
    assert.equal(treeDigest(await hashTree(dir)), treeDigest(m1), 'digest is deterministic');
  });
});

// ------------------------------------------------------------ lock and port

test('lock is exclusive; a held (or stale) lock fails closed; release lets the next run in', async () => {
  const lock = path.join(tmp(), 'locks/oracle.lock');
  const release = await acquireOracleLock(lock);
  await assert.rejects(acquireOracleLock(lock), (e: any) => e instanceof StageError && e.code === 'LOCK_HELD');
  await release();
  assert.equal(existsSync(lock), false);
  await (await acquireOracleLock(lock))();
});

test('concurrent lock attempts: exactly one winner', async () => {
  const lock = path.join(tmp(), 'oracle.lock');
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => acquireOracleLock(lock)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 5);
});

test('port preflight: free port passes, bound port is PORT_BUSY', async () => {
  const holder = createServer();
  await new Promise<void>((r) => holder.listen(0, '127.0.0.1', () => r()));
  const port = (holder.address() as { port: number }).port;
  await assert.rejects(assertPortFree(port), (e: any) => e instanceof StageError && e.code === 'PORT_BUSY');
  await new Promise<void>((r) => holder.close(() => r()));
  await assertPortFree(port);
});

// ------------------------------------------------------------ stage creation and verification

test('stage is created outside the repo (0700) from the approved SHA and every file equals its blob', async () => {
  const { dir, sha } = fakeRepo();
  const stage = await createStage(dir, sha);
  try {
    assert.ok(!stage.startsWith(dir + path.sep));
    assert.equal(statSync(stage).mode & 0o777, 0o700);
    const trusted = await verifyTrustedFiles(dir, sha, stage);
    assert.ok(Object.keys(trusted).includes('verifier/f01/f01.oracle.spec.ts'));
    assert.ok(Object.keys(trusted).includes('pnpm-lock.yaml'), 'lockfile is a trusted staged input');
    assert.ok(Object.keys(trusted).includes('package.json'));
    assert.equal(trusted['fixtures/sample-store/src/styles.css']!.sha256, sha256(readFileSync(path.join(dir, 'fixtures/sample-store/src/styles.css'))));
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});

test('stage content comes from the approved commit, not the working tree', async () => {
  const { dir, sha } = fakeRepo();
  appendFileSync(path.join(dir, 'verifier/f01/f01.oracle.spec.ts'), '// UNCOMMITTED EDIT\n');
  const stage = await createStage(dir, sha);
  try {
    await verifyTrustedFiles(dir, sha, stage);
    assert.ok(!readFileSync(path.join(stage, 'verifier/f01/f01.oracle.spec.ts'), 'utf8').includes('UNCOMMITTED'));
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});

test('verifyTrustedFiles rejects a modified, an extra and a missing staged file', async () => {
  const { dir, sha } = fakeRepo();
  const cases: Array<[string, (s: string) => void]> = [
    ['modified', (s) => appendFileSync(path.join(s, 'verifier/playwright.config.ts'), '// evil\n')],
    ['extra', (s) => writeFileSync(path.join(s, 'verifier/extra.ts'), 'x')],
    ['missing', (s) => rmSync(path.join(s, 'fixtures/sample-store/server.mjs'))],
    ['symlink', (s) => symlinkSync('/etc/hosts', path.join(s, 'verifier/link'))],
  ];
  for (const [name, tamper] of cases) {
    const stage = await createStage(dir, sha);
    try {
      tamper(stage);
      await assert.rejects(verifyTrustedFiles(dir, sha, stage), (e: any) => e instanceof StageError && e.code === 'TRUSTED_FILE_MISMATCH', name);
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
  }
});

test('an unknown SHA fails closed with ARCHIVE_FAILED and leaves no stage behind', async () => {
  const { dir } = fakeRepo();
  const root = tmp('pp-stage-root-');
  await assert.rejects(createStage(dir, '0'.repeat(40), root), (e: any) => e instanceof StageError && e.code === 'ARCHIVE_FAILED');
  assert.deepEqual(execFileSync('ls', [root], { encoding: 'utf8' }).trim(), '');
});

test('the stage may not be created inside the repository', async () => {
  const { dir, sha } = fakeRepo();
  mkdirSync(path.join(dir, 'inner'));
  await assert.rejects(createStage(dir, sha, path.join(dir, 'inner')), (e: any) => e instanceof StageError && e.code === 'STAGE_ESCAPE');
});

// ------------------------------------------------------------ dependencies and containment

test('dependencies are copied (new inodes, relative links kept) and compared with their source', async () => {
  const { dir, sha } = fakeRepo();
  const nm = fakeNodeModules();
  const stage = await createStage(dir, sha);
  try {
    const { source } = await provisionDependencies(nm, stage);
    assert.equal(treeDigest(await hashTree(path.join(stage, 'node_modules'))), treeDigest(source));
    await assertStageContained(stage);
    // writing through the staged copy cannot reach the trusted install
    writeFileSync(path.join(stage, 'node_modules/@playwright/test/package.json'), '{"version":"6.6.6"}');
    assert.equal(JSON.parse(readFileSync(path.join(nm, '@playwright/test/package.json'), 'utf8')).version, '1.64.1');
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});

test('a dependency version that differs from the approved pin is refused', async () => {
  const { dir, sha } = fakeRepo();
  const stage = await createStage(dir, sha);
  try {
    await assert.rejects(provisionDependencies(fakeNodeModules('9.9.9'), stage), (e: any) => e instanceof StageError && e.code === 'DEPENDENCY_FAILED');
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});

test('a missing trusted install fails closed', async () => {
  const { dir, sha } = fakeRepo();
  const stage = await createStage(dir, sha);
  try {
    await assert.rejects(provisionDependencies(path.join(tmp(), 'nope'), stage), (e: any) => e instanceof StageError && e.code === 'DEPENDENCY_FAILED');
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});

test('containment: links leaving the stage and hard-linked files are STAGE_ESCAPE', async () => {
  const stage = tmp('pp-contain-');
  writeFileSync(path.join(stage, 'ok.txt'), 'x');
  await assertStageContained(stage);
  symlinkSync('ok.txt', path.join(stage, 'inside-link'));
  await assertStageContained(stage); // a link that stays inside is fine
  const outside = tmp();
  writeFileSync(path.join(outside, 'secret'), 's');
  symlinkSync(path.join(outside, 'secret'), path.join(stage, 'escape'));
  await assert.rejects(assertStageContained(stage), (e: any) => e.code === 'STAGE_ESCAPE');
  rmSync(path.join(stage, 'escape'));
  linkSync(path.join(outside, 'secret'), path.join(stage, 'hard'));
  await assert.rejects(assertStageContained(stage), (e: any) => e.code === 'STAGE_ESCAPE');
});

// ------------------------------------------------------------ candidate + integrity

async function preparedStage() {
  const { dir, sha } = fakeRepo();
  const nm = fakeNodeModules();
  const stage = await createStage(dir, sha);
  const trusted = await verifyTrustedFiles(dir, sha, stage);
  const { source } = await provisionDependencies(nm, stage);
  const css = await writeCandidateCss(stage, 'n0nce', '.promo{z-index:5}\n');
  const manifest: StageManifest = {
    approvedSha: sha,
    trusted,
    candidateCss: { path: CANDIDATE_CSS_PATH, sha256: css.sha256, bytes: css.bytes.length, nonce: 'n0nce' },
    dependencies: { files: source.size, sha256: treeDigest(source) },
    workspaceConfig: 'none present at the approved SHA',
  };
  return { stage, manifest, source, nm, css };
}

test('candidate CSS is the baseline bytes + nonce marker + rendered rules, exactly', async () => {
  const { stage, css } = await preparedStage();
  try {
    const written = readFileSync(path.join(stage, CANDIDATE_CSS_PATH));
    assert.equal(written.toString(), `.a{color:red}\n${candidateMarker('n0nce')}.promo{z-index:5}\n`);
    assert.equal(sha256(written), css.sha256);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
});

test('integrity check passes untouched and detects every kind of tampering (NC-6)', async () => {
  const mutations: Array<[string, (s: string, nm: string) => void, string]> = [
    ['trusted file edit', (s) => appendFileSync(path.join(s, 'verifier/f01/f01.oracle.spec.ts'), '// x'), 'TAMPER'],
    ['candidate css edit', (s) => appendFileSync(path.join(s, CANDIDATE_CSS_PATH), '.x{}'), 'TAMPER'],
    ['extra file', (s) => writeFileSync(path.join(s, 'fixtures/sample-store/src/app.js'), 'x'), 'TAMPER'],
    ['lockfile edit', (s) => appendFileSync(path.join(s, 'pnpm-lock.yaml'), 'x'), 'TAMPER'],
    ['trusted file removed', (s) => rmSync(path.join(s, 'tsconfig.json')), 'TAMPER'],
    ['staged dependency edit', (s) => writeFileSync(path.join(s, 'node_modules/@playwright/test/package.json'), '{"version":"1.64.1","x":1}'), 'DEPENDENCY_TAMPER'],
    ['trusted install edit', (_s, nm) => writeFileSync(path.join(nm, '.pnpm/@playwright+test@1.64.1/node_modules/@playwright/test/new.js'), 'x'), 'DEPENDENCY_TAMPER'],
  ];
  const base = await preparedStage();
  try {
    await verifyStageIntegrity(base.stage, base.manifest, base.source, base.nm); // untouched: passes
  } finally {
    rmSync(base.stage, { recursive: true, force: true });
  }
  for (const [name, mutate, expected] of mutations) {
    const p = await preparedStage();
    try {
      mutate(p.stage, p.nm);
      await assert.rejects(verifyStageIntegrity(p.stage, p.manifest, p.source, p.nm), (e: any) => e instanceof StageError && e.code === expected, name);
    } finally {
      rmSync(p.stage, { recursive: true, force: true });
    }
  }
});

// ------------------------------------------------------------ zip + source proof

function buildZip(entries: Record<string, Buffer>, method: 0 | 8): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(entries)) {
    const nameB = Buffer.from(name);
    const comp = method === 8 ? deflateRawSync(data) : data;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameB.length, 26);
    locals.push(lh, nameB, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameB.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameB);
    offset += 30 + nameB.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

test('zip reader round-trips stored and deflated entries and refuses malformed archives', () => {
  const entries = { 'a.txt': Buffer.from('hello'), 'dir/b.bin': Buffer.alloc(5000, 7) };
  for (const method of [0, 8] as const) {
    const zip = buildZip(entries, method);
    const list = listZipEntries(zip);
    assert.deepEqual(list.map((e) => e.name).sort(), Object.keys(entries).sort());
    for (const e of list) assert.deepEqual(readZipEntry(zip, e), entries[e.name as keyof typeof entries]);
  }
  assert.throws(() => listZipEntries(Buffer.from('not a zip')), ZipError);
  const zip = buildZip(entries, 0);
  assert.throws(() => readZipEntry(zip.subarray(0, 36), listZipEntries(zip)[0]!), ZipError);
});

function traceFor(servedCss: Buffer | null, url = 'http://127.0.0.1:4173/styles.css', status = 200): Buffer {
  const entries: Record<string, Buffer> = { '0-trace.network': Buffer.alloc(0) };
  const file = 'resources/abc.css';
  const rec = { type: 'resource-snapshot', snapshot: { request: { url }, response: { status, content: servedCss ? { _file: file } : {} } } };
  entries['1-trace.network'] = Buffer.from(JSON.stringify(rec) + '\n');
  if (servedCss) entries[file] = servedCss;
  return buildZip(entries, 8);
}

test('source proof: served bytes must equal the staged CSS and carry this candidate’s nonce', () => {
  const staged = Buffer.from(`.a{}${candidateMarker('N1')}.b{}\n`);
  const ok = proveServedCss(traceFor(staged), staged, 'N1');
  assert.deepEqual([ok.served, ok.bytesEqualStaged, ok.hasNonce], [true, true, true]);
  assert.equal(ok.servedSha256, sha256(staged));

  // baseline CSS (wrong tree) -> not equal, no nonce
  const baseline = Buffer.from('.a{}\n');
  const wrongTree = proveServedCss(traceFor(baseline), staged, 'N1');
  assert.deepEqual([wrongTree.served, wrongTree.bytesEqualStaged, wrongTree.hasNonce], [true, false, false]);
  // another candidate's nonce (stale server / other stage)
  const other = Buffer.from(`.a{}${candidateMarker('OTHER')}.b{}\n`);
  const stale = proveServedCss(traceFor(other), staged, 'N1');
  assert.deepEqual([stale.bytesEqualStaged, stale.hasNonce], [false, false]);
  // no styles.css request, wrong URL/port, non-200
  assert.equal(proveServedCss(traceFor(null), staged, 'N1').served, false);
  assert.equal(proveServedCss(traceFor(staged, 'http://127.0.0.1:4174/styles.css'), staged, 'N1').served, false);
  assert.equal(proveServedCss(traceFor(staged, undefined, 404), staged, 'N1').served, false);
});

// ------------------------------------------------------------ outcome decision (MAJOR-1)

const row = (status: string, hit = 'add-to-cart', cart = '1') => ({ status, hit, cart });
const failedRow = row('failed', 'promo-overlay', '0');

test('ORACLE_PASS needs exit code 0 AND both trusted tests passing with the expected observations', () => {
  assert.deepEqual(decideOutcome({ exitCode: 0, mobile: row('passed'), desktop: row('passed') }), { outcome: 'ORACLE_PASS', reason: null });
});

test('passing rows with ANY nonzero or missing exit code are INCONCLUSIVE, never a pass', () => {
  for (const exitCode of [1, 2, 7, 130, 137, -1, null]) {
    const d = decideOutcome({ exitCode, mobile: row('passed'), desktop: row('passed') });
    assert.equal(d.outcome, 'INCONCLUSIVE', String(exitCode));
    assert.ok(d.reason);
  }
});

test('genuine candidate failures are PATCH_FAILED only for the ordinary "tests failed" exit (1)', () => {
  assert.equal(decideOutcome({ exitCode: 1, mobile: failedRow, desktop: row('passed') }).outcome, 'PATCH_FAILED');
  assert.equal(decideOutcome({ exitCode: 1, mobile: failedRow, desktop: failedRow }).outcome, 'PATCH_FAILED');
  assert.equal(decideOutcome({ exitCode: 1, mobile: row('passed'), desktop: failedRow }).outcome, 'PATCH_FAILED');
  for (const exitCode of [0, 2, 130, 137, -1, null]) {
    assert.equal(decideOutcome({ exitCode, mobile: failedRow, desktop: row('passed') }).outcome, 'INCONCLUSIVE', String(exitCode));
  }
});

test('unsettled test statuses and passing rows without the expected observations abstain', () => {
  for (const status of ['timedOut', 'skipped', 'interrupted']) {
    assert.equal(decideOutcome({ exitCode: 1, mobile: row(status), desktop: row('passed') }).outcome, 'INCONCLUSIVE', status);
  }
  assert.equal(decideOutcome({ exitCode: 0, mobile: row('passed', 'promo-overlay', '1'), desktop: row('passed') }).outcome, 'INCONCLUSIVE');
  assert.equal(decideOutcome({ exitCode: 0, mobile: row('passed', 'add-to-cart', '0'), desktop: row('passed') }).outcome, 'INCONCLUSIVE');
});

// ------------------------------------------------------------ mandatory evidence (MAJOR-2)

const REQUIRED = ['oracle-report.json', 'oracle-stdout.txt', 'a/obs-m.json', 'a/trace-m.zip', 'b/obs-d.json', 'b/trace-d.zip'];
function evidenceFixture(): { dir: string; record: CandidateRecord } {
  const dir = tmp('pp-evidence-');
  for (const f of REQUIRED) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    writeFileSync(path.join(dir, f), `content of ${f}\n`);
  }
  const record = {
    schemaVersion: 1, label: 'PC-1', approvedSha: 'a'.repeat(40), outcome: 'ORACLE_PASS', failure: null, oracleRan: true, oracleExitCode: 0,
    adjustments: [], renderedCss: '', manifest: null, mobile: null, desktop: null, baselineIdentical: false, sourceProof: [],
    integrityAfterRun: 'intact', stageRemoved: true, requiredEvidence: [...REQUIRED], evidence: [], evidenceFinalized: false,
  } as CandidateRecord;
  return { dir, record };
}
const realIO: EvidenceIO = {
  hashFile: async (f) => {
    const b = readFileSync(f);
    return { sha256: sha256(b), bytes: b.length };
  },
  writeRecord: async (f, t) => writeFileSync(f, t),
};

test('finalizeEvidence hashes every artifact, persists the record and verifies it by read-back', async () => {
  const { dir, record } = evidenceFixture();
  await finalizeEvidence(record, dir, realIO);
  assert.equal(record.evidenceFinalized, true);
  assert.equal(record.evidence.length, REQUIRED.length);
  assert.deepEqual(await verifyPersistedEvidence(dir), []);
  const persisted = JSON.parse(readFileSync(path.join(dir, RECORD_FILE), 'utf8'));
  assert.equal(persisted.outcome, 'ORACLE_PASS');
  assert.equal(persisted.evidenceFinalized, true);
});

test('fault: a missing required artifact makes finalization throw and persists no record', async () => {
  for (const missing of REQUIRED) {
    const { dir, record } = evidenceFixture();
    rmSync(path.join(dir, missing));
    await assert.rejects(finalizeEvidence(record, dir, realIO), /required evidence is missing/, missing);
    assert.equal(existsSync(path.join(dir, RECORD_FILE)), false, missing);
  }
});

test('fault: an incomplete required-evidence list is refused', async () => {
  const { dir, record } = evidenceFixture();
  record.requiredEvidence = ['oracle-report.json'];
  await assert.rejects(finalizeEvidence(record, dir, realIO), /incomplete/);
});

test('fault: a hashing failure throws', async () => {
  const { dir, record } = evidenceFixture();
  await assert.rejects(
    finalizeEvidence(record, dir, { ...realIO, hashFile: async () => { throw new Error('EIO: simulated read failure'); } }),
    /simulated read failure/,
  );
  assert.equal(existsSync(path.join(dir, RECORD_FILE)), false);
});

test('fault: a failed record write throws', async () => {
  const { dir, record } = evidenceFixture();
  await assert.rejects(
    finalizeEvidence(record, dir, { ...realIO, writeRecord: async () => { throw new Error('ENOSPC: simulated write failure'); } }),
    /simulated write failure/,
  );
  assert.equal(existsSync(path.join(dir, RECORD_FILE)), false);
});

test('fault: evidence that changes between hashing and read-back is detected', async () => {
  const { dir, record } = evidenceFixture();
  let calls = 0;
  const flaky: EvidenceIO = {
    ...realIO,
    hashFile: async (f) => {
      const h = await realIO.hashFile(f);
      return ++calls > REQUIRED.length && f.endsWith('trace-m.zip') ? { ...h, sha256: '0'.repeat(64) } : h; // second pass disagrees
    },
  };
  await assert.rejects(finalizeEvidence(record, dir, flaky), /hash mismatch: a\/trace-m\.zip/);
});

test('verifyPersistedEvidence reports a missing record, an unfinalized record, tampering and unhashed files', async () => {
  const { dir, record } = evidenceFixture();
  assert.match((await verifyPersistedEvidence(dir)).join(), /missing or unreadable/);
  await finalizeEvidence(record, dir, realIO);
  appendFileSync(path.join(dir, 'oracle-stdout.txt'), 'tampered');
  assert.match((await verifyPersistedEvidence(dir)).join(), /hash mismatch: oracle-stdout\.txt/);
  writeFileSync(path.join(dir, 'extra.txt'), 'x');
  assert.match((await verifyPersistedEvidence(dir)).join(), /unhashed file on disk: extra\.txt/);
  const rec = JSON.parse(readFileSync(path.join(dir, RECORD_FILE), 'utf8'));
  rec.evidenceFinalized = false;
  writeFileSync(path.join(dir, RECORD_FILE), JSON.stringify(rec));
  assert.match((await verifyPersistedEvidence(dir)).join(), /not marked finalized/);
});
