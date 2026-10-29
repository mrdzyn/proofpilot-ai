// Read-only hygiene check of the activation-pin LINEAGE for the checked-out revision (used by hosted CI; also runnable by the owner).
// It changes nothing, reads no credential, makes no request and approves nothing. It reports whether `config/live-activation.json` is empty
// or pinned and, when pinned, whether this checkout is the pinned tree and a linear, pin-file-only descendant of the pinned commit (the
// exact relationship the production gate enforces. Informational mode always exits 0. --require-valid exits 1 unless the pin is PRESENT and the
// lineage is valid, so an empty pin fails it too (CI uses it when a change touches the pin file: such a change must leave a valid pin).
//
//   node scripts/c3-pin-check.ts [--require-valid]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ACTIVATION_PIN_PATH, createGitProbe } from '../packages/inference/src/index.ts';

const requireValid = process.argv.slice(2).includes('--require-valid');
if (process.argv.slice(2).some((a) => a !== '--require-valid')) {
  console.log('usage: node scripts/c3-pin-check.ts [--require-valid]');
  process.exit(2);
}
const root = path.resolve(import.meta.dirname, '..');
const git = createGitProbe(root);
const head = await git.head();
const doc = JSON.parse(readFileSync(path.join(root, ACTIVATION_PIN_PATH), 'utf8')) as { activation: null | { activationCommit?: string; activationDigest?: string } };
console.log(`head:        ${head}`);
if (doc.activation === null) {
  console.log('pin:         EMPTY (activation: null) — the production gate refuses with ACTIVATION_NOT_PINNED');
  if (requireValid) console.log('result:      FAILED (--require-valid): the pin file is empty, so the pinned lineage cannot be valid');
  process.exit(requireValid ? 1 : 0);
}
const commit = doc.activation?.activationCommit ?? '';
const digest = doc.activation?.activationDigest ?? '';
console.log(`pin:         activationCommit ${commit}`);
let problem: string | null = null;
try {
  if ((await git.treeDigest(commit, ACTIVATION_PIN_PATH)) !== digest) problem = 'the pinned commit does not hash to the pinned digest';
  else if ((await git.treeDigest('HEAD', ACTIVATION_PIN_PATH)) !== digest) problem = 'HEAD is not the pinned tree';
  else {
    const d = await git.pinOnlyDescent(commit, ACTIVATION_PIN_PATH);
    if (!d.ok) problem = `HEAD is not a pin-only descendant of the pinned commit: ${d.reason}`;
  }
} catch {
  problem = 'the pinned commit is not available in this checkout (shallow or unrelated history)';
}
console.log(problem === null ? 'lineage:     VALID (pinned tree, linear pin-file-only descent) — the gate would continue to the operator-approval check' : `lineage:     NOT VALID — ${problem}`);
process.exit(problem !== null && requireValid ? 1 : 0);
