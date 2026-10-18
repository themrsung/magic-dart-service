import { Cron } from 'croner';
import { cronClient, describeError } from '../dart';
import { db } from '../db';
import { redact } from '../settings';
import { JOBS, type JobDef } from './definitions';

export interface JobRun {
  id: number;
  job: string;
  trigger: string;
  started_at: number;
  finished_at: number | null;
  status: 'running' | 'ok' | 'error' | 'skipped' | 'budget';
  requests: number;
  message: string | null;
}

let chain: Promise<void> = Promise.resolve();
const queued = new Set<string>();
let crons: Cron[] = [];

async function execute(job: JobDef, trigger: string): Promise<void> {
  const started = Date.now();
  const id = Number(
    db().prepare(`INSERT INTO job_runs (job, trigger, started_at, status) VALUES (?, ?, ?, 'running')`).run(job.name, trigger, started)
      .lastInsertRowid
  );
  const lines: string[] = [];
  const finish = (status: JobRun['status'], requests: number) =>
    db()
      .prepare('UPDATE job_runs SET finished_at = ?, status = ?, requests = ?, message = ? WHERE id = ?')
      .run(Date.now(), status, requests, redact(lines.join('\n')).slice(0, 4000), id);

  let client;
  try {
    client = cronClient(job.cap);
  } catch (err) {
    const info = describeError(err);
    lines.push(info.message);
    finish(info.kind === 'quota' ? 'budget' : 'skipped', 0);
    return;
  }
  try {
    await job.run({ client, log: (m) => lines.push(m) });
    finish('ok', client.requestCount);
  } catch (err) {
    const info = describeError(err);
    lines.push(info.message);
    finish(info.kind === 'quota' ? 'budget' : 'error', client.requestCount);
  }
}

/** Queues a job; runs are strictly serial so the shared budget is spent in priority order. */
export function enqueue(name: string, trigger = 'schedule'): boolean {
  const job = JOBS.find((j) => j.name === name);
  if (!job || queued.has(name)) return false;
  queued.add(name);
  chain = chain
    .then(() => execute(job, trigger))
    .catch((err) => console.error('[jobs]', name, redact(String(err))))
    .finally(() => queued.delete(name));
  return true;
}

export function isQueued(name: string): boolean {
  return queued.has(name);
}

export function startScheduler(): void {
  if (crons.length) return;
  // Mark runs interrupted by a restart.
  db().prepare(`UPDATE job_runs SET status = 'error', message = '서버 재시작으로 중단됨', finished_at = ? WHERE status = 'running'`).run(Date.now());
  crons = JOBS.map((job) => new Cron(job.schedule, { timezone: 'Asia/Seoul', protect: true }, () => void enqueue(job.name)));
  // First boot: no corp list yet, so fetch it right away (no-op without an API key).
  const has = db().prepare('SELECT 1 FROM corps LIMIT 1').get();
  if (!has) enqueue('corpCodes', 'startup');
  console.log('[jobs] scheduler started:', JOBS.map((j) => `${j.name}@${j.schedule}`).join(', '));
}

export function stopScheduler(): void {
  for (const c of crons) c.stop();
  crons = [];
}

export function jobOverview() {
  const last = db().prepare('SELECT * FROM job_runs WHERE job = ? ORDER BY started_at DESC LIMIT 1');
  return JOBS.map((j) => {
    const cron = crons.find((_, i) => JOBS[i] === j);
    return {
      name: j.name,
      label: j.label,
      schedule: j.schedule,
      cap: j.cap,
      queued: queued.has(j.name),
      next: cron?.nextRun()?.getTime() ?? null,
      last: (last.get(j.name) as JobRun | undefined) ?? null
    };
  });
}

export function recentRuns(limit = 30): JobRun[] {
  return db().prepare('SELECT * FROM job_runs ORDER BY started_at DESC LIMIT ?').all(limit) as JobRun[];
}
