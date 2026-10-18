/**
 * Writes every Korean → English UI translation to .i18n-review/translations.md (gitignored) for
 * review: `npm run i18n:report`. Generated from the dictionaries, so it is always complete.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ENDPOINTS } from 'magic-dart';
import { NAMESPACES } from '../src/lib/i18n/index.ts';
import { EVENT_TITLES_EN, TERM_TABLES } from '../src/lib/i18n/dart-terms.ts';

const cell = (s: string) => s.replaceAll('|', '\\|').replaceAll('\n', '<br>');
const COMPARISON = /이상|이하|초과|미만/;
const out: string[] = [];
const today = new Date().toISOString().slice(0, 10);

const rows = Object.entries(NAMESPACES).flatMap(([ns, d]) =>
  Object.entries(d.ko).map(([key, ko]) => ({ ns, key, ko: ko as string, en: (d.en as Record<string, string>)[key] ?? '' }))
);
const termCount = Object.values(TERM_TABLES).reduce((n, t) => n + Object.keys(t).length, 0);

out.push(`# Translation review: Korean → English UI`, '');
out.push(`Generated ${today} by \`npm run i18n:report\` from \`src/lib/i18n\`. ${rows.length} UI strings and ${termCount} DART terms.`, '');
out.push('Mark mistakes inline (e.g. strike through and write the fix), or list them by key.', '');
out.push('## Conventions used', '');
out.push(
  [
    '- **Comparisons are mathematically exact:** 이상 (≥) → "at least X" / "X or more"; 이하 (≤) → "at most X" / "X or less"; 초과 (>) → "more than X"; 미만 (<) → "less than X". Never "over", "under", "up to" or "X+".',
    '- **Amounts:** KRW in trillions ("tn", 2 decimals) and billions ("bn", 1 decimal), e.g. 1조 2,345억원 → KRW 1.23 tn. Hover shows the exact figure.',
    '- **Dates:** ISO `YYYY-MM-DD`; times as `HH:MM KST`.',
    '- **Financial statements:** K-IFRS English. 연결 → Consolidated, 별도 → Separate (not "standalone"), 제 N 기 → "Nth fiscal year".',
    '- **Titles:** Korean Commercial Act usage. 대표이사 → Representative Director, 사외이사 → Outside Director, 감사 → Statutory Auditor.',
    '- **Untranslated DART data:** company names, people, free-text reasons and unrecognised filing titles stay in Korean. Translated filing titles and account names show the Korean original on hover.',
    '- **Search examples** stay in Korean (e.g. 유상증자), because the data being searched is Korean.'
  ].join('\n'),
  ''
);

out.push('## Comparisons (이상 / 이하 / 초과 / 미만)', '');
out.push('Every string containing one of the four terms, for checking the inequality direction and strictness.', '');
out.push('| Key | 한국어 | English |', '| --- | --- | --- |');
for (const r of rows.filter((r) => COMPARISON.test(r.ko))) out.push(`| \`${r.key}\` | ${cell(r.ko)} | ${cell(r.en)} |`);
for (const [table, map] of Object.entries(TERM_TABLES))
  for (const [ko, en] of Object.entries(map)) if (COMPARISON.test(ko)) out.push(`| ${table} | ${cell(ko)} | ${cell(en)} |`);
out.push('');

out.push('## DART and capital-market terms', '');
out.push('From `src/lib/i18n/dart-terms.ts`. These translate OpenDART data at display time.', '');
for (const [table, map] of Object.entries(TERM_TABLES)) {
  out.push(`### ${table}`, '');
  if (map === EVENT_TITLES_EN) {
    out.push('| Endpoint | 한국어 | English |', '| --- | --- | --- |');
    for (const [ep, en] of Object.entries(map)) out.push(`| \`${ep}\` | ${cell((ENDPOINTS as Record<string, { title: string }>)[ep]?.title ?? '?')} | ${cell(en)} |`);
  } else {
    out.push('| 한국어 | English |', '| --- | --- |');
    for (const [ko, en] of Object.entries(map)) out.push(`| ${cell(ko)} | ${cell(en)} |`);
  }
  out.push('');
}

const TITLES: Record<string, string> = {
  common: 'Shared: layout, navigation, errors',
  corp: 'Filings feed, company search, company page',
  auth: 'Sign-in, two-step verification, setup, registration, MCP consent',
  account: 'Account page',
  admin: 'Admin page and OpenDART error messages'
};
out.push('## UI strings', '');
for (const ns of Object.keys(NAMESPACES)) {
  const list = rows.filter((r) => r.ns === ns);
  out.push(`### ${TITLES[ns] ?? ns} (${list.length})`, '');
  out.push('| Key | 한국어 | English |', '| --- | --- | --- |');
  for (const r of list) out.push(`| \`${r.key}\` | ${cell(r.ko)} | ${cell(r.en)} |`);
  out.push('');
}

out.push('## Not translated (by design)', '');
out.push(
  [
    '- DART data values: company names, filers, report reasons, event fields like 증자방식, and filing titles without a mapping above.',
    '- Job run messages already stored in the database. They were written in Korean when the job ran.',
    '- MCP tool names, descriptions and results, which are read by AI clients and are Korean-first.',
    '- OAuth metadata `resource_name` and the default name for unnamed MCP clients.',
    '- The PWA manifest (app name and shortcuts).'
  ].join('\n'),
  ''
);

mkdirSync('.i18n-review', { recursive: true });
writeFileSync('.i18n-review/translations.md', out.join('\n'));
console.log(`wrote .i18n-review/translations.md (${rows.length} strings, ${termCount} terms)`);
