/**
 * Machine-readable error codes surfaced by the CLI and usable by
 * integrations. Codes are stable API: never rename an existing one.
 */
export type VibeGuardErrorCode =
  'NO_PROJECT' | 'INVALID_PACKAGE_JSON' | 'INVALID_CONFIG' | 'CONFIG_EXISTS';

/**
 * Structured error type thrown by VibeGuard core modules. The CLI renders
 * `[code] message` and maps codes to exit codes.
 */
export class VibeGuardError extends Error {
  readonly code: VibeGuardErrorCode;

  override get name(): string {
    return 'VibeGuardError';
  }

  constructor(code: VibeGuardErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
