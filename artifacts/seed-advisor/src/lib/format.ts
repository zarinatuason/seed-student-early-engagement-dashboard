import type { DemoDate } from '@workspace/api-client-react';

export const EMPTY = '—';
export const UNAVAILABLE = 'Unavailable';
export const POLL_MS = 12000;

const dayFmt = new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dtFmt = new Intl.DateTimeFormat('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Pacific/Auckland' });
const weekdayFmt = new Intl.DateTimeFormat('en-NZ', { weekday: 'long', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('en-NZ', { month: 'long', timeZone: 'UTC' });

export const ymd = (v: string) => v.slice(0, 10);
const asUtc = (v: string) => new Date(`${ymd(v)}T00:00:00Z`);
/** Calendar date (YYYY-MM-DD slice), never shifted by time zone. */
export const dayLabel = (v?: string | null) => (v ? dayFmt.format(asUtc(v)) : EMPTY);
/** Real system timestamp, Pacific/Auckland. Audit use only. */
export const dateTimeLabel = (v?: string | null) => (v ? dtFmt.format(new Date(v)) : EMPTY);
export const longDay = (v: string) => {
  const d = asUtc(v);
  return `${d.getUTCDate()} ${monthFmt.format(d)} ${d.getUTCFullYear()}`;
};
export const scenarioLabel = (d: DemoDate) => `${weekdayFmt.format(asUtc(d.date))} ${longDay(d.date)} · Week ${d.week} · Day ${d.day}`;
export const checkpointLabel = (d: DemoDate) => `Week 4 academic checkpoint · ${longDay(d.evidenceThrough)}`;
export const dayOptionLabel = (day: number) => {
  const d = new Date(Date.UTC(2026, 6, 20 + day - 1));
  return `Day ${day} · ${dayFmt.format(d)}`;
};
export const pct = (v?: number | null) => (v == null ? UNAVAILABLE : `${Number(v.toFixed(1))}%`);
export const num = (v?: number | null) => (v == null ? UNAVAILABLE : String(v));

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function apiErrorMessage(error: unknown, fallback: string) {
  const value = error as { data?: unknown; response?: { data?: unknown } };
  for (const c of [value?.data, value?.response?.data]) {
    if (c && typeof c === 'object' && 'error' in c && typeof (c as { error: unknown }).error === 'string') return (c as { error: string }).error;
  }
  return fallback;
}

export type FollowState = 'overdue' | 'today' | 'upcoming';
export const followState = (date: string, today: string): FollowState => {
  const a = ymd(date);
  return a < today ? 'overdue' : a === today ? 'today' : 'upcoming';
};

export const safeBack = (value: string | null): string | null => (value && value.startsWith('/') && !value.startsWith('//') ? value : null);
export const recordHref = (learnerId: string, courseCode: string, back?: string | null) =>
  `/records/${encodeURIComponent(learnerId)}/${encodeURIComponent(courseCode)}${back ? `?back=${encodeURIComponent(back)}` : ''}`;
export const backLabelFor = (back: string | null) => {
  const p = (back || '/records').split('?')[0];
  if (p === '/') return 'Back to Overview';
  if (p.startsWith('/tracker')) return 'Back to Review Tracker';
  if (p.startsWith('/inbox')) return 'Back to SEED Inbox';
  return 'Back to Academic Records';
};
