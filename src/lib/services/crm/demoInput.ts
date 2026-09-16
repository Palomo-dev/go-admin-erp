/**
 * F10 — validación pura del body de `/api/crm/demos` (crear y editar).
 * `scheduled_at` llega como instante ISO ya construido en la zona horaria de
 * la organización por la UI (`plainDateToInstant`); aquí solo se comprueba
 * que sea un instante válido y no anterior a hace 1 h (evitar agendar en el
 * pasado por error de zona).
 */

import { sanitizeChecklist, type ChecklistItem } from '@/lib/services/crm/demoChecklists';

export type DemoStatus = 'scheduled' | 'completed' | 'canceled' | 'no_show';
export const DEMO_STATUSES: readonly DemoStatus[] = ['scheduled', 'completed', 'canceled', 'no_show'];

export interface Attendee {
  name: string;
  email?: string;
  role?: string;
}

export interface CreateDemoBody {
  opportunity_id: string;
  scheduled_at: string;
  duration_minutes: number;
  attendees: Attendee[];
  checklist: ChecklistItem[];
  notes: string | null;
  video_provider: string | null;
  video_url: string | null;
}

export interface UpdateDemoBody {
  scheduled_at?: string;
  duration_minutes?: number;
  attendees?: Attendee[];
  checklist?: ChecklistItem[];
  notes?: string | null;
  status?: DemoStatus;
  video_url?: string | null;
  recording_url?: string | null;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTENDEES = 20;

function validInstant(value: unknown, nowMs: number): string | null {
  if (typeof value !== 'string') return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  if (t < nowMs - 60 * 60 * 1000) return null;
  return new Date(t).toISOString();
}

function validDuration(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 5 || n > 480) return null;
  return n;
}

function validAttendees(raw: unknown): Attendee[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ATTENDEES) return null;
  const out: Attendee[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') return null;
    const r = a as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 120) : '';
    if (!name) return null;
    const email = typeof r.email === 'string' && r.email.trim() ? r.email.trim().toLowerCase() : undefined;
    if (email && (!EMAIL_RE.test(email) || email.length > 254)) return null;
    const role = typeof r.role === 'string' && r.role.trim() ? r.role.trim().slice(0, 60) : undefined;
    out.push({ name, ...(email ? { email } : {}), ...(role ? { role } : {}) });
  }
  return out;
}

function validUrl(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (!v) return null;
  return /^https:\/\/\S{1,2000}$/.test(v) ? v : undefined;
}

export function validateCreateDemo(body: unknown, nowMs: number = Date.now()): Validation<CreateDemoBody> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Body inválido' };
  const b = body as Record<string, unknown>;
  if (typeof b.opportunity_id !== 'string' || !ID_RE.test(b.opportunity_id)) return { ok: false, error: 'Falta opportunity_id' };
  const scheduled_at = validInstant(b.scheduled_at, nowMs);
  if (!scheduled_at) return { ok: false, error: 'scheduled_at debe ser un instante ISO válido y no anterior a ahora' };
  const duration_minutes = validDuration(b.duration_minutes ?? 30);
  if (duration_minutes === null) return { ok: false, error: 'duration_minutes debe ser un entero entre 5 y 480' };
  const attendees = validAttendees(b.attendees ?? []);
  if (!attendees) return { ok: false, error: 'attendees: nombre obligatorio, email válido si se indica, máx. 20' };
  const checklist = b.checklist === undefined ? [] : sanitizeChecklist(b.checklist);
  if (!checklist) return { ok: false, error: 'checklist inválido' };
  const notes = typeof b.notes === 'string' ? b.notes.trim().slice(0, 4000) || null : null;
  const video_url = validUrl(b.video_url ?? null);
  if (video_url === undefined) return { ok: false, error: 'video_url debe ser https' };
  const video_provider = typeof b.video_provider === 'string' && b.video_provider.trim() ? b.video_provider.trim().slice(0, 40) : null;
  return { ok: true, value: { opportunity_id: b.opportunity_id, scheduled_at, duration_minutes, attendees, checklist, notes, video_provider, video_url } };
}

export function validateUpdateDemo(body: unknown, nowMs: number = Date.now()): Validation<UpdateDemoBody> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Body inválido' };
  const b = body as Record<string, unknown>;
  const out: UpdateDemoBody = {};
  if ('scheduled_at' in b) {
    const v = validInstant(b.scheduled_at, nowMs);
    if (!v) return { ok: false, error: 'scheduled_at inválido' };
    out.scheduled_at = v;
  }
  if ('duration_minutes' in b) {
    const v = validDuration(b.duration_minutes);
    if (v === null) return { ok: false, error: 'duration_minutes inválido' };
    out.duration_minutes = v;
  }
  if ('attendees' in b) {
    const v = validAttendees(b.attendees);
    if (!v) return { ok: false, error: 'attendees inválido' };
    out.attendees = v;
  }
  if ('checklist' in b) {
    const v = sanitizeChecklist(b.checklist);
    if (!v) return { ok: false, error: 'checklist inválido' };
    out.checklist = v;
  }
  if ('notes' in b) {
    if (b.notes !== null && typeof b.notes !== 'string') return { ok: false, error: 'notes inválido' };
    out.notes = typeof b.notes === 'string' ? b.notes.trim().slice(0, 4000) || null : null;
  }
  if ('status' in b) {
    if (!(DEMO_STATUSES as readonly unknown[]).includes(b.status)) return { ok: false, error: `status debe ser uno de: ${DEMO_STATUSES.join(', ')}` };
    out.status = b.status as DemoStatus;
  }
  for (const key of ['video_url', 'recording_url'] as const) {
    if (key in b) {
      const v = validUrl(b[key]);
      if (v === undefined) return { ok: false, error: `${key} debe ser https` };
      out[key] = v;
    }
  }
  if (Object.keys(out).length === 0) return { ok: false, error: 'Nada que actualizar' };
  return { ok: true, value: out };
}
