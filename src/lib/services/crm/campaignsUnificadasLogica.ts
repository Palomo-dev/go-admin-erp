/**
 * Listado unificado de campañas (mensajes + voz) sobre la RPC
 * `crm_campaigns_unificadas(p_org)` (aplicada; verificada por MCP el
 * 2026-10-06: SECURITY DEFINER, exige `crm.opportunities.view`, devuelve un
 * jsonb con una fila por campaña de `campaigns` y de `voice_agent_campaigns`,
 * sin archivadas). Lógica pura: proyección, filtro y página.
 *
 * El estado de las de mensajes es el mismo `effectiveCampaignStatus` del motor
 * de envíos; el de las de voz lo decide la pantalla con `estadoCampana` (el
 * mismo del detalle), por eso aquí viaja `emergencyStop` crudo.
 */
import { effectiveCampaignStatus, type CampaignConfig } from './whatsapp/types';
import { TERMINAL_VAC_STATUSES } from './voiceAgent/callStatusMap';

export interface CampanaUnificadaRaw {
  id: string;
  name: string;
  source: 'voice' | 'message';
  channel: 'voice' | 'whatsapp' | 'email' | string;
  status: string;
  created_at: string;
  updated_at?: string | null;
  scheduled_at: string | null;
  stats: CampaignConfig | null;
  segment_name: string | null;
  content_name: string | null;
  emergency_stop: boolean | null;
  stopped_reason: string | null;
  voice_counts: Record<string, number> | null;
}

export interface CampanaUnificada {
  id: string;
  name: string;
  source: 'voice' | 'message';
  channel: string;
  status: string;
  emergencyStop: boolean;
  stoppedReason: string | null;
  segmentName: string | null;
  contentName: string | null;
  scheduledAt: string | null;
  createdAt: string;
  progress: { done: number; total: number; pct: number };
  /** Voz: completadas/fallidas/en curso. Mensajes: entregados/leídos/respondidos. */
  result: Record<string, number>;
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Llamadas que ya no se van a volver a marcar: terminales + transferidas + omitidas. */
const VOZ_HECHAS: readonly string[] = [...TERMINAL_VAC_STATUSES, 'transferred', 'skipped'];

export function proyectarCampana(c: CampanaUnificadaRaw): CampanaUnificada {
  const vc = c.voice_counts ?? {};
  const counts = c.stats?.counts;
  const voz = c.source === 'voice';
  const total = voz ? Object.values(vc).reduce((s, x) => s + n(x), 0) : n(c.stats?.total_contacts ?? counts?.total ?? 0);
  const done = voz
    ? VOZ_HECHAS.reduce((s, k) => s + n(vc[k]), 0)
    : counts
      ? n(counts.sent) + n(counts.failed) + n(counts.skipped)
      : n(c.stats?.sent_count);
  return {
    id: c.id,
    name: c.name,
    source: c.source,
    channel: c.channel,
    status: voz ? c.status : effectiveCampaignStatus(c.status, c.stats),
    emergencyStop: c.emergency_stop === true,
    stoppedReason: c.stopped_reason,
    segmentName: c.segment_name || null,
    contentName: c.content_name,
    scheduledAt: c.scheduled_at,
    createdAt: c.created_at,
    progress: { done, total, pct: total ? Math.min(100, Math.round((done / total) * 100)) : 0 },
    result: voz
      ? { completed: n(vc.completed) + n(vc.transferred), failed: n(vc.failed), active: n(vc.in_progress) }
      : { delivered: n(counts?.delivered), read: n(counts?.read), replied: n(counts?.replied) },
  };
}

export const CANALES_CAMPANA = ['all', 'voice', 'messages'] as const;
export type CanalCampana = (typeof CANALES_CAMPANA)[number];
export const TAMANO_PAGINA_CAMPANAS = 25;

export interface FiltroCampanas {
  channel: CanalCampana;
  q: string;
  page: number;
}

export function filtrarCampanas(filas: readonly CampanaUnificada[], f: FiltroCampanas): { rows: CampanaUnificada[]; total: number; porCanal: Record<CanalCampana, number> } {
  const q = f.q.trim().toLocaleLowerCase('es');
  const buscadas = q ? filas.filter((c) => c.name.toLocaleLowerCase('es').includes(q) || (c.segmentName ?? '').toLocaleLowerCase('es').includes(q)) : [...filas];
  const porCanal = {
    all: buscadas.length,
    voice: buscadas.filter((c) => c.source === 'voice').length,
    messages: buscadas.filter((c) => c.source === 'message').length,
  };
  const delCanal = f.channel === 'all' ? buscadas : buscadas.filter((c) => (f.channel === 'voice' ? c.source === 'voice' : c.source === 'message'));
  const desde = (f.page - 1) * TAMANO_PAGINA_CAMPANAS;
  return { rows: delCanal.slice(desde, desde + TAMANO_PAGINA_CAMPANAS), total: delCanal.length, porCanal };
}
