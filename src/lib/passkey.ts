import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';

export { browserSupportsWebAuthn };

async function post(path: string, body: unknown = {}): Promise<Record<string, unknown>> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.message === 'string' ? data.message : '요청이 실패했습니다');
  return data;
}

function cancelled(err: unknown): boolean {
  return err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError');
}

/** Signs in (or completes the second factor when `secondFactor`). Returns where to go next, or null if the user cancelled. */
export async function passkeyLogin(secondFactor: boolean, next: string): Promise<string | null> {
  const optionsJSON = (await post('/auth/passkey/login/options', { secondFactor })) as never;
  let response;
  try {
    response = await startAuthentication({ optionsJSON });
  } catch (err) {
    if (cancelled(err)) return null;
    throw err;
  }
  const done = await post('/auth/passkey/login/verify', { secondFactor, response, next });
  return String(done.redirect ?? '/');
}

/** Registers a new passkey. Returns null if the user cancelled, else any recovery codes issued with it. */
export async function passkeyRegister(name: string): Promise<{ recoveryCodes?: string[] } | null> {
  const optionsJSON = (await post('/auth/passkey/register/options')) as never;
  let response;
  try {
    response = await startRegistration({ optionsJSON });
  } catch (err) {
    if (cancelled(err)) return null;
    if (err instanceof Error && err.name === 'InvalidStateError') throw new Error('이 기기의 패스키는 이미 등록되어 있습니다');
    throw err;
  }
  const done = await post('/auth/passkey/register/verify', { name, response });
  return { recoveryCodes: Array.isArray(done.recoveryCodes) ? (done.recoveryCodes as string[]) : undefined };
}
