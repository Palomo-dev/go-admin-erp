/**
 * Detalle de una campaña de voz en marcha (Figma CRM 1809:144962).
 *
 * Dos lecturas en la base, con la sesión del usuario (RLS y permisos en SQL):
 *  1. `crm_voice_campaign_detail` (aplicada): campaña, cifras acumuladas,
 *     llamadas activas e historial paginado de 25, con el alcance por
 *     permiso (`crm.opportunities.view`, `crm.calls.view_all`) y sucursal.
 *  2. `crm_voice_campaign_hoy` (migración PENDIENTE 20261006230000): cupos de
 *     hoy con las mismas fronteras que la compuerta de reclamo, devoluciones,
 *     reprogramadas por la Ley 2300, bajas y el resultado de cada fila.
 *     Mientras no esté aplicada, `hoy` llega `null` y la pantalla lo dice: no
 *     se inventan cifras en Node.
 * SOLO servidor.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { exigirUuid } from './crmRouteSupport';
import { FAILURE_STREAK_TO_STOP } from './voiceAgentService';

export interface CampanaVozResumen {
  id: string;
  name: string;
  status: string;
  agent_name: string | null;
  objective: string | null;
  emergency_stop: boolean;
  stopped_reason: string | null;
  stopped_at: string | null;
  consecutive_failures: number;
  max_calls_per_day: number;
  max_calls_per_hour: number;
  max_concurrent: number;
  updated_at: string;
  target_source: string;
}

export interface LlamadaCampanaVoz {
  id: string;
  status: string;
  started_at: string | null;
  duration_seconds?: number | null;
  customer_name: string | null;
}

export interface CifrasCampanaVoz {
  targets: number;
  attempts: number;
  today: number;
  effective: number;
  meetings: number;
  conversation_minutes: number;
  remaining_minutes: number | null;
  active_total: number;
  pending: number;
  rescheduled: number;
}

export interface FilaHoy {
  estado: string;
  resultado: string | null;
  devolucion_at: string | null;
  reintento_at: string | null;
  ley2300: boolean;
  reunion_at: string | null;
  no_volver_a_llamar: boolean;
}

export interface HoyCampanaVoz {
  cupos: {
    dia: number;
    tope_dia: number;
    hora: number;
    tope_hora: number;
    simultaneas: number;
    tope_simultaneas: number;
    fallos_seguidos: number;
    /** Fallos seguidos con los que el despachador para la campaña (`FAILURE_STREAK_TO_STOP`). */
    tope_fallos: number;
  };
  devoluciones: { pendientes: number; proxima: string | null };
  ley2300: { reprogramadas: number; proxima: string | null };
  reintentos_en_cola: number;
  no_volver_a_llamar: number;
  audiencia: { encolados: number; contactados: number };
  filas: Record<string, FilaHoy>;
}

export interface DetalleCampanaVoz {
  campaign: CampanaVozResumen;
  stats: CifrasCampanaVoz;
  active: LlamadaCampanaVoz[];
  history: LlamadaCampanaVoz[];
  page: number;
  timezone: string;
  /** `null` mientras la migración 20261006230000 no esté aplicada. */
  hoy: HoyCampanaVoz | null;
}

/** Como mucho 100 llamadas por lectura del panel «Hoy» (límite de la RPC). */
export const MAX_FILAS_HOY = 100;

const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** ¿La RPC todavía no existe? (PostgREST la busca en su caché de esquema). */
export function rpcInexistente(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message ?? ''));
}

/** Llamadas cuyo resultado se pide: primero las activas, luego el historial, sin repetir. */
export function idsParaHoy(active: readonly { id: string }[], history: readonly { id: string }[]): string[] {
  return [...new Set([...active.map((c) => c.id), ...history.map((c) => c.id)])].slice(0, MAX_FILAS_HOY);
}

export function normalizarHoy(raw: Record<string, unknown> | null): HoyCampanaVoz | null {
  if (!raw) return null;
  const c = (raw.cupos ?? {}) as Record<string, unknown>;
  const d = (raw.devoluciones ?? {}) as Record<string, unknown>;
  const l = (raw.ley2300 ?? {}) as Record<string, unknown>;
  const a = (raw.audiencia ?? {}) as Record<string, unknown>;
  const filas: Record<string, FilaHoy> = {};
  for (const [id, f] of Object.entries((raw.filas ?? {}) as Record<string, Record<string, unknown>>)) {
    filas[id] = {
      estado: String(f.estado ?? ''),
      resultado: (f.resultado as string | null) ?? null,
      devolucion_at: (f.devolucion_at as string | null) ?? null,
      reintento_at: (f.reintento_at as string | null) ?? null,
      ley2300: f.ley2300 === true,
      reunion_at: (f.reunion_at as string | null) ?? null,
      no_volver_a_llamar: f.no_volver_a_llamar === true,
    };
  }
  return {
    cupos: {
      dia: n(c.dia),
      tope_dia: n(c.tope_dia),
      hora: n(c.hora),
      tope_hora: n(c.tope_hora),
      simultaneas: n(c.simultaneas),
      tope_simultaneas: n(c.tope_simultaneas),
      fallos_seguidos: n(c.fallos_seguidos),
      tope_fallos: FAILURE_STREAK_TO_STOP,
    },
    devoluciones: { pendientes: n(d.pendientes), proxima: (d.proxima as string | null) ?? null },
    ley2300: { reprogramadas: n(l.reprogramadas), proxima: (l.proxima as string | null) ?? null },
    reintentos_en_cola: n(raw.reintentos_en_cola),
    no_volver_a_llamar: n(raw.no_volver_a_llamar),
    audiencia: { encolados: n(a.encolados), contactados: n(a.contactados) },
    filas,
  };
}

export async function leerDetalleCampanaVoz(
  orgId: number,
  supabase: SupabaseClient,
  campaignId: string,
  page = 1,
): Promise<DetalleCampanaVoz> {
  exigirUuid(campaignId);
  const { data, error } = await supabase.rpc('crm_voice_campaign_detail', { p_org: orgId, p_campaign: campaignId, p_page: page });
  if (error) throw error;
  const d = (data ?? {}) as Record<string, unknown>;
  const s = (d.stats ?? {}) as Record<string, unknown>;
  const active = (d.active ?? []) as LlamadaCampanaVoz[];
  const history = (d.history ?? []) as LlamadaCampanaVoz[];

  const hoyRes = await supabase.rpc('crm_voice_campaign_hoy', { p_org: orgId, p_campaign: campaignId, p_calls: idsParaHoy(active, history) });
  if (hoyRes.error && !rpcInexistente(hoyRes.error)) throw hoyRes.error;

  return {
    campaign: d.campaign as CampanaVozResumen,
    stats: {
      targets: n(s.targets),
      attempts: n(s.attempts),
      today: n(s.today),
      effective: n(s.effective),
      meetings: n(s.meetings),
      conversation_minutes: n(s.conversation_minutes),
      remaining_minutes: s.remaining_minutes === null || s.remaining_minutes === undefined ? null : n(s.remaining_minutes),
      active_total: n(s.active_total),
      pending: n(s.pending),
      rescheduled: n(s.rescheduled),
    },
    active,
    history,
    page: n(d.page) || page,
    timezone: String(d.timezone ?? ''),
    hoy: hoyRes.error ? null : normalizarHoy(hoyRes.data as Record<string, unknown> | null),
  };
}
