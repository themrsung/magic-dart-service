import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetSecretCache } from '../src/lib/server/auth/config';
import { db, openDb, setDb } from '../src/lib/server/db';
import { resetHostId } from '../src/lib/server/hostid';
import { apiKeyStatus, ApiKeyStorageError, readApiKey, resetApiKeyCache, writeApiKey } from '../src/lib/server/settings';

const KEY = '0123456789abcdef0123456789abcdef01234567';
const dir = mkdtempSync(join(tmpdir(), 'mds-hostid-'));

function useHost(id: string | null) {
  const file = join(dir, `id-${Math.random().toString(36).slice(2)}`);
  if (id !== null) writeFileSync(file, `${id}\n`);
  process.env.HOST_ID_FILE = file;
  resetHostId();
}

function stored(): string {
  return (db().prepare(`SELECT value FROM settings WHERE key = 'opendart_api_key'`).get() as { value: string }).value;
}

beforeEach(() => {
  setDb(openDb(':memory:'));
  useHost('4c4c4544004e3010804bc4c04f4e3332');
});

afterEach(() => {
  delete process.env.HOST_ID_FILE;
  delete process.env.API_KEY_HOST_BINDING;
  process.env.APP_SECRET = 'test-secret-that-is-at-least-32-characters-long';
  resetSecretCache();
  resetHostId();
});

describe('OpenDART key at rest', () => {
  it('is encrypted and bound to the host', () => {
    writeApiKey(KEY);
    expect(stored()).toMatch(/^enc:h:v1\./);
    expect(stored()).not.toContain(KEY);
    expect(readApiKey()).toBe(KEY);
    const status = apiKeyStatus();
    expect(status).toMatchObject({ configured: true, protection: 'host', hostSource: 'HOST_ID_FILE', error: null });
    expect(JSON.stringify(status)).not.toContain(KEY);
  });

  it('cannot be read on another host or with another APP_SECRET', () => {
    writeApiKey(KEY);
    useHost('ffffffffffffffffffffffffffffffff');
    expect(readApiKey()).toBeUndefined();
    expect(apiKeyStatus()).toMatchObject({ configured: false, stored: true, error: expect.stringMatching(/하드웨어 ID/) });

    useHost('4c4c4544004e3010804bc4c04f4e3332');
    expect(readApiKey()).toBe(KEY);
    process.env.APP_SECRET = 'a-completely-different-secret-of-sufficient-length';
    resetSecretCache();
    writeApiKey(KEY); // re-encrypt under the new secret works…
    process.env.APP_SECRET = 'test-secret-that-is-at-least-32-characters-long';
    resetSecretCache();
    resetApiKeyCache();
    expect(readApiKey()).toBeUndefined(); // …and the old secret can't open it
  });

  it('falls back to APP_SECRET only without a host identifier, and upgrades later', () => {
    useHost(null);
    writeApiKey(KEY);
    expect(stored()).toMatch(/^enc:s:/);
    expect(apiKeyStatus()).toMatchObject({ configured: true, protection: 'secret', hostSource: null });

    useHost('4c4c4544004e3010804bc4c04f4e3332');
    expect(readApiKey()).toBe(KEY);
    expect(stored()).toMatch(/^enc:h:/);
  });

  it('refuses to store without a host identifier when binding is required', () => {
    process.env.API_KEY_HOST_BINDING = 'required';
    useHost(null);
    expect(() => writeApiKey(KEY)).toThrow(ApiKeyStorageError);
    expect(apiKeyStatus().stored).toBe(false);
  });

  it('does not use the host when binding is off', () => {
    process.env.API_KEY_HOST_BINDING = 'off';
    writeApiKey(KEY);
    expect(stored()).toMatch(/^enc:s:/);
    useHost('ffffffffffffffffffffffffffffffff');
    expect(readApiKey()).toBe(KEY);
  });

  it('encrypts a plaintext key left in the database', () => {
    db().prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('opendart_api_key', ?, 1)`).run(KEY);
    expect(readApiKey()).toBe(KEY);
    expect(stored()).toMatch(/^enc:h:/);
    expect(apiKeyStatus().updatedAt).toBe(1);
  });

  it('ignores placeholder machine ids', () => {
    useHost('uninitialized');
    writeApiKey(KEY);
    expect(stored()).toMatch(/^enc:s:/);
  });
});
