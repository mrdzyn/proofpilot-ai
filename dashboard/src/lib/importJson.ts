// Owner-file import: read picked files, validate, project to the safe view-model.
// Rendering reads only the projected view; raw bytes and raw JSON never reach the DOM.
import {
  importEvidence,
  MAX_FILE_CHARS,
} from '../../../packages/dashboard-import/src/validate.ts';
import {
  DashboardImportError,
  type ImportedView,
} from '../../../packages/dashboard-import/src/types.ts';

export interface ImportSuccess {
  readonly ok: true;
  readonly view: ImportedView;
  readonly fileName: string;
  readonly fileBytes: number;
}

export interface ImportFailure {
  readonly ok: false;
  readonly message: string;
  readonly recovery: string;
}

export type ImportOutcome = ImportSuccess | ImportFailure;

function recoveryFor(code: string): string {
  switch (code) {
    case 'EMPTY':
      return 'Pick a non-empty scoreboard.json or baseline-summary.json file.';
    case 'TOO_LARGE':
      return 'Pick a file of 256 KiB or less; evidence files this large are not importable here.';
    case 'MALFORMED_JSON':
    case 'DUPLICATE_KEY':
      return 'Check the file is complete, valid JSON with no repeated keys, then pick it again.';
    case 'TOO_DEEP':
    case 'STRING_TOO_LONG':
    case 'TOO_MANY_ITEMS':
      return 'The file exceeds the bounded-import limits; only producer-shaped evidence files are accepted.';
    default:
      return 'Pick a scoreboard.json or baseline-summary.json exactly as emitted (no added, renamed, or missing keys).';
  }
}

export async function importPickedJson(file: File): Promise<ImportOutcome> {
  if (file.size > MAX_FILE_CHARS) {
    return {
      ok: false,
      message: `Refused: file is ${file.size} bytes (limit ${MAX_FILE_CHARS}).`,
      recovery: recoveryFor('TOO_LARGE'),
    };
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    return {
      ok: false,
      message: 'Refused: the file could not be read.',
      recovery: 'Pick the file again; if it persists, choose another exported file.',
    };
  }
  try {
    const view = importEvidence(text);
    return { ok: true, view, fileName: file.name, fileBytes: file.size };
  } catch (e: unknown) {
    const message = e instanceof DashboardImportError ? e.message : 'Refused: unreadable evidence file.';
    const code = e instanceof DashboardImportError ? e.code : 'BAD_SHAPE';
    return { ok: false, message: `Refused (${code}): ${message}`, recovery: recoveryFor(code) };
  }
}
