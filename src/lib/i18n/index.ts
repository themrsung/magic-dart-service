/**
 * UI translations. Korean is the source language; English follows Korean business-English
 * conventions (see dart-terms.ts and GLOSSARY in messages/common.ts).
 *
 * Components: `const t = $derived(translator(page.data.locale))`, then `t('common.nav.filings')`.
 * Server code: `ts(...)` from $lib/server/i18n, which uses the current request's locale.
 *
 * Imports here use explicit .ts extensions so scripts/i18n-report.ts can run them with plain node.
 */
import * as account from './messages/account.ts';
import * as admin from './messages/admin.ts';
import * as auth from './messages/auth.ts';
import * as common from './messages/common.ts';
import * as corp from './messages/corp.ts';

export const LOCALES = ['ko', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ko';
export const LOCALE_COOKIE = 'lang';

export const NAMESPACES = { common, corp, auth, account, admin } as const;

const ko = { ...common.ko, ...corp.ko, ...auth.ko, ...account.ko, ...admin.ko };
export type MessageKey = keyof typeof ko;
const en: Record<MessageKey, string> = { ...common.en, ...corp.en, ...auth.en, ...account.en, ...admin.en };

const TABLES: Record<Locale, Record<MessageKey, string>> = { ko, en };

export type Params = Record<string, string | number | null | undefined>;

export function normalizeLocale(v: unknown): Locale {
  return v === 'en' ? 'en' : 'ko';
}

/** Cookie first, then the browser's preference order between Korean and English; Korean otherwise. */
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (cookie === 'ko' || cookie === 'en') return cookie;
  const prefs = (acceptLanguage ?? '')
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { lang: tag.toLowerCase().split('-')[0], q: q === undefined ? 1 : Number(q) };
    })
    .filter((p) => p.lang && p.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const p of prefs) if (p.lang === 'ko' || p.lang === 'en') return p.lang;
  return DEFAULT_LOCALE;
}

/** `{name}` placeholders are replaced from `params`; unknown keys fall back to Korean, then the key. */
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const s = TABLES[locale][key] ?? ko[key] ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] === undefined || params[k] === null ? m : String(params[k])));
}

export type Translate = (key: MessageKey, params?: Params) => string;

export function translator(locale: unknown): Translate {
  const l = normalizeLocale(locale);
  return (key, params) => translate(l, key, params);
}

/** BCP 47 tag for Intl formatting. */
export function intlLocale(locale: Locale): string {
  return locale === 'en' ? 'en-US' : 'ko-KR';
}
