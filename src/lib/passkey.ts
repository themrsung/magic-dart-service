import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { translator, type Translate } from '$lib/i18n';

const KOREAN = translator('ko');

export { browserSupportsWebAuthn };

async function post(path: string, body: unknown, t: Translate): Promise<Record<string, unknown>> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.message === 'string' ? data.message : t('auth.passkey.requestFailed'));
  return data;
}

function cancelled(err: unknown): boolean {
  return err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError');
}

/** Signs in (or completes the second factor when `secondFactor`). Returns where to go next, or null if the user cancelled. */
export async function passkeyLogin(secondFactor: boolean, next: string, t: Translate = KOREAN): Promise<string | null> {
  const optionsJSON = (await post('/auth/passkey/login/options', { secondFactor }, t)) as never;
  let response;
  try {
    response = await startAuthentication({ optionsJSON });
  } catch (err) {
    if (cancelled(err)) return null;
    throw err;
  }
  const done = await post('/auth/passkey/login/verify', { secondFactor, response, next }, t);
  return String(done.redirect ?? '/');
}

/** Registers a new passkey. Returns null if the user cancelled, else any recovery codes issued with it. */
export async function passkeyRegister(name: string, t: Translate = KOREAN): Promise<{ recoveryCodes?: string[] } | null> {
  const optionsJSON = (await post('/auth/passkey/register/options', {}, t)) as never;
  let response;
  try {
    response = await startRegistration({ optionsJSON });
  } catch (err) {
    if (cancelled(err)) return null;
    if (err instanceof Error && err.name === 'InvalidStateError') throw new Error(t('auth.passkey.alreadyRegistered'));
    throw err;
  }
  const done = await post('/auth/passkey/register/verify', { name, response }, t);
  return { recoveryCodes: Array.isArray(done.recoveryCodes) ? (done.recoveryCodes as string[]) : undefined };
}
