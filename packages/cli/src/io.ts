/**
 * Output channel contract for CLI commands. Injected everywhere so
 * command behavior is testable without capturing process streams, and
 * JSON modes are byte-for-byte deterministic.
 */
export interface Io {
  readonly log: (message: string) => void;
  readonly error: (message: string) => void;
}

/** The real runtime channel (stdout / stderr). */
export const consoleIo: Io = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
};
