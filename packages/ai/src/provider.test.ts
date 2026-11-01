import { describe, expect, it } from 'vitest';

import { API_KEY_ENV_VARS, loadApiKey } from './provider.js';

describe('loadApiKey', () => {
  it('reads the correct env var per provider', () => {
    const env = {
      OPENAI_API_KEY: 'sk-openai',
      GEMINI_API_KEY: 'sk-gemini',
      DEEPSEEK_API_KEY: 'sk-deepseek',
      OPENAI_COMPATIBLE_API_KEY: 'sk-compatible',
    };
    expect(loadApiKey('openai', env)).toBe('sk-openai');
    expect(loadApiKey('gemini', env)).toBe('sk-gemini');
    expect(loadApiKey('deepseek', env)).toBe('sk-deepseek');
    expect(loadApiKey('openai-compatible', env)).toBe('sk-compatible');
  });

  it('returns undefined for ollama even when other keys exist', () => {
    const env = { OPENAI_API_KEY: 'sk-openai' };
    expect(loadApiKey('ollama', env)).toBeUndefined();
  });

  it('returns undefined when the variable is missing or blank', () => {
    expect(loadApiKey('openai', {})).toBeUndefined();
    expect(loadApiKey('openai', { OPENAI_API_KEY: '   ' })).toBeUndefined();
  });

  it('never reads a different provider’s variable', () => {
    const env = { GEMINI_API_KEY: 'sk-gemini' };
    expect(loadApiKey('openai', env)).toBeUndefined();
  });
});

describe('API_KEY_ENV_VARS', () => {
  it('maps every keyed provider to a distinct variable', () => {
    const values = Object.values(API_KEY_ENV_VARS);
    expect(new Set(values).size).toBe(values.length);
  });
});
