import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth/guard';
import { registrationOptions } from '$lib/server/auth/passkeys';

export const POST = async (event) => {
  const user = requireUser(event);
  return json(await registrationOptions(user.id, event.url.origin));
};
