import ora from 'ora';
import type { Ora } from 'ora';

/**
 * Spinner abstraction: real `ora` rendering on a TTY, a no-op otherwise.
 * Deterministic output in test/non-TTY environments equals all spinner
 * families being silent there.
 */
export interface Spinner {
  succeed(text?: string): void;
  fail(text?: string): void;
}

class OraSpinner implements Spinner {
  constructor(private readonly instance: Ora) {}

  public succeed(text?: string): void {
    this.instance.succeed(text);
  }

  public fail(text?: string): void {
    this.instance.fail(text);
  }
}

class SilentSpinner implements Spinner {
  public succeed(_text?: string): void {
    // Non-TTY output stays clean by design.
  }

  public fail(_text?: string): void {
    // Non-TTY runAction prints the error itself.
  }
}

/**
 * Creates a spinner on stderr. In non-TTY environments (tests, CI logs,
 * piped output) a silent spinner is returned so output is deterministic.
 */
export function createSpinner(text: string): Spinner {
  if (!process.stderr.isTTY) {
    return new SilentSpinner();
  }
  return new OraSpinner(ora({ text, stream: process.stderr }));
}
