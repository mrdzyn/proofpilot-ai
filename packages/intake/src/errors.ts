export type MediaErrorCode =
  | 'INVALID_PATH'
  | 'UNSAFE_PATH'
  | 'FILE_NOT_FOUND'
  | 'FILE_UNREADABLE'
  | 'NOT_A_FILE'
  | 'EMPTY_FILE'
  | 'TOO_LARGE'
  | 'UNSUPPORTED_TYPE'
  | 'TYPE_MISMATCH'
  | 'WEBM_REQUIRES_CONVERSION'
  | 'CORRUPT_MEDIA'
  | 'NO_VIDEO_STREAM'
  | 'UNSUPPORTED_CODEC'
  | 'METADATA_MISSING'
  | 'AMBIGUOUS_METADATA'
  | 'TOO_LONG'
  | 'MEDIA_CHANGED'
  | 'TOOL_UNAVAILABLE'
  | 'CONVERSION_FAILED'
  | 'OUTPUT_EXISTS';

/** Typed media rejection. Messages never contain file contents; paths are reduced to basenames. */
export class MediaError extends Error {
  readonly code: MediaErrorCode;
  constructor(code: MediaErrorCode, message: string) {
    super(message);
    this.name = 'MediaError';
    this.code = code;
  }
}

export type ConsentErrorCode = 'CONSENT_MISSING' | 'CONSENT_INVALID' | 'CONSENT_MISMATCH';

export class ConsentError extends Error {
  readonly code: ConsentErrorCode;
  constructor(code: ConsentErrorCode, message: string) {
    super(message);
    this.name = 'ConsentError';
    this.code = code;
  }
}
