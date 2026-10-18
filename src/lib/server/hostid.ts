import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * A stable identifier of the machine this process runs on, used to bind the stored OpenDART key to
 * the host: a copied database (or backup) plus APP_SECRET is not enough to recover the key elsewhere.
 *
 * Sources, first match wins:
 * - HOST_ID_FILE (in Docker, the host's /etc/machine-id bind-mounted read-only, see README)
 * - Linux: /etc/machine-id, /var/lib/dbus/machine-id
 * - macOS: IOPlatformUUID
 * - Windows: HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid
 *
 * Only a SHA-256 digest is returned; the raw identifier is never stored or logged.
 */
let cached: { id: string | null; source: string | null } | undefined;

function fromFile(path: string): string | null {
  try {
    const v = readFileSync(path, 'utf8').trim();
    // An empty or placeholder machine-id (e.g. "uninitialized" in fresh images) is no identity.
    return /^[0-9a-f-]{16,}$/i.test(v) ? v.toLowerCase() : null;
  } catch {
    return null;
  }
}

function fromCommand(cmd: string, args: string[], pattern: RegExp): string | null {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
    return pattern.exec(out)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function detect(): { id: string | null; source: string | null } {
  const explicit = process.env.HOST_ID_FILE;
  if (explicit) {
    const id = fromFile(explicit);
    return { id, source: id ? 'HOST_ID_FILE' : null };
  }
  if (process.platform === 'linux') {
    for (const p of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      const id = fromFile(p);
      if (id) return { id, source: p };
    }
  } else if (process.platform === 'darwin') {
    const id = fromCommand('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], /"IOPlatformUUID"\s*=\s*"([0-9A-F-]+)"/i);
    if (id) return { id, source: 'IOPlatformUUID' };
  } else if (process.platform === 'win32') {
    const id = fromCommand('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], /MachineGuid\s+REG_SZ\s+([0-9a-f-]+)/i);
    if (id) return { id, source: 'MachineGuid' };
  }
  return { id: null, source: null };
}

/** SHA-256 of the host identifier, or null when none is available. */
export function hostIdDigest(): Buffer | null {
  cached ??= detect();
  return cached.id ? createHash('sha256').update(`magic-dart-service host:${cached.id}`).digest() : null;
}

/** Where the identifier came from (for the admin page), never the value itself. */
export function hostIdSource(): string | null {
  cached ??= detect();
  return cached.source;
}

/** For tests. */
export function resetHostId(): void {
  cached = undefined;
}
