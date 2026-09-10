import type { TimelineEntry, TimelineKind } from '@/lib/services/crm/timelineService';

/**
 * Utilidades puras del timeline (FASE-09 §4.5): merge sin duplicados,
 * agrupación por día y etiquetas. Sin dependencias de React ni Supabase.
 */

export function entryKey(e: Pick<TimelineEntry, 'kind' | 'id'>): string {
  return `${e.kind}:${e.id}`;
}

function cmpDesc(a: TimelineEntry, b: TimelineEntry): number {
  const ta = Date.parse(a.occurred_at);
  const tb = Date.parse(b.occurred_at);
  if (ta !== tb) return tb - ta;
  return b.id.localeCompare(a.id);
}

/**
 * Fusiona páginas / refrescos realtime: la versión nueva de una misma entrada
 * (mismo kind+id) sustituye a la anterior; `call_live` que pasa a `call` se
 * reemplaza por id de llamada.
 */
export function mergeEntries(prev: TimelineEntry[], next: TimelineEntry[]): TimelineEntry[] {
  const map = new Map<string, TimelineEntry>();
  for (const e of prev) map.set(entryKey(e), e);
  for (const e of next) {
    if (e.kind === 'call') map.delete(`call_live:${e.id}`);
    if (e.kind === 'call_live') map.delete(`call:${e.id}`);
    map.set(entryKey(e), e);
  }
  return [...map.values()].sort(cmpDesc);
}

export interface DayGroup {
  day: string; // yyyy-mm-dd en la zona indicada
  label: string;
  entries: TimelineEntry[];
}

const DAY_MS = 86_400_000;

/** Agrupa por día en la zona horaria (por defecto America/Bogota) con etiquetas Hoy/Ayer. */
export function groupByDay(entries: TimelineEntry[], tz = 'America/Bogota', now: Date = new Date()): DayGroup[] {
  const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const labelFmt = new Intl.DateTimeFormat('es-CO', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });
  const todayKey = keyFmt.format(now);
  const yesterdayKey = keyFmt.format(new Date(now.getTime() - DAY_MS));
  const groups = new Map<string, DayGroup>();
  for (const e of entries) {
    const d = new Date(e.occurred_at);
    const key = keyFmt.format(d);
    let g = groups.get(key);
    if (!g) {
      const base = labelFmt.format(d);
      const label = key === todayKey ? `Hoy · ${base}` : key === yesterdayKey ? `Ayer · ${base}` : base;
      g = { day: key, label: label.charAt(0).toUpperCase() + label.slice(1), entries: [] };
      groups.set(key, g);
    }
    g.entries.push(e);
  }
  return [...groups.values()];
}

export const KIND_LABELS: Record<TimelineKind, string> = {
  call: 'Llamada',
  call_live: 'Llamada en curso',
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  ai_call: 'Llamada IA',
  task: 'Tarea',
  note: 'Nota',
  meeting: 'Reunión',
  system: 'Sistema',
  activity: 'Actividad',
};

/** Chips de filtro (agrupan kinds relacionados). */
export const KIND_FILTERS: Array<{ id: string; label: string; kinds: TimelineKind[] }> = [
  { id: 'all', label: 'Todos', kinds: [] },
  { id: 'calls', label: 'Llamadas', kinds: ['call', 'call_live'] },
  { id: 'emails', label: 'Emails', kinds: ['email'] },
  { id: 'whatsapp', label: 'WhatsApp', kinds: ['whatsapp'] },
  { id: 'ai', label: 'IA', kinds: ['ai_call'] },
  { id: 'meetings', label: 'Reuniones', kinds: ['meeting'] },
  { id: 'tasks', label: 'Tareas', kinds: ['task'] },
  { id: 'notes', label: 'Notas', kinds: ['note'] },
  { id: 'system', label: 'Sistema', kinds: ['system', 'activity', 'sms'] },
];

export function formatDuration(seconds?: number | null): string {
  if (seconds == null || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatTime(iso: string, tz = 'America/Bogota'): string {
  try {
    return new Intl.DateTimeFormat('es-CO', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function formatDateTime(iso: string, tz = 'America/Bogota'): string {
  try {
    return new Intl.DateTimeFormat('es-CO', { timeZone: tz, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** "hace 2 h", "hace 3 d" sin dependencias. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const unit = (n: number, u: string) => (future ? `en ${n} ${u}` : `hace ${n} ${u}`);
  if (abs < 60_000) return future ? 'en un momento' : 'ahora';
  if (abs < 3_600_000) return unit(Math.round(abs / 60_000), 'min');
  if (abs < DAY_MS) return unit(Math.round(abs / 3_600_000), 'h');
  if (abs < 30 * DAY_MS) return unit(Math.round(abs / DAY_MS), 'd');
  return unit(Math.round(abs / (30 * DAY_MS)), 'mes');
}
