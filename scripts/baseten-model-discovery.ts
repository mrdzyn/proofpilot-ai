// Owner-run, single-request Baseten model discovery (prepared in C3-B2A, NOT run there).
// Default is a dry run. See packages/inference/src/baseten-discovery.ts and docs/BASETEN-COMPATIBILITY-PLAN.md.
import { runBasetenDiscovery } from '../packages/inference/src/baseten-discovery.ts';

process.exitCode = await runBasetenDiscovery(process.argv.slice(2), { env: process.env, log: (l) => console.log(l) });
