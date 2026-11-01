/**
 * Supported AI providers. 'openai-compatible' covers any endpoint that
 * speaks the OpenAI chat-completions protocol (many proxies and local
 * servers) without needing a dedicated adapter.
 */
export type ProviderId = 'openai' | 'gemini' | 'deepseek' | 'ollama' | 'openai-compatible';

/**
 * Environment variable that holds the API key for each provider. Ollama
 * is local and intentionally has no key. Keys are only ever read from the
 * environment or config file — never hardcoded, never logged.
 */
export const API_KEY_ENV_VARS: Readonly<Record<Exclude<ProviderId, 'ollama'>, string>> =
  Object.freeze({
    openai: 'OPENAI_API_KEY',
    gemini: 'GEMINI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    'openai-compatible': 'OPENAI_COMPATIBLE_API_KEY',
  });

/**
 * Reads the API key for a provider from an environment-like record.
 *
 * @returns The key, or undefined when unset/blank. Never returns the
 *          value of an unrelated provider's variable.
 */
export function loadApiKey(
  provider: ProviderId,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  if (provider === 'ollama') {
    return undefined;
  }
  const varName = API_KEY_ENV_VARS[provider];
  const value = env[varName];
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  return value;
}
