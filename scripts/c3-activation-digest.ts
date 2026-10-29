// C3-LIVE-01A: read-only helper for the owner. Prints the activation digest of a commit (every tracked file EXCEPT
// config/live-activation.json), the value the owner records in the pin file in a separate, reviewed commit after the reviewed
// activation commit exists. It changes nothing and approves nothing.
//
//   node scripts/c3-activation-digest.ts [<40-hex commit>]      (default: HEAD)
import path from 'node:path';
import { ACTIVATION_PIN_PATH, createGitProbe } from '../packages/inference/src/index.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
const rev = process.argv[2] ?? 'HEAD';
const probe = createGitProbe(repoRoot);
try {
  const commit = rev === 'HEAD' ? await probe.head() : rev;
  console.log(`activationCommit: ${commit}`);
  console.log(`activationDigest: ${await probe.treeDigest(commit, ACTIVATION_PIN_PATH)}`);
  console.log(`(excludes ${ACTIVATION_PIN_PATH}; informational only: recording it in the pin file is an owner decision)`);
} catch (e) {
  console.log(`error: ${(e as Error).message}`);
  process.exit(2);
}
