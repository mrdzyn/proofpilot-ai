// Project policy lint (lightweight; not ESLint). Fails on patterns that would
// weaken the trusted oracle or leak configuration.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const rules = [
  { scope: /^verifier\/.*\.ts$/, pattern: /\btest\.(only|fail|skip|fixme)\s*\(|\.only\s*\(/, message: 'focused/skipped/expected-fail tests are forbidden in the trusted oracle' },
  { scope: /^verifier\/.*\.ts$/, pattern: /force\s*:\s*true|dispatchEvent\s*\(/, message: 'force-click or synthetic event dispatch bypasses the real defect' },
  { scope: /^fixtures\/[^/]+\/src\//, pattern: /verifier\//, message: 'fixture code must not reference the verifier' },
  { scope: /\.(ts|mjs|js|json|md|yml|yaml)$/, pattern: /\b(MODEL_API_KEY|BASETEN_API_KEY)\s*=\s*\S{8,}/, message: 'possible credential assignment' },
];

const problems = [];
for (const file of files) {
  if (file === 'scripts/lint.mjs') continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const rule of rules) {
    if (!rule.scope.test(file)) continue;
    text.split('\n').forEach((line, i) => {
      if (rule.pattern.test(line)) problems.push(`${file}:${i + 1}: ${rule.message}`);
    });
  }
  if (/^\.env(\..+)?$/.test(file.split('/').pop()) && !file.endsWith('.env.example')) {
    problems.push(`${file}: local environment file must not be tracked`);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`policy lint: ${files.length} files checked, 0 problems`);
