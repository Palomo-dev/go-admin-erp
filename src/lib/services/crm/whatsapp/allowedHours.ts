/**
 * Horario permitido de contacto por org (D9 compliance Colombia).
 * `{ tz:'America/Bogota', days:[1..6], from:'08:00', to:'20:00' }` (days: 0=domingo).
 * Cálculo puro con Intl (sin dependencias).
 */

export interface AllowedHours {
  tz: string;
  days: number[];
  from: string;
  to: string;
}

function localParts(at: Date, tz: string): { day: number; minutes: number } {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
    const parts = fmt.formatToParts(at);
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    const dayIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
    return { day: dayIdx < 0 ? 1 : dayIdx, minutes: h * 60 + m };
  } catch {
    return { day: at.getUTCDay(), minutes: at.getUTCHours() * 60 + at.getUTCMinutes() };
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number(n));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function isWithinAllowedHours(cfg: AllowedHours | null | undefined, at: Date = new Date()): boolean {
  if (!cfg || !cfg.from || !cfg.to) return true;
  const { day, minutes } = localParts(at, cfg.tz || 'America/Bogota');
  const days = Array.isArray(cfg.days) && cfg.days.length ? cfg.days : [0, 1, 2, 3, 4, 5, 6];
  if (!days.includes(day)) return false;
  return minutes >= toMinutes(cfg.from) && minutes < toMinutes(cfg.to);
}

/** Próximo instante permitido (búsqueda por pasos de 15 min, máx 8 días). */
export function nextAllowedSlot(cfg: AllowedHours | null | undefined, from: Date = new Date()): Date {
  if (!cfg) return from;
  const step = 15 * 60 * 1000;
  let t = Math.ceil(from.getTime() / step) * step;
  const limit = from.getTime() + 8 * 24 * 3600 * 1000;
  while (t <= limit) {
    const d = new Date(t);
    if (isWithinAllowedHours(cfg, d)) return d;
    t += step;
  }
  return from;
}
