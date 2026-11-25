/**
 * Métricas de los agentes IA de voz (Figma CRM 1298:84133 listado y 1311:86823
 * detalle). El agregado vive en SQL: `crm_voice_agents_metricas` (SECURITY
 * INVOKER, migración 20261115170000), así que con el cliente de sesión RLS
 * limita todo a la organización del usuario.
 *
 * Aquí solo quedan los tipos, la llamada y la aritmética de presentación
 * (porcentajes, variación frente a la ventana anterior y agrupación de
 * estados), pura y probada.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { plainDateToInstant, todayInTz } from '@/lib/utils/dateCore';

export interface MetricaPorAgente {
  voice_agent_id: string;
  llamadas: number;
  contestadas: number;
  agendadas: number;
}

export interface TotalesMetricas {
  llamadas: number;
  contestadas: number;
  agendadas: number;
  llamadas_previas: number;
  duracion_media_segundos: number | null;
  creditos_ventana: number;
  creditos_mes: number;
  creditos_restantes: number | null;
}

export interface EtapaDeAgente {
  voice_agent_id: string;
  stage_id: string;
  etapa: string;
  posicion: number | null;
  action_policy: 'auto' | 'suggest' | string;
  is_active: boolean;
}

export interface LlamadaReciente {
  id: string;
  call_id: string | null;
  cliente: string | null;
  customer_id: string | null;
  etapa: string | null;
  campana: string | null;
  status: string;
  resultado: string | null;
  duracion_segundos: number | null;
  momento: string;
}

export interface MetricasAgentes {
  por_agente: MetricaPorAgente[];
  totales: TotalesMetricas;
  etapas: EtapaDeAgente[];
  estados: { status: string; n: number }[];
  herramientas: { tool: string; n: number; status: string }[];
  llamadas: LlamadaReciente[];
}

/** Periodos que acepta el detalle («7 días · 30 días · 90 días»). */
export const PERIODOS_METRICAS = [7, 30, 90] as const;
export type PeriodoMetricas = (typeof PERIODOS_METRICAS)[number];

/** `?periodo=30d` o `?dias=30` → uno de los periodos admitidos (7 por defecto). */
export function leerPeriodo(valor: string | null | undefined, porDefecto: PeriodoMetricas = 7): PeriodoMetricas {
  const n = Number(String(valor ?? '').replace(/d$/i, ''));
  return (PERIODOS_METRICAS as readonly number[]).includes(n) ? (n as PeriodoMetricas) : porDefecto;
}

/** Primer instante del mes en curso en la zona de la organización. */
export function inicioDeMesEnZona(timezone: string, ahora?: Date): string {
  const hoy = ahora ? new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora) : todayInTz(timezone);
  return plainDateToInstant(`${hoy.slice(0, 7)}-01`, timezone);
}

export async function getVoiceAgentMetrics(
  orgId: number,
  supabase: SupabaseClient,
  opciones: { dias: number; voiceAgentId?: string | null; mesDesde?: string | null }
): Promise<MetricasAgentes> {
  const { data, error } = await supabase.rpc('crm_voice_agents_metricas', {
    p_organization_id: orgId,
    p_dias: opciones.dias,
    p_voice_agent_id: opciones.voiceAgentId ?? null,
    p_mes_desde: opciones.mesDesde ?? null,
  });
  if (error) throw new Error(error.message);
  return normalizarMetricas(data);
}

const TOTALES_VACIOS: TotalesMetricas = {
  llamadas: 0,
  contestadas: 0,
  agendadas: 0,
  llamadas_previas: 0,
  duracion_media_segundos: null,
  creditos_ventana: 0,
  creditos_mes: 0,
  creditos_restantes: null,
};

/** Respuesta de la RPC (o `null`) → forma completa, sin `undefined`. */
export function normalizarMetricas(raw: unknown): MetricasAgentes {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<MetricasAgentes>;
  return {
    por_agente: Array.isArray(r.por_agente) ? r.por_agente : [],
    totales: { ...TOTALES_VACIOS, ...(r.totales ?? {}) },
    etapas: Array.isArray(r.etapas) ? r.etapas : [],
    estados: Array.isArray(r.estados) ? r.estados : [],
    herramientas: Array.isArray(r.herramientas) ? r.herramientas : [],
    llamadas: Array.isArray(r.llamadas) ? r.llamadas : [],
  };
}

/** Porcentaje entero (`null` sin base): «41 %». */
export function porcentaje(parte: number, total: number): number | null {
  if (!total) return null;
  return Math.round((parte / total) * 100);
}

/** Variación porcentual frente a la ventana anterior (`null` sin base). */
export function variacion(actual: number, previo: number): number | null {
  if (!previo) return null;
  return Math.round(((actual - previo) / previo) * 100);
}

/**
 * Desenlaces del detalle (Figma «Cómo terminaron las llamadas»): seis grupos
 * fijos en este orden. `in_progress` cuenta como completada solo cuando
 * termina, así que no se muestra.
 */
export const GRUPOS_DESENLACE = ['completed', 'no_answer', 'voicemail', 'skipped', 'transferred', 'failed'] as const;
export type GrupoDesenlace = (typeof GRUPOS_DESENLACE)[number];

export function agruparDesenlaces(estados: { status: string; n: number }[]): { grupo: GrupoDesenlace; n: number }[] {
  const mapa = new Map(estados.map((e) => [e.status, e.n]));
  return GRUPOS_DESENLACE.map((grupo) => ({ grupo, n: mapa.get(grupo) ?? 0 }));
}

/**
 * Herramientas que el runtime inyecta siempre (Figma: insignia «Obligatoria»).
 * Copia de `MANDATORY_TOOLS` (voiceAgentTools importa código de servidor y este
 * módulo lo usa el navegador); un test comprueba que no divergen.
 */
export const HERRAMIENTAS_OBLIGATORIAS: readonly string[] = ['log_consent_opt_out', 'end_call'];

/**
 * Política del agente en sus etapas (Figma: «Sugiere, no ejecuta» / «Ejecuta
 * solo»). Basta una etapa en `suggest` para que el agente no ejecute solo.
 */
export function politicaDeEtapas(etapas: Pick<EtapaDeAgente, 'action_policy' | 'is_active'>[]): 'auto' | 'suggest' {
  const activas = etapas.filter((e) => e.is_active);
  return activas.length > 0 && activas.every((e) => e.action_policy === 'auto') ? 'auto' : 'suggest';
}
