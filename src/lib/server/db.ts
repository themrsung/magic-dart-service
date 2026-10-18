import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Ordered schema migrations; index + 1 is the resulting `user_version`. */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- 고유번호 목록. listed = stock_code <> ''
  CREATE TABLE corps (
    corp_code TEXT PRIMARY KEY,
    corp_name TEXT NOT NULL,
    corp_eng_name TEXT NOT NULL DEFAULT '',
    stock_code TEXT NOT NULL DEFAULT '',
    modify_date TEXT NOT NULL DEFAULT '',
    corp_cls TEXT,
    profile_at INTEGER,
    financials_at INTEGER,
    ownership_at INTEGER
  );
  CREATE INDEX corps_stock ON corps(stock_code);
  CREATE INDEX corps_name ON corps(corp_name);

  CREATE TABLE companies (
    corp_code TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );

  CREATE TABLE filings (
    rcept_no TEXT PRIMARY KEY,
    corp_code TEXT NOT NULL,
    corp_name TEXT NOT NULL,
    corp_cls TEXT,
    stock_code TEXT,
    report_nm TEXT NOT NULL,
    flr_nm TEXT,
    rcept_dt TEXT NOT NULL,
    rm TEXT,
    fetched_at INTEGER NOT NULL
  );
  CREATE INDEX filings_corp ON filings(corp_code, rcept_dt DESC);
  CREATE INDEX filings_dt ON filings(rcept_dt DESC, rcept_no DESC);

  -- Key accounts (fnlttSinglAcnt/fnlttMultiAcnt rows, both CFS and OFS) per period.
  CREATE TABLE financials (
    corp_code TEXT NOT NULL,
    bsns_year INTEGER NOT NULL,
    reprt_code TEXT NOT NULL,
    json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (corp_code, bsns_year, reprt_code)
  );

  -- majorstock / elestock rows per company.
  CREATE TABLE ownership (
    corp_code TEXT NOT NULL,
    kind TEXT NOT NULL,
    json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (corp_code, kind)
  );

  -- DS005 major-event rows.
  CREATE TABLE events (
    endpoint TEXT NOT NULL,
    rcept_no TEXT NOT NULL,
    corp_code TEXT NOT NULL,
    json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (endpoint, rcept_no)
  );
  CREATE INDEX events_corp ON events(corp_code, rcept_no DESC);

  -- When each (company, event endpoint) was last swept, and for what window.
  CREATE TABLE event_fetches (
    corp_code TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    bgn_de TEXT NOT NULL,
    end_de TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (corp_code, endpoint)
  );

  -- Detail fetches queued by the filings feed (ownership / major-event endpoints).
  CREATE TABLE pending_fetches (
    corp_code TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    rcept_dt TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (corp_code, endpoint)
  );

  CREATE TABLE api_usage (
    day TEXT NOT NULL,
    source TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, source)
  );

  CREATE TABLE job_state (
    job TEXT PRIMARY KEY,
    cursor TEXT,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE job_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job TEXT NOT NULL,
    trigger TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    status TEXT NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0,
    message TEXT
  );
  CREATE INDEX job_runs_job ON job_runs(job, started_at DESC);

  CREATE TABLE oauth_clients (
    client_id TEXT PRIMARY KEY,
    client_name TEXT NOT NULL,
    redirect_uris TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    approved_at INTEGER,
    revoked_at INTEGER
  );

  CREATE TABLE oauth_codes (
    code_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    code_challenge TEXT NOT NULL,
    scope TEXT NOT NULL,
    resource TEXT,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE oauth_tokens (
    token_hash TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    client_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER
  );
  CREATE INDEX oauth_tokens_client ON oauth_tokens(client_id);
  `,
  `
  -- Accounts. Usernames are stored lowercased.
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
    webauthn_user_id TEXT NOT NULL UNIQUE,
    totp_secret TEXT,
    totp_pending TEXT,
    totp_last_step INTEGER,
    created_at INTEGER NOT NULL,
    password_changed_at INTEGER NOT NULL,
    disabled_at INTEGER
  );

  -- Only SHA-256 hashes of session tokens are stored.
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    method TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  -- Password accepted, second factor still owed.
  CREATE TABLE login_challenges (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE recovery_codes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    used_at INTEGER,
    PRIMARY KEY (user_id, code_hash)
  );

  CREATE TABLE webauthn_credentials (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    public_key BLOB NOT NULL,
    counter INTEGER NOT NULL,
    transports TEXT,
    device_type TEXT,
    backed_up INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER
  );
  CREATE INDEX webauthn_credentials_user ON webauthn_credentials(user_id);

  CREATE TABLE webauthn_challenges (
    challenge TEXT PRIMARY KEY,
    purpose TEXT NOT NULL,
    user_id INTEGER,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE invites (
    token_hash TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
    note TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    revoked_at INTEGER
  );

  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    user_id INTEGER,
    username TEXT,
    event TEXT NOT NULL,
    ip TEXT,
    detail TEXT
  );
  CREATE INDEX audit_log_at ON audit_log(at DESC);

  -- MCP clients and their grants now belong to the user who approved them.
  -- Grants issued before accounts existed have no owner, so they are dropped.
  DELETE FROM oauth_tokens;
  DELETE FROM oauth_codes;
  DELETE FROM oauth_clients;
  ALTER TABLE oauth_clients ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
  ALTER TABLE oauth_codes ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE oauth_tokens ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
  CREATE INDEX oauth_tokens_user ON oauth_tokens(user_id);
  `
];

export type DB = Database.Database;

export function openDb(file: string): DB {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

export function migrate(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

let instance: DB | undefined;

export function db(): DB {
  if (!instance) {
    const dir = process.env.DATA_DIR ?? 'data';
    mkdirSync(dir, { recursive: true });
    instance = openDb(join(dir, 'dart.sqlite'));
  }
  return instance;
}

/** For tests: swap in an in-memory database. */
export function setDb(next: DB): void {
  instance = next;
}
