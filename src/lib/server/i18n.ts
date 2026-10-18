import { AsyncLocalStorage } from 'node:async_hooks';
import { DEFAULT_LOCALE, translate, type Locale, type MessageKey, type Params } from '$lib/i18n';

/**
 * The current request's locale, so deep server code (validation errors, rate-limit messages) can
 * produce text in the user's language without threading it through every call. Outside a request
 * (scheduled jobs, tests) it is Korean.
 */
const store = new AsyncLocalStorage<Locale>();

export function runWithLocale<T>(locale: Locale, fn: () => T): T {
  return store.run(locale, fn);
}

export function currentLocale(): Locale {
  return store.getStore() ?? DEFAULT_LOCALE;
}

/** Translates for the current request. */
export function ts(key: MessageKey, params?: Params): string {
  return translate(currentLocale(), key, params);
}
