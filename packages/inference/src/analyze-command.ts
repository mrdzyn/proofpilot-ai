// `pnpm analyze:video`: validate a recording and (only with --live and every
// opt-in) ask Muse Spark to describe it. The DEFAULT is a dry run that makes no
// network call. The CLI never builds consent on its own: it needs the explicit flag.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ConsentError, createVideoConsent, MediaError, validateVideoFile, MEDIA_LIMITS, type MediaDeps } from '../../intake/src/index.ts';
import { createProvider, FILE_EXPIRY_SECONDS, type FetchLike } from './client.ts';
import { loadProviderConfig } from './config.ts';
import { InferenceError } from './errors.ts';
import { analyzeRecording } from './video-analysis.ts';

export type AnalyzeCommandDeps = {
  env: Record<string, string | undefined>;
  /** Recordings must live under this directory (symlinks and traversal are rejected). */
  allowedRoot: string;
  /** Results are written to <outRoot>/<runId>/analysis.json. */
  outRoot: string;
  /** How the result must be labelled: real API traffic, or a mocked transport in tests. */
  transport: 'live' | 'mock';
  fetch?: FetchLike;
  /** Probe/decode implementation; defaults to local ffprobe/ffmpeg. Injectable for tests. */
  mediaDeps?: MediaDeps;
  log: (line: string) => void;
  clock?: () => number;
};

const USAGE = `usage: analyze-video --video <file.mp4> --run-id <id> [--description <text>] [--consent-meta-video-analysis] [--live]

  default (dry run)  validate the recording and print what WOULD be sent. No network call is made.
  --live             really upload to Meta and analyse. Also requires --consent-meta-video-analysis,
                     PROOFPILOT_ALLOW_BILLABLE_CALLS=1 and PROOFPILOT_ALLOW_VIDEO_UPLOAD=1.
                     Do not use without the project owner's authorization.`;

export async function runAnalyzeCommand(argv: string[], deps: AnalyzeCommandDeps): Promise<number> {
  const { log } = deps;
  let values: ReturnType<typeof parseArgs>['values'];
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        video: { type: 'string' },
        'run-id': { type: 'string' },
        description: { type: 'string' },
        'consent-meta-video-analysis': { type: 'boolean' },
        live: { type: 'boolean' },
        help: { type: 'boolean' },
      },
    }));
  } catch (e) {
    log(`usage error: ${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    log(USAGE);
    return 0;
  }
  if (typeof values.video !== 'string' || typeof values['run-id'] !== 'string') {
    log(`usage error: --video and --run-id are required\n${USAGE}`);
    return 2;
  }
  const runId = values['run-id'];
  const description = typeof values.description === 'string' ? values.description : undefined;
  const live = values.live === true;
  const consentGiven = values['consent-meta-video-analysis'] === true;

  try {
    const video = await validateVideoFile(values.video, { allowedRoot: deps.allowedRoot, deps: deps.mediaDeps });
    log(`video valid:   ${video.basename}  mp4/${video.videoCodec} ${video.width}x${video.height}, ${video.durationSec.toFixed(2)} s, ${video.bytes} bytes (limits ${MEDIA_LIMITS.maxBytes} bytes / ${MEDIA_LIMITS.maxDurationSec} s)`);
    log(`sha256:        ${video.sha256}`);
    log(`consent:       ${consentGiven ? 'GIVEN for this run and this exact video' : 'NOT GIVEN (a live run would be refused)'}`);

    if (!live) {
      const cfg = loadProviderConfig('meta', deps.env);
      log('mode:          DRY RUN. NETWORK CALLS MADE: 0');
      log(`would send:    POST ${cfg.baseUrl}/files (purpose=user_data, expires_after ${FILE_EXPIRY_SECONDS.default} s) → POST ${cfg.baseUrl}/responses (model ${cfg.models.visual}, input_file + text.format json_schema) → DELETE ${cfg.baseUrl}/files/<id>`);
      log(`opt-ins:       billable=${cfg.billableCallsAllowed ? 'ON' : 'off'}, video upload=${cfg.videoUploadAllowed ? 'ON' : 'off'}, API key=${cfg.apiKey ? 'present' : 'NOT SET'}`);
      return 0;
    }

    if (!consentGiven) throw new ConsentError('CONSENT_MISSING', 'pass --consent-meta-video-analysis to confirm this video may be sent to Meta');
    const consent = createVideoConsent({ runId, videoSha256: video.sha256 });
    const provider = createProvider(loadProviderConfig('meta', deps.env), { fetch: deps.fetch });
    log(`mode:          ${deps.transport.toUpperCase()} analysis`);
    const result = await analyzeRecording({ provider, video, consent, runId, description, clock: deps.clock });

    const outDir = path.join(deps.outRoot, runId);
    await mkdir(outDir, { recursive: true, mode: 0o700 });
    const outFile = path.join(outDir, 'analysis.json');
    await writeFile(
      outFile,
      JSON.stringify({ schemaVersion: 1, evidenceKind: deps.transport, createdAt: new Date().toISOString(), result }, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 }, // never overwrite a previous analysis
    );
    log(`result:        ${result.status}  (evidence kind: ${deps.transport})`);
    if (result.status === 'ANALYSIS_FAILED') log(`failure:       ${result.failure.code}: ${result.failure.message}`);
    else log(`assessment:    can attempt reproduction = ${result.assessment.canAttemptReproduction} (${result.assessment.reasons.join('; ')})`);
    log(`cleanup:       ${result.provenance.cleanup.deleted ? 'remote file deleted' : (result.provenance.cleanup.note ?? 'n/a')}`);
    log(`written:       ${path.relative(process.cwd(), outFile)}`);
    return result.status === 'VIDEO_ANALYZED' ? 0 : 1;
  } catch (e) {
    if (e instanceof MediaError || e instanceof ConsentError || e instanceof InferenceError) {
      log(`refused:       ${e.code}: ${e.message}`);
      return 2;
    }
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === 'EEXIST') {
      log('refused:       an analysis for this run id already exists; choose a new --run-id');
      return 2;
    }
    throw e;
  }
}
