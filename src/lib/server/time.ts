const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** YYYYMMDD for the given instant in KST. */
export function kstDate(at: Date | number = Date.now()): string {
  const d = new Date((typeof at === 'number' ? at : at.getTime()) + KST_OFFSET_MS);
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}

/** YYYYMMDD shifted by whole days. */
export function addDays(yyyymmdd: string, days: number): string {
  const d = new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8)));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
