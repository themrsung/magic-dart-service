import { apiKeyStatus } from '$lib/server/settings';
import { kstDate } from '$lib/server/time';

export const load = ({ locals }) => ({
  user: locals.user,
  keyConfigured: locals.user ? apiKeyStatus().configured : true,
  today: kstDate()
});
