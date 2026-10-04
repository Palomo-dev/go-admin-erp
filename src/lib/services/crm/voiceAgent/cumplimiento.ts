/**
 * Compuertas legales del agente de voz que necesitan la base (2026-09-30).
 *
 * La lógica vive en módulos puros (`ley2300.ts`, `rne.ts`); aquí solo se leen
 * los datos que esas reglas necesitan. Lo usan `voiceAgentService` (cola de
 * campañas y despacho puntual), el diagnóstico del panel y la ruta de la
 * verificación RNE. SOLO servidor: recibe el cliente ya acotado a una
 * organización validada.
 *
 * Todas las lecturas fallan CERRADO: si la base no responde, no se llama.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  decidirContactoLey2300,
  inicioSemanaLocal,
  inicioSemanaSiguienteLocal,
  zonaHorariaDestinatario,
  type CanalContacto,
  type ConteoSemana,
  type DecisionContacto,
} from './ley2300';
import { normalizarNumeroRne, verificacionRneVigente } from './rne';
import { esNumeroPrueba, EXENCION_NUMERO_PRUEBA } from './numerosPrueba';
import { DEFAULT_TIMEZONE, isUsableTimezone } from '@/lib/utils/dateCore';

export class CumplimientoDbError extends Error {
  constructor(contexto: string, mensaje: string) {
    super(`[${contexto}] ${mensaje}`);
    this.name = 'CumplimientoDbError';
  }
}

/** Contactos efectivos de la semana en curso (hora del destinatario), por canal. */
export async function leerConteosSemana(
  supabase: SupabaseClient,
  orgId: number,
  customerId: string,
  zona: string,
  ahora: Date = new Date()
): Promise<ConteoSemana> {
  const { data, error } = await supabase.rpc('fn_contactos_efectivos_semana', {
    p_org: orgId,
    p_customer: customerId,
    p_desde: inicioSemanaLocal(ahora, zona).toISOString(),
    p_hasta: inicioSemanaSiguienteLocal(ahora, zona).toISOString(),
  });
  if (error) throw new CumplimientoDbError('fn_contactos_efectivos_semana', error.message);
  const conteos: ConteoSemana = {};
  for (const fila of (data ?? []) as Array<{ canal: string; contactos: number }>) {
    conteos[fila.canal] = (conteos[fila.canal] ?? 0) + Number(fila.contactos || 0);
  }
  return conteos;
}

/**
 * Veredicto de la Ley 2300 para contactar a un cliente AHORA por `canal`:
 * horario del destinatario (+57 → Colombia), festivos y tope semanal.
 *
 * PUNTO ÚNICO de la exención por número de prueba (`numerosPrueba.ts`): si el
 * número es de prueba vigente de la organización, no se cuentan los contactos
 * de la semana y la decisión sale con `exencion: 'numero_prueba'`. El horario
 * legal se evalúa igual. Nada más (baja voluntaria, topes diarios, créditos)
 * pasa por aquí: sigue aplicando en su sitio. La campaña no exige el RNE.
 */
export async function evaluarLey2300Cliente(
  supabase: SupabaseClient,
  orgId: number,
  cliente: { id: string; phone: string | null; timezone: string | null },
  canal: CanalContacto = 'voice',
  ahora: Date = new Date()
): Promise<DecisionContacto> {
  const telefono = normalizarNumeroRne(cliente.phone) ?? cliente.phone;
  const zona = zonaHorariaDestinatario(telefono, cliente.timezone);
  const esPrueba = await esNumeroPrueba(supabase, orgId, telefono);
  const conteosSemana = esPrueba ? {} : await leerConteosSemana(supabase, orgId, cliente.id, zona, ahora);
  return decidirContactoLey2300({
    ahora,
    telefonoE164: telefono,
    zonaCliente: cliente.timezone,
    canal,
    conteosSemana,
    exencion: esPrueba ? EXENCION_NUMERO_PRUEBA : null,
  });
}

/** ¿El número está en la lista de excluidos de la organización (RNE o manual)? */
export async function numeroExcluido(supabase: SupabaseClient, orgId: number, telefonoE164: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('crm_excluded_numbers')
    .select('id')
    .eq('organization_id', orgId)
    .eq('phone_e164', telefonoE164)
    .limit(1);
  if (error) throw new CumplimientoDbError('crm_excluded_numbers', error.message);
  return Array.isArray(data) && data.length > 0;
}

export interface VerificacionRne {
  id: string;
  checked_at: string;
  valid_until: string;
  file_name: string | null;
  numbers_in_file: number;
  checked_targets: number;
  excluded_targets: number;
  skipped_calls: number;
}

/** Última verificación RNE de la campaña (vigente o no). */
export async function ultimaVerificacionRne(
  supabase: SupabaseClient,
  orgId: number,
  campaignId: string
): Promise<VerificacionRne | null> {
  const { data, error } = await supabase
    .from('voice_campaign_rne_checks')
    .select('id, checked_at, valid_until, file_name, numbers_in_file, checked_targets, excluded_targets, skipped_calls')
    .eq('organization_id', orgId)
    .eq('campaign_id', campaignId)
    .order('checked_at', { ascending: false })
    .limit(1);
  if (error) throw new CumplimientoDbError('voice_campaign_rne_checks', error.message);
  const fila = Array.isArray(data) ? (data[0] as VerificacionRne | undefined) : undefined;
  return fila ?? null;
}

/** ¿La campaña tiene una verificación RNE vigente? Falla cerrado. */
export async function campanaConRneVigente(
  supabase: SupabaseClient,
  orgId: number,
  campaignId: string,
  ahora: Date = new Date()
): Promise<boolean> {
  const v = await ultimaVerificacionRne(supabase, orgId, campaignId);
  return verificacionRneVigente(v?.valid_until ?? null, ahora);
}

/** Solo https y sin espacios (el mismo criterio que el CHECK de la columna). */
export function politicaDatosValida(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^https:\/\/\S+$/.test(url) && url.length <= 500;
}

/**
 * Zona horaria de la organización (`organizations.timezone`, NOT NULL) leída
 * con el cliente que ya trae el llamador. No se usa `getOrganizationTimezone`
 * porque arrastra el cliente de NAVEGADOR (`@/lib/supabase/config`) y, por
 * `timezoneFallback`, Sentry de React: este módulo lo carga el servidor de voz
 * (ws-server), que no tiene esas dependencias (F-78). Una zona inválida o un
 * fallo de lectura caen a `DEFAULT_TIMEZONE` con aviso, igual que el servicio
 * canónico: agendar no debe morir por no poder leer la zona.
 */
export async function zonaHorariaOrganizacion(supabase: SupabaseClient, orgId: number): Promise<string> {
  const { data, error } = await supabase.from('organizations').select('timezone').eq('id', orgId).maybeSingle();
  const tz = (data as { timezone?: unknown } | null)?.timezone;
  if (!error && isUsableTimezone(tz)) return tz;
  console.warn('[voz] zona horaria de la organización no disponible; se usa la de respaldo', {
    org: orgId,
    error: error?.message ?? null,
  });
  return DEFAULT_TIMEZONE;
}
