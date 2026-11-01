/**
 * Sensitive-file policy. Files matched here are never indexed, never read,
 * and never uploaded to AI providers — in any phase, for any feature.
 *
 * Matching is conservative: a few non-secret files (like `.env.example`)
 * are excluded too because a broken pattern on a key-shaped file is far
 * worse than skipping a safe file.
 */
const SENSITIVE_BASENAME_PATTERNS: readonly RegExp[] = [
  // .env and .env.* (drops .env.example too — intentional, see JSDoc above).
  /^\.env($|\.)/i,
  // SSH and other private keys, incl. suffixed variants (id_rsa.old).
  /^id_(rsa|dsa|ed25519|ecdsa)(\.|$)/i,
  // Certificates / key stores. .pem is kept even though public certs use
  // it — private keys do too, and we do not need cert contents.
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /\.jks$/i,
  /\.keystore$/i,
  // Registry / net credentials.
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^\.netrc$/i,
  /^\.htpasswd$/i,
  /^\.s3cfg$/i,
  // Cloud provider credential files.
  /^credentials\.(json|ya?ml)$/i,
  /^(firebase[-_])?service[-_]?account.*\.json$/i,
  /^gcp[-_]?credentials.*\.json$/i,
  // Secret-of-the-named-format files.
  /^secrets?\.(json|txt|ya?ml)$/i,
  // Terraform variable files frequently contain secrets.
  /\.tfvars$/i,
];

/**
 * Whether a file path must never be indexed or read, judged by its base
 * name. Directory traversal paths are accepted in either separator style;
 * only the final segment is evaluated, so `keys/server.key` matches via
 * its basename segment.
 */
export function isSensitiveFile(entryPath: string): boolean {
  const segments = entryPath.split(/[/\\]/);
  const base = segments.at(-1) ?? '';
  if (base === '') {
    return false;
  }
  return SENSITIVE_BASENAME_PATTERNS.some((pattern) => pattern.test(base));
}
