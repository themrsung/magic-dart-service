import { json } from '@sveltejs/kit';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { audit } from '$lib/server/auth/audit';
import { meta, safeNext } from '$lib/server/auth/guard';
import { completeLogin, secondFactorFailed, secondFactorRateLimited } from '$lib/server/auth/login';
import { finishAuthentication } from '$lib/server/auth/passkeys';
import { hit, LIMITS, retryText } from '$lib/server/auth/ratelimit';
import { failPendingLogin, readPendingLogin } from '$lib/server/auth/sessions';
import { getUser } from '$lib/server/auth/users';

const GENERIC = '패스키를 확인할 수 없습니다.';

export const POST = async (event) => {
  const body = (await event.request.json().catch(() => null)) as { secondFactor?: boolean; response?: AuthenticationResponseJSON; next?: string } | null;
  if (!body?.response || typeof body.response.id !== 'string') return json({ message: GENERIC }, { status: 400 });
  const next = safeNext(body.next);
  const m = meta(event);

  if (body.secondFactor) {
    const pending = readPendingLogin(event.cookies);
    if (!pending) return json({ message: '로그인을 다시 시작하세요' }, { status: 400 });
    const limited = secondFactorRateLimited(event, pending.userId);
    if (limited) return json({ message: limited }, { status: 429 });
    const userId = await finishAuthentication('second-factor', pending.userId, body.response, event.url.origin);
    if (userId !== pending.userId) {
      secondFactorFailed(event, pending.userId, 'passkey');
      failPendingLogin(pending.id);
      return json({ message: GENERIC }, { status: 400 });
    }
    completeLogin(event, userId, 'password+passkey', pending.id);
    return json({ redirect: next });
  }

  const wait = hit(`login:ip:${m.ip}`, LIMITS.loginPerIp);
  if (wait) return json({ message: `시도가 너무 많습니다. ${retryText(wait)}` }, { status: 429 });
  const userId = await finishAuthentication('login', null, body.response, event.url.origin);
  const user = userId === null ? undefined : getUser(userId);
  if (!user || user.disabled_at) {
    audit({ event: 'login_failed', userId: user?.id, username: user?.username, ip: m.ip, detail: user ? 'disabled (passkey)' : 'passkey' });
    return json({ message: GENERIC }, { status: 400 });
  }
  completeLogin(event, user.id, 'passkey');
  return json({ redirect: next });
};
