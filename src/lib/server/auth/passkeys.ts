import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON
} from '@simplewebauthn/server';
import { db } from '../db';
import { rp } from './config';
import { getUser } from './users';

const CHALLENGE_TTL = 5 * 60 * 1000;

type Purpose = 'register' | 'login' | 'second-factor';

export interface Passkey {
  id: string;
  user_id: number;
  name: string;
  public_key: Buffer;
  counter: number;
  transports: string | null;
  device_type: string | null;
  backed_up: number;
  created_at: number;
  last_used_at: number | null;
}

function storeChallenge(challenge: string, purpose: Purpose, userId: number | null): void {
  db().prepare('DELETE FROM webauthn_challenges WHERE expires_at < ?').run(Date.now());
  db().prepare('INSERT INTO webauthn_challenges (challenge, purpose, user_id, expires_at) VALUES (?, ?, ?, ?)').run(challenge, purpose, userId, Date.now() + CHALLENGE_TTL);
}

/** Single use: the challenge row is deleted when it is checked. */
function consumeChallenge(challenge: string, purpose: Purpose, userId: number | null): boolean {
  return (
    db()
      .prepare('DELETE FROM webauthn_challenges WHERE challenge = ? AND purpose = ? AND user_id IS ? AND expires_at >= ?')
      .run(challenge, purpose, userId, Date.now()).changes === 1
  );
}

export function listPasskeys(userId: number): Passkey[] {
  return db().prepare('SELECT * FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at').all(userId) as Passkey[];
}

function getPasskey(id: string): Passkey | undefined {
  return db().prepare('SELECT * FROM webauthn_credentials WHERE id = ?').get(id) as Passkey | undefined;
}

function transports(p: Passkey): string[] | undefined {
  return p.transports ? (JSON.parse(p.transports) as string[]) : undefined;
}

// ── Registration ───────────────────────────────────────────────────────

export async function registrationOptions(userId: number, requestOrigin?: string) {
  const user = getUser(userId);
  if (!user) throw new Error('no such user');
  const { id: rpID, name: rpName } = rp(requestOrigin);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.username,
    userID: Buffer.from(user.webauthn_user_id, 'base64url'),
    attestationType: 'none',
    excludeCredentials: listPasskeys(userId).map((p) => ({ id: p.id, transports: transports(p) })),
    // Discoverable credentials make usernameless sign-in possible.
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }
  });
  storeChallenge(options.challenge, 'register', userId);
  return options;
}

export async function finishRegistration(userId: number, name: string, response: RegistrationResponseJSON, requestOrigin?: string): Promise<Passkey> {
  const { origin, id: rpID } = rp(requestOrigin);
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: (c) => consumeChallenge(c, 'register', userId),
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false
  });
  if (!result.verified) throw new Error('passkey registration could not be verified');
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
  const label = name.trim().slice(0, 60) || '패스키';
  db()
    .prepare(
      `INSERT INTO webauthn_credentials (id, user_id, name, public_key, counter, transports, device_type, backed_up, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      credential.id,
      userId,
      label,
      Buffer.from(credential.publicKey),
      credential.counter,
      credential.transports ? JSON.stringify(credential.transports) : null,
      credentialDeviceType,
      credentialBackedUp ? 1 : 0,
      Date.now()
    );
  return getPasskey(credential.id)!;
}

export function renamePasskey(userId: number, id: string, name: string): boolean {
  const label = name.trim().slice(0, 60);
  if (!label) return false;
  return db().prepare('UPDATE webauthn_credentials SET name = ? WHERE id = ? AND user_id = ?').run(label, id, userId).changes === 1;
}

export function removePasskey(userId: number, id: string): boolean {
  return db().prepare('DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?').run(id, userId).changes === 1;
}

// ── Authentication ─────────────────────────────────────────────────────

/**
 * `login`: usernameless sign-in with a discoverable credential (user verification required, so
 * the passkey alone is a full login). `second-factor`: after a password, limited to that user's keys.
 */
export async function authenticationOptions(purpose: 'login' | 'second-factor', userId: number | null, requestOrigin?: string) {
  const { id: rpID } = rp(requestOrigin);
  const allowCredentials = purpose === 'second-factor' && userId !== null ? listPasskeys(userId).map((p) => ({ id: p.id, transports: transports(p) })) : undefined;
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
    userVerification: purpose === 'login' ? 'required' : 'preferred'
  });
  storeChallenge(options.challenge, purpose, purpose === 'login' ? null : userId);
  return options;
}

/** Returns the authenticated user id, or null. */
export async function finishAuthentication(
  purpose: 'login' | 'second-factor',
  userId: number | null,
  response: AuthenticationResponseJSON,
  requestOrigin?: string
): Promise<number | null> {
  const passkey = getPasskey(response.id);
  if (!passkey) return null;
  if (purpose === 'second-factor' && passkey.user_id !== userId) return null;
  const { origin, id: rpID } = rp(requestOrigin);
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: (c) => consumeChallenge(c, purpose, purpose === 'login' ? null : userId),
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: { id: passkey.id, publicKey: new Uint8Array(passkey.public_key), counter: passkey.counter, transports: transports(passkey) },
      requireUserVerification: purpose === 'login'
    });
  } catch {
    return null;
  }
  if (!result.verified) return null;
  // For a discoverable login, the authenticator's user handle must match the credential's owner.
  if (purpose === 'login') {
    const owner = getUser(passkey.user_id);
    if (!owner || (response.response.userHandle && response.response.userHandle !== owner.webauthn_user_id)) return null;
  }
  db()
    .prepare('UPDATE webauthn_credentials SET counter = ?, last_used_at = ?, backed_up = ? WHERE id = ?')
    .run(result.authenticationInfo.newCounter, Date.now(), result.authenticationInfo.credentialBackedUp ? 1 : 0, passkey.id);
  return passkey.user_id;
}
