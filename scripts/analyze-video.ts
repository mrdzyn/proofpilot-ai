// Thin wrapper: all logic (and its tests) live in packages/inference/src/analyze-command.ts.
import path from 'node:path';
import { runAnalyzeCommand } from '../packages/inference/src/index.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
process.exitCode = await runAnalyzeCommand(process.argv.slice(2), {
  env: process.env,
  allowedRoot: path.join(repoRoot, '.proofpilot'),
  outRoot: path.join(repoRoot, '.proofpilot/analysis'),
  transport: 'live',
  log: (line) => console.log(line),
});
