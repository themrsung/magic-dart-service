import {
  OpenDartClient,
  OpenDartError,
  OpenDartHttpError,
  OpenDartValidationError,
  RequestBudgetExceededError
} from 'magic-dart';
import { db } from './db';
import { ts } from './i18n';
import { AUTO_DAILY_BUDGET, TOTAL_DAILY_CAP, apiKeyVersion, readApiKey, redact } from './settings';
import { kstDate } from './time';

export type Source = 'cron' | 'ui' | 'mcp' | 'setup';

export class NoApiKeyError extends Error {
  constructor() {
    super(ts('admin.dart.noKey'));
  }
}

export class DailyCapError extends Error {
  constructor() {
    super(ts('admin.dart.dailyCap'));
  }
}

function bump(source: Source): void {
  db()
    .prepare(
      `INSERT INTO api_usage (day, source, count) VALUES (?, ?, 1)
       ON CONFLICT(day, source) DO UPDATE SET count = count + 1`
    )
    .run(kstDate(), source);
}

export function usageToday(source?: Source): number {
  const day = kstDate();
  const row = source
    ? db().prepare('SELECT count FROM api_usage WHERE day = ? AND source = ?').get(day, source)
    : db().prepare('SELECT COALESCE(SUM(count), 0) AS count FROM api_usage WHERE day = ?').get(day);
  return (row as { count: number } | undefined)?.count ?? 0;
}

export function usageHistory(days = 14): { day: string; source: string; count: number }[] {
  return db()
    .prepare('SELECT day, source, count FROM api_usage ORDER BY day DESC LIMIT ?')
    .all(days * 4) as { day: string; source: string; count: number }[];
}

/** Every HTTP request the client sends (retries included) is recorded against `source`. */
function countingFetch(source: Source): typeof fetch {
  return (input, init) => {
    bump(source);
    return fetch(input, init);
  };
}

/** OpenDART API root. Override only for testing (e.g. the mock in test/mock-opendart). */
export function openDartBaseUrl(): string | undefined {
  return process.env.OPENDART_BASE_URL?.replace(/\/+$/, '') || undefined;
}

function newClient(source: Source, maxRequests?: number, key = readApiKey()): OpenDartClient {
  if (!key) throw new NoApiKeyError();
  return new OpenDartClient({
    apiKey: key,
    baseUrl: openDartBaseUrl(),
    requestsPerSecond: source === 'cron' ? 4 : 6,
    maxRequests,
    fetch: countingFetch(source)
  });
}

/** Client for one scheduled job run, capped at `cap` and at what is left of today's automatic budget. */
export function cronClient(cap = Infinity): OpenDartClient {
  const left = Math.min(AUTO_DAILY_BUDGET - usageToday('cron'), TOTAL_DAILY_CAP - usageToday());
  if (left <= 0) throw new RequestBudgetExceededError(AUTO_DAILY_BUDGET);
  return newClient('cron', Math.min(left, cap));
}

const onDemand = new Map<Source, { version: number; client: OpenDartClient }>();

/** Shared client for user-triggered (UI / MCP) fetches. Not counted against the automatic budget. */
export function interactiveClient(source: 'ui' | 'mcp'): OpenDartClient {
  if (usageToday() >= TOTAL_DAILY_CAP) throw new DailyCapError();
  const version = apiKeyVersion();
  const hit = onDemand.get(source);
  if (hit && hit.version === version) return hit.client;
  const client = newClient(source);
  onDemand.set(source, { version, client });
  return client;
}

/** Client for validating a candidate key before it is saved. */
export function probeClient(key: string): OpenDartClient {
  return newClient('setup', 3, key);
}

export type ErrorKind = 'nokey' | 'auth' | 'quota' | 'maintenance' | 'validation' | 'network' | 'nodata' | 'unknown';

export interface ErrorInfo {
  kind: ErrorKind;
  status?: string;
  message: string;
}

/** Maps a thrown error to a UI-safe description. Never includes the key or request URLs. */
export function describeError(err: unknown): ErrorInfo {
  // Messages are produced here (not when the error was created) so they follow the current request's language.
  if (err instanceof NoApiKeyError) return { kind: 'nokey', message: ts('admin.dart.noKey') };
  if (err instanceof DailyCapError) return { kind: 'quota', message: ts('admin.dart.dailyCap') };
  if (err instanceof RequestBudgetExceededError) return { kind: 'quota', message: ts('admin.dart.autoBudget') };
  if (err instanceof OpenDartValidationError) return { kind: 'validation', message: redact(err.message) };
  if (err instanceof OpenDartError) {
    const s = err.status;
    if (err.isNoData) return { kind: 'nodata', status: s, message: ts('admin.dart.noData') };
    if (s === '010') return { kind: 'auth', status: s, message: ts('admin.dart.010') };
    if (s === '011') return { kind: 'auth', status: s, message: ts('admin.dart.011') };
    if (s === '012') return { kind: 'auth', status: s, message: ts('admin.dart.012') };
    if (s === '901') return { kind: 'auth', status: s, message: ts('admin.dart.901') };
    if (s === '020') return { kind: 'quota', status: s, message: ts('admin.dart.020') };
    if (s === '800') return { kind: 'maintenance', status: s, message: ts('admin.dart.800') };
    if (s === '100' || s === '101' || s === '021')
      return { kind: 'validation', status: s, message: redact(err.apiMessage || err.message) };
    return { kind: 'unknown', status: s, message: redact(err.apiMessage || err.message) };
  }
  if (err instanceof OpenDartHttpError) return { kind: 'network', message: redact(err.message) };
  return { kind: 'unknown', message: redact(err instanceof Error ? err.message : String(err)) };
}

/** Throws unless the key can make one real call from this host. */
export async function validateKey(key: string): Promise<void> {
  try {
    // 삼성전자: always present, cheap single-object response.
    await probeClient(key).company('00126380');
  } catch (err) {
    // "No data" (013) still means the key and IP were accepted; only other errors are a failed check.
    if (err instanceof OpenDartError && err.isNoData) return;
    throw err;
  }
}
