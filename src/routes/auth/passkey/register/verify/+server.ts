import { ts } from '$lib/server/i18n';
import { json } from '@sveltejs/kit';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { audit } from '$lib/server/auth/audit';
import { generateRecoveryCodes, recoveryCodesLeft } from '$lib/server/auth/factors';
import { meta, requireUser } from '$lib/server/auth/guard';
import { finishRegistration } from '$lib/server/auth/passkeys';
import { rotateCurrentSession } from '$lib/server/auth/sessions';

export const POST = async (event) => {
  const user = requireUser(event);
  const body = (await event.request.json().catch(() => null)) as { name?: string; response?: RegistrationResponseJSON } | null;
  if (!body?.response) return json({ message: ts('auth.passkey.badRequest') }, { status: 400 });
  let passkey;
  try {
    passkey = await finishRegistration(user.id, String(body.name ?? ''), body.response, event.url.origin);
  } catch {
    return json({ message: ts('auth.passkey.registerFailed') }, { status: 400 });
  }
  const m = meta(event);
  audit({ event: 'passkey_added', userId: user.id, username: user.username, ip: m.ip, detail: passkey.name });
  // A new factor is a privilege change: rotate this browser's session.
  rotateCurrentSession(event.cookies, event.url, user.id, m, event.locals.sessionId);
  // First second factor: hand out recovery codes too (shown once on the account page).
  if (recoveryCodesLeft(user.id) === 0) {
    const codes = generateRecoveryCodes(user.id);
    audit({ event: 'recovery_codes_generated', userId: user.id, username: user.username, ip: m.ip });
    return json({ ok: true, recoveryCodes: codes });
  }
  return json({ ok: true });
};
