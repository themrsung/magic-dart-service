import type { CompanyProfile, CorpCodeEntry, DartRow, Filing, MajorAccountRow } from 'magic-dart';
import { db } from './db';

export interface CorpRow {
  corp_code: string;
  corp_name: string;
  corp_eng_name: string;
  stock_code: string;
  corp_cls: string | null;
  profile_at: number | null;
  financials_at: number | null;
  ownership_at: number | null;
}

export interface FilingRow {
  rcept_no: string;
  corp_code: string;
  corp_name: string;
  corp_cls: string | null;
  stock_code: string | null;
  report_nm: string;
  flr_nm: string | null;
  rcept_dt: string;
  rm: string | null;
}

// ── corps ──────────────────────────────────────────────────────────────

export function upsertCorps(entries: CorpCodeEntry[]): number {
  const stmt = db().prepare(
    `INSERT INTO corps (corp_code, corp_name, corp_eng_name, stock_code, modify_date)
     VALUES (@corp_code, @corp_name, @corp_eng_name, @stock_code, @modify_date)
     ON CONFLICT(corp_code) DO UPDATE SET
       corp_name = excluded.corp_name, corp_eng_name = excluded.corp_eng_name,
       stock_code = excluded.stock_code, modify_date = excluded.modify_date`
  );
  db().transaction(() => {
    for (const e of entries) stmt.run({ ...e, stock_code: e.stock_code.trim() });
  })();
  return entries.length;
}

export function corpCount(): { total: number; listed: number } {
  return db()
    .prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(stock_code <> ''), 0) AS listed FROM corps`)
    .get() as { total: number; listed: number };
}

export function getCorp(code: string): CorpRow | undefined {
  return db().prepare('SELECT * FROM corps WHERE corp_code = ?').get(code) as CorpRow | undefined;
}

/** Name / English name / 6-digit stock code search, listed companies first. */
export function searchCorps(q: string, limit = 20, listedOnly = false): CorpRow[] {
  const term = q.trim();
  if (!term) return [];
  const like = `%${term.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
  const prefix = `${term.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
  return db()
    .prepare(
      `SELECT * FROM corps
       WHERE (corp_name LIKE @like ESCAPE '\\' OR corp_eng_name LIKE @like ESCAPE '\\' OR stock_code LIKE @prefix ESCAPE '\\')
         ${listedOnly ? "AND stock_code <> ''" : ''}
       ORDER BY (corp_name = @term OR stock_code = @term) DESC,
                (stock_code <> '') DESC,
                (corp_name LIKE @prefix ESCAPE '\\') DESC,
                length(corp_name), corp_name
       LIMIT @limit`
    )
    .all({ like, prefix, term, limit }) as CorpRow[];
}

/** Listed corp codes ordered by the oldest value of a freshness column (never-fetched first). */
export function listedByStaleness(column: 'profile_at' | 'financials_at' | 'ownership_at', limit: number): string[] {
  return (
    db()
      .prepare(`SELECT corp_code FROM corps WHERE stock_code <> '' ORDER BY ${column} IS NOT NULL, ${column} LIMIT ?`)
      .all(limit) as { corp_code: string }[]
  ).map((r) => r.corp_code);
}

export function listedCodes(): string[] {
  return (db().prepare(`SELECT corp_code FROM corps WHERE stock_code <> '' ORDER BY corp_code`).all() as { corp_code: string }[]).map(
    (r) => r.corp_code
  );
}

// ── companies ──────────────────────────────────────────────────────────

export function upsertCompany(code: string, profile: CompanyProfile): void {
  const now = Date.now();
  db().transaction(() => {
    db()
      .prepare(
        `INSERT INTO companies (corp_code, json, fetched_at) VALUES (?, ?, ?)
         ON CONFLICT(corp_code) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at`
      )
      .run(code, JSON.stringify(profile), now);
    db().prepare('UPDATE corps SET profile_at = ?, corp_cls = ? WHERE corp_code = ?').run(now, profile.corp_cls ?? null, code);
  })();
}

export function getCompany(code: string): { profile: CompanyProfile; fetchedAt: number } | undefined {
  const row = db().prepare('SELECT json, fetched_at FROM companies WHERE corp_code = ?').get(code) as
    | { json: string; fetched_at: number }
    | undefined;
  return row && { profile: JSON.parse(row.json), fetchedAt: row.fetched_at };
}

// ── filings ────────────────────────────────────────────────────────────

/** Inserts filings; returns the ones that were not already stored. */
export function upsertFilings(filings: Filing[]): Filing[] {
  const now = Date.now();
  const exists = db().prepare('SELECT 1 FROM filings WHERE rcept_no = ?');
  const stmt = db().prepare(
    `INSERT INTO filings (rcept_no, corp_code, corp_name, corp_cls, stock_code, report_nm, flr_nm, rcept_dt, rm, fetched_at)
     VALUES (@rcept_no, @corp_code, @corp_name, @corp_cls, @stock_code, @report_nm, @flr_nm, @rcept_dt, @rm, @fetched_at)
     ON CONFLICT(rcept_no) DO UPDATE SET report_nm = excluded.report_nm, rm = excluded.rm, fetched_at = excluded.fetched_at`
  );
  const fresh: Filing[] = [];
  db().transaction(() => {
    for (const f of filings) {
      if (!exists.get(f.rcept_no)) fresh.push(f);
      stmt.run({
        rcept_no: f.rcept_no,
        corp_code: f.corp_code,
        corp_name: f.corp_name,
        corp_cls: f.corp_cls ?? null,
        stock_code: f.stock_code ?? null,
        report_nm: f.report_nm,
        flr_nm: f.flr_nm ?? null,
        rcept_dt: f.rcept_dt,
        rm: f.rm ?? null,
        fetched_at: now
      });
    }
  })();
  return fresh;
}

export function hasFiling(rcept_no: string): boolean {
  return !!db().prepare('SELECT 1 FROM filings WHERE rcept_no = ?').get(rcept_no);
}

export interface FilingQuery {
  corp_code?: string;
  /** Cursor: return filings strictly older than this rcept_no. */
  before?: string;
  q?: string;
  limit?: number;
  listedOnly?: boolean;
}

export function queryFilings({ corp_code, before, q, limit = 50, listedOnly }: FilingQuery): FilingRow[] {
  const where: string[] = [];
  const args: Record<string, unknown> = { limit };
  if (corp_code) {
    where.push('corp_code = @corp_code');
    args.corp_code = corp_code;
  }
  if (before) {
    where.push('rcept_no < @before');
    args.before = before;
  }
  if (q) {
    where.push(`(report_nm LIKE @q OR corp_name LIKE @q)`);
    args.q = `%${q}%`;
  }
  if (listedOnly) where.push(`corp_cls IN ('Y', 'K', 'N')`);
  return db()
    .prepare(
      `SELECT rcept_no, corp_code, corp_name, corp_cls, stock_code, report_nm, flr_nm, rcept_dt, rm FROM filings
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY rcept_no DESC LIMIT @limit`
    )
    .all(args) as FilingRow[];
}

export function filingCount(): number {
  return (db().prepare('SELECT COUNT(*) AS n FROM filings').get() as { n: number }).n;
}

// ── financials ─────────────────────────────────────────────────────────

/** Stores key-account rows grouped by company. Rows without a corp_code are resolved via their stock code. */
export function upsertFinancials(
  rows: MajorAccountRow[],
  bsns_year: number,
  reprt_code: string,
  requested: string[]
): number {
  const now = Date.now();
  const byCorp = new Map<string, MajorAccountRow[]>();
  const byStock = db().prepare('SELECT corp_code FROM corps WHERE stock_code = ?');
  for (const r of rows) {
    const code = r.corp_code || (byStock.get(r.stock_code) as { corp_code: string } | undefined)?.corp_code;
    if (!code) continue;
    (byCorp.get(code) ?? byCorp.set(code, []).get(code)!).push(r);
  }
  const put = db().prepare(
    `INSERT INTO financials (corp_code, bsns_year, reprt_code, json, fetched_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(corp_code, bsns_year, reprt_code) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at`
  );
  const touch = db().prepare('UPDATE corps SET financials_at = ? WHERE corp_code = ?');
  db().transaction(() => {
    for (const [code, list] of byCorp) put.run(code, bsns_year, reprt_code, JSON.stringify(list), now);
    for (const code of requested) touch.run(now, code);
  })();
  return byCorp.size;
}

export interface FinancialPeriod {
  bsns_year: number;
  reprt_code: string;
  rows: MajorAccountRow[];
  fetchedAt: number;
}

export function getFinancials(code: string): FinancialPeriod[] {
  return (
    db()
      .prepare(
        `SELECT bsns_year, reprt_code, json, fetched_at FROM financials WHERE corp_code = ?
         ORDER BY bsns_year DESC, CASE reprt_code WHEN '11011' THEN 4 WHEN '11014' THEN 3 WHEN '11012' THEN 2 ELSE 1 END DESC`
      )
      .all(code) as { bsns_year: number; reprt_code: string; json: string; fetched_at: number }[]
  ).map((r) => ({ bsns_year: r.bsns_year, reprt_code: r.reprt_code, rows: JSON.parse(r.json), fetchedAt: r.fetched_at }));
}

export function getFinancialPeriod(code: string, year: number, reprt: string): FinancialPeriod | undefined {
  const r = db()
    .prepare('SELECT bsns_year, reprt_code, json, fetched_at FROM financials WHERE corp_code = ? AND bsns_year = ? AND reprt_code = ?')
    .get(code, year, reprt) as { bsns_year: number; reprt_code: string; json: string; fetched_at: number } | undefined;
  return r && { bsns_year: r.bsns_year, reprt_code: r.reprt_code, rows: JSON.parse(r.json), fetchedAt: r.fetched_at };
}

// ── ownership ──────────────────────────────────────────────────────────

export function setOwnership(code: string, kind: string, rows: DartRow[]): void {
  const now = Date.now();
  db().transaction(() => {
    db()
      .prepare(
        `INSERT INTO ownership (corp_code, kind, json, fetched_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(corp_code, kind) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at`
      )
      .run(code, kind, JSON.stringify(rows), now);
    db().prepare('UPDATE corps SET ownership_at = ? WHERE corp_code = ?').run(now, code);
  })();
}

export function getOwnership(code: string, kind: string): { rows: DartRow[]; fetchedAt: number } | undefined {
  const r = db().prepare('SELECT json, fetched_at FROM ownership WHERE corp_code = ? AND kind = ?').get(code, kind) as
    | { json: string; fetched_at: number }
    | undefined;
  return r && { rows: JSON.parse(r.json), fetchedAt: r.fetched_at };
}

// ── events ─────────────────────────────────────────────────────────────

export function upsertEvents(endpoint: string, code: string, rows: DartRow[], window?: { bgn_de: string; end_de: string }): void {
  const now = Date.now();
  const put = db().prepare(
    `INSERT INTO events (endpoint, rcept_no, corp_code, json, fetched_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint, rcept_no) DO UPDATE SET json = excluded.json, fetched_at = excluded.fetched_at`
  );
  db().transaction(() => {
    for (const r of rows) if (r.rcept_no) put.run(endpoint, r.rcept_no, code, JSON.stringify(r), now);
    if (window)
      db()
        .prepare(
          `INSERT INTO event_fetches (corp_code, endpoint, bgn_de, end_de, fetched_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(corp_code, endpoint) DO UPDATE SET bgn_de = excluded.bgn_de, end_de = excluded.end_de, fetched_at = excluded.fetched_at`
        )
        .run(code, endpoint, window.bgn_de, window.end_de, now);
  })();
}

export interface EventRow {
  endpoint: string;
  rcept_no: string;
  row: DartRow;
  fetchedAt: number;
}

export function getEvents(code: string, limit = 200): EventRow[] {
  return (
    db()
      .prepare('SELECT endpoint, rcept_no, json, fetched_at FROM events WHERE corp_code = ? ORDER BY rcept_no DESC LIMIT ?')
      .all(code, limit) as { endpoint: string; rcept_no: string; json: string; fetched_at: number }[]
  ).map((r) => ({ endpoint: r.endpoint, rcept_no: r.rcept_no, row: JSON.parse(r.json), fetchedAt: r.fetched_at }));
}

export function lastEventSweep(code: string): number | null {
  const r = db().prepare('SELECT MIN(fetched_at) AS t, COUNT(*) AS n FROM event_fetches WHERE corp_code = ?').get(code) as {
    t: number | null;
    n: number;
  };
  return r.t;
}

// ── pending detail fetches ─────────────────────────────────────────────

export function enqueueDetail(code: string, endpoint: string, rcept_dt: string): void {
  db()
    .prepare(
      `INSERT INTO pending_fetches (corp_code, endpoint, rcept_dt, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(corp_code, endpoint) DO UPDATE SET rcept_dt = MIN(rcept_dt, excluded.rcept_dt)`
    )
    .run(code, endpoint, rcept_dt, Date.now());
}

export interface PendingFetch {
  corp_code: string;
  endpoint: string;
  rcept_dt: string;
  attempts: number;
}

export function nextPending(limit: number): PendingFetch[] {
  return db()
    .prepare('SELECT corp_code, endpoint, rcept_dt, attempts FROM pending_fetches ORDER BY attempts, created_at LIMIT ?')
    .all(limit) as PendingFetch[];
}

export function resolvePending(code: string, endpoint: string, ok: boolean): void {
  if (ok) db().prepare('DELETE FROM pending_fetches WHERE corp_code = ? AND endpoint = ?').run(code, endpoint);
  else
    db()
      .prepare(
'UPDATE pending_fetches SET attempts = attempts + 1 WHERE corp_code = ? AND endpoint = ?')
      .run(code, endpoint);
  db().prepare('DELETE FROM pending_fetches WHERE attempts >= 5').run();
}

export function pendingCount(): number {
  return (db().prepare('SELECT COUNT(*) AS n FROM pending_fetches').get() as { n: number }).n;
}

// ── job state ──────────────────────────────────────────────────────────

export function getCursor(job: string): string | null {
  const r = db().prepare('SELECT cursor FROM job_state WHERE job = ?').get(job) as { cursor: string | null } | undefined;
  return r?.cursor ?? null;
}

export function setCursor(job: string, cursor: string | null): void {
  db()
    .prepare(
      `INSERT INTO job_state (job, cursor, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(job) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at`
    )
    .run(job, cursor, Date.now());
}

export function getStateTime(job: string): number | null {
  const r = db().prepare('SELECT updated_at FROM job_state WHERE job = ?').get(job) as { updated_at: number } | undefined;
  return r?.updated_at ?? null;
}
