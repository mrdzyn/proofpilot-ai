// Test-only builder for synthetic proposal artifacts (P2 Zone P). The shape mirrors the real sanitized
// `ProposalArtifact` (same keys, nesting, lifecycle and limits objects) with synthetic values only; the real
// stored file is never read. Everything lives in temp directories with owner-only permissions.
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderCssAdjustments } from '../../packages/core/src/index.ts';

export const ARTIFACT_RUN_ID = 'c3-test-source-001';

const TRIPLES = [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }];

/** A synthetic accepted artifact doc with the real sanitized shape. Override any field (or the run id). */
export const validArtifactDoc = (runId: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  schemaVersion: 1,
  label: 'UNTRUSTED PROPOSAL — NOT VERIFIED',
  provenance: 'model-hypothesis',
  runId,
  providerId: 'meta',
  requestedModel: 'muse-spark-1.3',
  respondedModel: 'muse-spark-1.3',
  inputSha256: 'a'.repeat(64),
  outputSha256: 'b'.repeat(64),
  outputBytes: 97,
  status: 'PROPOSAL_ACCEPTED',
  reason: null,
  forbiddenClass: null,
  adjustments: TRIPLES.map((t) => ({ ...t })),
  renderedCss: renderCssAdjustments(TRIPLES),
  requestId: '11111111-2222-4333-8444-555555555555',
  usage: { inputTokens: 670, outputTokens: 630, totalTokens: 1300, reasoningTokens: 601, videoFramesProcessed: null },
  lifecycle: { status: 'completed', errorCode: null, incompleteReason: null, refusal: false, completed: true },
  limits: { maxInputChars: 12000, maxOutputTokens: 3072 },
  slot: 1,
  createdAt: '2026-10-30T00:00:00.000Z',
  ...over,
});

export const artifactFileFor = (root: string, runId: string): string =>
  path.join(root, '.proofpilot/evidence/proposals', runId, 'proposal.json');

/** Write raw artifact bytes with an exact mode (default owner-only). Returns the file path. */
export const writeArtifact = (root: string, runId: string, raw: string, mode = 0o600): string => {
  const file = artifactFileFor(root, runId);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, raw);
  chmodSync(file, mode);
  return file;
};

export const writeArtifactDoc = (root: string, runId: string, doc: Record<string, unknown> = validArtifactDoc(runId)): string =>
  writeArtifact(root, runId, JSON.stringify(doc));

/** Replace the artifact file with a symlink to another file. */
export const linkArtifact = (root: string, runId: string, target: string): string => {
  const file = artifactFileFor(root, runId);
  mkdirSync(path.dirname(file), { recursive: true });
  symlinkSync(target, file);
  return file;
};
