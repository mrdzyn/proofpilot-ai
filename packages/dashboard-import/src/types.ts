// Dashboard evidence import: exact-key, bounded validation of real emitted
// scoreboard.json / baseline-summary.json formats, projected into a minimal
// display view-model. Pure: no DOM, no network, no repository imports.
// Any owner-picked file renders as owner-imported, never independently verified.

export type ProvenanceTag = 'owner-imported evidence';

export interface ImportedRow {
  readonly id: string;
  readonly description: string;
  readonly status: string;
  readonly replaysPassed: number;
  readonly replaysAttempted: number;
}

export interface ScoreboardView {
  readonly kind: 'scoreboard';
  readonly label: string;
  readonly approvedSha: string;
  readonly createdAt: string;
  readonly baselineReproduced: boolean;
  readonly rows: readonly ImportedRow[];
  readonly sourceTag: ProvenanceTag;
  readonly claimsExampleNote: boolean;
}

export interface BaselineView {
  readonly kind: 'baseline';
  readonly runId: string;
  readonly verdict: string;
  readonly regression: string;
  readonly certified: boolean;
  readonly sourceTag: ProvenanceTag;
}

export type ImportedView = ScoreboardView | BaselineView;

export type ImportRefusalCode =
  | 'EMPTY'
  | 'TOO_LARGE'
  | 'MALFORMED_JSON'
  | 'DUPLICATE_KEY'
  | 'TOO_DEEP'
  | 'STRING_TOO_LONG'
  | 'TOO_MANY_ITEMS'
  | 'BAD_SHAPE';

export class DashboardImportError extends Error {
  readonly code: ImportRefusalCode;
  constructor(code: ImportRefusalCode, message: string) {
    super(message);
    this.name = 'DashboardImportError';
    this.code = code;
  }
}
