import { json } from '@sveltejs/kit';
import { searchCorps } from '$lib/server/store';

export const GET = ({ url }) => {
  const q = url.searchParams.get('q') ?? '';
  return json(
    searchCorps(q, 12).map((c) => ({ corp_code: c.corp_code, corp_name: c.corp_name, stock_code: c.stock_code, corp_cls: c.corp_cls }))
  );
};
