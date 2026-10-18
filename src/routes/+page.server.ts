import { filingCount, queryFilings } from '$lib/server/store';

export const load = ({ url }) => {
  const q = url.searchParams.get('q')?.trim() || undefined;
  const before = url.searchParams.get('before') || undefined;
  const listedOnly = url.searchParams.get('all') !== '1';
  const filings = queryFilings({ q, before, listedOnly, limit: 50 });
  return { filings, q, listedOnly, total: filingCount(), next: filings.length === 50 ? filings.at(-1)!.rcept_no : null };
};
