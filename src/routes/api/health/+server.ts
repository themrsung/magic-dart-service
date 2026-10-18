import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export const GET = () => {
  db().prepare('SELECT 1').get();
  return json({ ok: true, time: new Date().toISOString() });
};
