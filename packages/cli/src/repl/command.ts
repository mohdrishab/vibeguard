/** Commands accepted by the in-terminal VibeGuard console. */
export type ReplCommand =
  | { readonly kind: 'scan'; readonly dir?: string; readonly json: boolean; readonly raw: string }
  | { readonly kind: 'help' | 'clear' | 'history' | 'status' | 'exit'; readonly raw: string }
  | { readonly kind: 'empty'; readonly raw: string }
  | { readonly kind: 'error'; readonly message: string; readonly raw: string };

export const REPL_HELP: readonly string[] = Object.freeze([
  'scan [dir] [--json]   Run a live scan with progress and a diagnostic report',
  'status                Show the last scan summary',
  'history               Show commands from this session',
  'clear                 Clear the terminal',
  'help                  Show this command list',
  'exit                  Leave the console',
  '↑ / ↓                 Browse command history',
]);

function tokenize(input: string): string[] {
  const matches = input.match(/"[^"]*"|'[^']*'|\S+/gu) ?? [];
  return matches.map((token) => {
    if (token.length >= 2 && (token.startsWith('"') || token.startsWith("'"))) {
      return token.slice(1, -1);
    }
    return token;
  });
}

/** Parses a console line with the same scan grammar as the CLI command. */
export function parseReplCommand(input: string): ReplCommand {
  const raw = input.trim();
  const tokens = tokenize(raw);
  const first = tokens[0]?.toLowerCase();

  if (tokens.length === 0) {
    return { kind: 'empty', raw };
  }
  if (first === 'help' || first === '--help' || first === '-h') {
    return { kind: 'help', raw };
  }
  if (first === 'clear' || first === 'cls') {
    return { kind: 'clear', raw };
  }
  if (first === 'history') {
    return { kind: 'history', raw };
  }
  if (first === 'status') {
    return { kind: 'status', raw };
  }
  if (first === 'exit' || first === 'quit' || first === 'q') {
    return { kind: 'exit', raw };
  }
  if (first !== 'scan') {
    return {
      kind: 'error',
      message: `Unknown command "${tokens[0]}". Type help for available commands.`,
      raw,
    };
  }

  let dir: string | undefined;
  let json = false;
  for (const token of tokens.slice(1)) {
    if (token === '--json' || token === '-j') {
      json = true;
    } else if (token === '--help' || token === '-h') {
      return { kind: 'help', raw };
    } else if (token.startsWith('-')) {
      return { kind: 'error', message: `Unknown option "${token}" for scan.`, raw };
    } else if (dir === undefined) {
      dir = token;
    } else {
      return { kind: 'error', message: `Unexpected argument "${token}" for scan.`, raw };
    }
  }

  return { kind: 'scan', ...(dir === undefined ? {} : { dir }), json, raw };
}
