import type { Locale } from './i18n/index.ts';
import { RM_EN } from './i18n/dart-terms.ts';
import { parseAmount, parseDate, parseNumber, parseRmFlags } from './normalize';

const nf = new Intl.NumberFormat('ko-KR');
const nfEn = new Intl.NumberFormat('en-US');

/** `n` scaled down by 10^`exp`, rounded half-up to `decimals` places, without floating point. */
function scaled(n: bigint, exp: number, decimals: number): string {
  const q = 10n ** BigInt(exp - decimals);
  const r = (n + q / 2n) / q;
  const d = 10n ** BigInt(decimals);
  const whole = r / d;
  const frac = (r % d).toString().padStart(decimals, '0');
  return decimals ? `${nfEn.format(whole)}.${frac}` : nfEn.format(whole);
}

/**
 * Korean: 1,234,567,000,000 → "1조 2,345억원" (guidelines/03).
 * English (Korean business-English convention): → "KRW 1.23 tn"; 52,000,000,000 → "KRW 52.0 bn".
 * `unit` is the Korean currency suffix; pass '' for bare numbers in tables (English drops "KRW").
 * Returns null for blanks.
 */
export function krwShort(
  raw: string | null | undefined,
  unit = '원',
  locale: Locale = 'ko'
): { text: string; full: string; negative: boolean } | null {
  const v = parseAmount(raw);
  if (v === null) return null;
  const negative = v < 0n;
  const abs = negative ? -v : v;
  if (locale === 'en') {
    const sign = negative ? '−' : '';
    const cur = unit ? 'KRW ' : '';
    let text: string;
    if (abs >= 10n ** 12n) text = `${scaled(abs, 12, 2)} tn`;
    else if (abs >= 10n ** 9n) text = `${scaled(abs, 9, 1)} bn`;
    else if (abs >= 10n ** 6n) text = `${scaled(abs, 6, 1)} mn`;
    else text = nfEn.format(abs);
    return { text: `${sign}${cur}${text}`, full: `${sign}KRW ${nfEn.format(abs)}`, negative };
  }
  const JO = 10n ** 12n;
  const EOK = 10n ** 8n;
  const MAN = 10n ** 4n;
  let text: string;
  if (abs >= JO) {
    const jo = abs / JO;
    const eok = (abs % JO) / EOK;
    text = `${nf.format(jo)}조${eok ? ` ${nf.format(eok)}억` : ''}`;
  } else if (abs >= EOK) {
    text = `${nf.format(abs / EOK)}억`;
  } else if (abs >= MAN) {
    text = `${nf.format(abs / MAN)}만`;
  } else {
    text = nf.format(abs);
  }
  const sign = negative ? '−' : '';
  return { text: `${sign}${text}${unit}`, full: `${sign}${nf.format(abs)}${unit}`, negative };
}

export function num(raw: string | null | undefined, locale: Locale = 'ko'): string {
  const v = parseNumber(raw);
  return v === null ? '—' : (locale === 'en' ? nfEn : nf).format(v);
}

/** YYYYMMDD / YYYY-MM-DD → 2024.03.15 (Korean) or 2024-03-15 (English). */
export function date(raw: string | null | undefined, locale: Locale = 'ko'): string {
  const iso = parseDate(raw);
  if (!iso) return '—';
  return locale === 'en' ? iso : iso.replaceAll('-', '.');
}

/** "3일 전" / "3 days ago" style label for feeds, with KST calendar semantics. */
export function relDay(raw: string, todayYmd: string, locale: Locale = 'ko'): string {
  const a = parseDate(raw);
  const b = parseDate(todayYmd);
  if (!a || !b) return date(raw, locale);
  const diff = Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  if (locale === 'en') {
    if (diff <= 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return `${diff} days ago`;
    return date(raw, locale);
  }
  if (diff <= 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff < 7) return `${diff}일 전`;
  return date(raw);
}

export function ago(ms: number | null | undefined, locale: Locale = 'ko'): string {
  const en = locale === 'en';
  if (!ms) return en ? 'never' : '없음';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return en ? 'just now' : '방금';
  if (s < 3600) return en ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return en ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 3600)}시간 전`;
  const d = Math.floor(s / 86400);
  return en ? `${d} ${d === 1 ? 'day' : 'days'} ago` : `${d}일 전`;
}

export function kstDateTime(ms: number | null | undefined, locale: Locale = 'ko'): string {
  if (!ms) return '—';
  if (locale === 'en') {
    // 2026-10-18 21:56 KST: unambiguous for international readers.
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        .formatToParts(ms)
        .map((x) => [x.type, x.value])
    );
    return `${p.year}-${p.month}-${p.day} ${p.hour === '24' ? '00' : p.hour}:${p.minute} KST`;
  }
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(ms);
}

const AMEND = /^\s*\[([^\]]+)\]\s*/;

/** Splits "[기재정정]사업보고서 (2024.12)" into a status chip and the clean title. */
export function splitReportName(name: string): { chips: string[]; title: string } {
  const chips: string[] = [];
  let rest = name;
  for (let m = AMEND.exec(rest); m; m = AMEND.exec(rest)) {
    chips.push(m[1]);
    rest = rest.slice(m[0].length);
  }
  return { chips, title: rest.trim() };
}

const RM_NAMES: Record<string, string> = {
  유: '유가증권',
  코: '코스닥',
  채: '채권상장',
  넥: '코넥스',
  공: '공정위',
  연: '연결 포함',
  정: '정정 공시 있음',
  철: '철회됨'
};

export function rmChips(rm: string | null | undefined, locale: Locale = 'ko'): { flag: string; label: string; warn: boolean }[] {
  const names = locale === 'en' ? RM_EN : RM_NAMES;
  return parseRmFlags(rm ?? '')
    .filter((f) => !['유', '코', '넥'].includes(f)) // market already shown as a badge
    .map((f) => ({ flag: f, label: names[f] ?? f, warn: f === '정' || f === '철' }));
}

export const MARKET: Record<string, { label: string; cls: string }> = {
  Y: { label: '유가증권', cls: 'kospi' },
  K: { label: '코스닥', cls: 'kosdaq' },
  N: { label: '코넥스', cls: 'konex' },
  E: { label: '기타', cls: 'etc' }
};

export const REPORTS: { code: string; label: string }[] = [
  { code: '11011', label: '사업보고서' },
  { code: '11014', label: '3분기' },
  { code: '11012', label: '반기' },
  { code: '11013', label: '1분기' }
];
