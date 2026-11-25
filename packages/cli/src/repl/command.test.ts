import { describe, expect, it } from 'vitest';

import { parseReplCommand, REPL_HELP } from './command.js';

describe('parseReplCommand', () => {
  it('parses scan forms including --json and explicit directories', () => {
    expect(parseReplCommand('scan')).toEqual({ kind: 'scan', json: false, raw: 'scan' });
    expect(parseReplCommand('  scan packages/web --json ')).toEqual({
      kind: 'scan',
      dir: 'packages/web',
      json: true,
      raw: 'scan packages/web --json',
    });
    expect(parseReplCommand('scan "my project"')).toMatchObject({
      kind: 'scan',
      dir: 'my project',
    });
  });

  it('recognizes console commands', () => {
    for (const command of ['help', 'clear', 'history', 'status', 'exit', 'quit']) {
      expect(parseReplCommand(command).kind).toBe(
        command === 'quit' ? 'exit' : command === 'help' ? 'help' : command,
      );
    }
    expect(parseReplCommand('').kind).toBe('empty');
  });

  it('rejects unknown commands and invalid options', () => {
    expect(parseReplCommand('lint')).toMatchObject({ kind: 'error' });
    expect(parseReplCommand('scan . --watch')).toMatchObject({ kind: 'error' });
    expect(parseReplCommand('scan . extra')).toMatchObject({ kind: 'error' });
  });

  it('documents every supported command', () => {
    const help = REPL_HELP.join('\n');
    expect(help).toContain('scan [dir] [--json]');
    expect(help).toContain('status');
    expect(help).toContain('exit');
  });
});
