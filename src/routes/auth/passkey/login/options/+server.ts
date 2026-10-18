import { json } from '@sveltejs/kit';
import { clientIp } from '$lib/server/auth/guard';
import { authenticationOptions } from '$lib/server/auth/passkeys';
import { hit, LIMITS, retryText } from '$lib/server/auth/ratelimit';
import { readPendingLogin } from '$lib/server/auth/sessions';

/** Options for a usernameless passkey login, or for the second factor of a pending password login. */
export const POST = async (event) => {
  const { secondFactor } = (await event.request.json().catch(() => ({}))) as { secondFactor?: boolean };
  const wait = hit(`login:ip:${clientIp(event)}`, LIMITS.loginPerIp);
  if (wait) return json({ message: `시도가 너무 많습니다. ${retryText(wait)}` }, { status: 429 });
  if (secondFactor) {
    const pending = readPendingLogin(event.cookies);
    if (!pending) return json({ message: '로그인을 다시 시작하세요' }, { status: 400 });
    return json(await authenticationOptions('second-factor', pending.userId, event.url.origin));
  }
  return json(await authenticationOptions('login', null, event.url.origin));
};
