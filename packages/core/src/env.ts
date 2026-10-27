// Environment hygiene for child processes that must never see credentials
// (browser runner, fixture server, future sandboxes).
const SENSITIVE = /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i;

export function scrubEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(env)) {
    if (!SENSITIVE.test(name)) out[name] = value;
  }
  return out;
}
