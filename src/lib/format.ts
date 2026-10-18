import { parseAmount, parseDate, parseNumber, parseRmFlags } from './normalize';

const nf = new Intl.NumberFormat('ko-KR');

/** 1,234,567,000,000 → "1조 2,345억" (guidelines/03). Returns null for blanks. */
export function krwShort(raw: string | null | undefined, unit = '원'): { text: string; full: string; negative: boolean } | null {
  const v = parseAmount(raw);
  if (v === null) return null;
  const negative = v < 0n;
  const abs = negative ? -v : v;
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

export function num(raw: string | null | undefined): string {
  const v = parseNumber(raw);
  return v === null ? '—' : nf.format(v);
}

/** YYYYMMDD / YYYY-MM-DD → 2024.03.15 */
export function date(raw: string | null | undefined): string {
  const iso = parseDate(raw);
  return iso ? iso.replaceAll('-', '.') : '—';
}

/** "3일 전" style label for feeds, with KST calendar semantics. */
export function relDay(raw: string, todayYmd: string): string {
  const a = parseDate(raw);
  const b = parseDate(todayYmd);
  if (!a || !b) return date(raw);
  const diff = Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  if (diff <= 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff < 7) return `${diff}일 전`;
  return date(raw);
}

export function ago(ms: number | null | undefined): string {
  if (!ms) return '없음';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

export function kstDateTime(ms: number | null | undefined): string {
  if (!ms) return '—';
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

export function rmChips(rm: string | null | undefined): { flag: string; label: string; warn: boolean }[] {
  return parseRmFlags(rm ?? '')
    .filter((f) => !['유', '코', '넥'].includes(f)) // market already shown as a badge
    .map((f) => ({ flag: f, label: RM_NAMES[f] ?? f, warn: f === '정' || f === '철' }));
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
