import { describe, expect, it } from 'vitest';

import { isSensitiveFile } from './secrets.js';

describe('isSensitiveFile', () => {
  it('matches .env and .env.* variants in any directory', () => {
    expect(isSensitiveFile('.env')).toBe(true);
    expect(isSensitiveFile('.env.local')).toBe(true);
    expect(isSensitiveFile('config/.env')).toBe(true);
    expect(isSensitiveFile('config\\.env')).toBe(true); // Windows style
  });

  it('matches private keys and key stores', () => {
    expect(isSensitiveFile('id_rsa')).toBe(true);
    expect(isSensitiveFile('ssh/id_ed25519')).toBe(true);
    expect(isSensitiveFile('id_rsa.old')).toBe(true);
    expect(isSensitiveFile('server.pem')).toBe(true);
    expect(isSensitiveFile('keystore.key')).toBe(true);
    expect(isSensitiveFile('bundle.pfx')).toBe(true);
    expect(isSensitiveFile('certs/cert.p12')).toBe(true);
    expect(isSensitiveFile('keys/server.jks')).toBe(true);
    expect(isSensitiveFile('app.keystore')).toBe(true);
  });

  it('matches registry and cloud credential files', () => {
    expect(isSensitiveFile('.npmrc')).toBe(true);
    expect(isSensitiveFile('.netrc')).toBe(true);
    expect(isSensitiveFile('.pypirc')).toBe(true);
    expect(isSensitiveFile('aws/credentials.json')).toBe(true);
    expect(isSensitiveFile('aws/credentials.yaml')).toBe(true);
    expect(isSensitiveFile('firebase/service-account.json')).toBe(true);
    expect(isSensitiveFile('service-account-2.json')).toBe(true);
    expect(isSensitiveFile('gcp_credentials.json')).toBe(true);
    expect(isSensitiveFile('secret.txt')).toBe(true);
    expect(isSensitiveFile('deploy/terraform.tfvars')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isSensitiveFile('SERVER.KEY')).toBe(true);
    expect(isSensitiveFile('Id_RSA')).toBe(true);
  });

  it('does not flag ordinary source and config files', () => {
    expect(isSensitiveFile('src/index.ts')).toBe(false);
    expect(isSensitiveFile('package.json')).toBe(false);
    expect(isSensitiveFile('tsconfig.json')).toBe(false);
    expect(isSensitiveFile('README.md')).toBe(false);
    // Design tradeoff: key-shaped basename prefixes are matched strictly,
    // so a file literally named "rsabuild.txt" is not accidentally secret.
    expect(isSensitiveFile('rsabuild.txt')).toBe(false);
  });

  it('never reads contents by design', () => {
    // Guard against future accidents: the matcher must stay a pure
    // name-based predicate.
    expect(isSensitiveFile('.env')).toBe(true);
    expect(isSensitiveFile('deeply/nested/path/.env')).toBe(true);
  });
});
