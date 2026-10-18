import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto';

export type RegistrationMode = 'closed' | 'invite' | 'open';

/**
 * The single public origin of this deployment (e.g. https://dart.example.com). adapter-node reads
 * the same ORIGIN variable to build request URLs; in `vite dev` it falls back to the request.
 */
export function appOrigin(requestOrigin?: string): string {
  const env = process.env.ORIGIN?.replace(/\/+$/, '');
  if (env) return env;
  if (requestOrigin) return requestOrigin;
  throw new Error('ORIGIN is not set');
}

/** WebAuthn relying party: the origin's hostname. */
export function rp(requestOrigin?: string) {
  const origin = appOrigin(requestOrigin);
  return { origin, id: new URL(origin).hostname, name: 'MagicDART' };
}

export function registrationMode(): RegistrationMode {
  const v = (process.env.REGISTRATION ?? 'invite').toLowerCase();
  return v === 'closed' || v === 'open' ? v : 'invite';
}

/** Cookies get `Secure` everywhere except plain-http localhost during development. */
export function secureCookies(url: URL): boolean {
  return url.protocol === 'https:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

let master: Buffer | undefined;

/** APP_SECRET (≥ 32 characters) is the root of every server-side key. */
function masterKey(): Buffer {
  if (master) return master;
  const secret = process.env.APP_SECRET ?? '';
  if (secret.length < 32) throw new Error('APP_SECRET must be set to at least 32 random characters (e.g. `openssl rand -base64 48`)');
  master = Buffer.from(secret, 'utf8');
  return master;
}

/** Throws at startup instead of at the first login if the secret is missing. */
export function assertSecret(): void {
  masterKey();
}

/** `binding` mixes extra key material (e.g. the host identifier digest) into the derived key. */
function subkey(purpose: string, binding?: Buffer): Buffer {
  const ikm = binding ? Buffer.concat([masterKey(), binding]) : masterKey();
  return Buffer.from(hkdfSync('sha256', ikm, 'magic-dart-service', purpose, 32));
}

/**
 * AES-256-GCM, encoded as `v1.<iv>.<tag>.<ciphertext>` (base64url). The purpose is also bound as
 * associated data, so a value sealed for one purpose cannot be opened as another.
 */
export function seal(plaintext: string, purpose: string, binding?: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', subkey(purpose, binding), iv);
  cipher.setAAD(Buffer.from(purpose, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

/** Throws if the value was sealed with a different APP_SECRET, purpose or binding. */
export function unseal(sealed: string, purpose: string, binding?: Buffer): string {
  const [v, iv, tag, ct] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('unrecognised sealed value');
  const decipher = createDecipheriv('aes-256-gcm', subkey(purpose, binding), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(purpose, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

/** Keyed hash for low-entropy-but-random secrets (recovery codes): useless without APP_SECRET. */
export function keyedHash(value: string, purpose: string): string {
  return createHmac('sha256', subkey(purpose)).update(value).digest('hex');
}

/** For tests. */
export function resetSecretCache(): void {
  master = undefined;
}
