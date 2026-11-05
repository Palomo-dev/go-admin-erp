/**
 * Por qué una campaña del agente de voz no está llamando (F6 · r-voz 2026-09-23).
 *
 * Todas las barreras del despachador son *fail-closed*: si algo falta, no marca.
 * El problema era que no lo decía: la campaña quedaba `running` y muda. Este
 * módulo reproduce el MISMO veredicto que `runCampaignQueue` reutilizando sus
 * funciones (`getOrgVoiceSettings`, `pickAgentCallerId`, `getAgentCaps`,
 * `isWithinSchedule`, `isWithinCustomerHours`, `canCallCustomer`,
 * `buildCampaignTargets`, `countAttempts`): no reimplementa ninguna regla
 * (regla dura 7). Si el despachador cambia de criterio, este diagnóstico cambia
 * con él.
 *
 * SOLO servidor: recibe el cliente de Supabase ya acotado a la organización que
 * salió de la sesión.
 *
 * Lo que NO se puede comprobar aquí y por eso se declara como tal:
 *  - que las credenciales de Twilio sean VÁLIDAS (sólo lo dice Twilio al marcar);
 *  - que el número de salida esté verificado/activo en la cuenta de Twilio;
 *  - que el ws-server del agente esté en pie.
 * Para esos tres, `codigo: 'twilio_no_verificable'` con `bloquea: false`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getActiveProvider } from '@/lib/services/providerRegistry';
import {
  buildCampaignTargets,
  canCallCustomer,
  countAttempts,
  getAgentCaps,
  getOrgVoiceSettings,
  isWithinCustomerHours,
  isWithinSchedule,
  pickAgentCallerId,
  startOfDayIso,
  DEFAULT_TIMEZONE,
  type VoiceAgentCampaign,
} from './voiceAgentService';
import { getMasterPhoneNumber } from '@/lib/services/integrations/twilio/twilioConfig';

/** Código estable del motivo; la UI traduce por él, nunca por el texto. */
export type MotivoCodigo =
  | 'sin_comm_settings'
  | 'canal_inactivo'
  | 'agente_voz_apagado'
  | 'sin_numero_propio'
  | 'sin_minutos'
  | 'sin_campanas_activas'
  | 'campana_pausada'
  | 'parada_emergencia'
  | 'agente_inactivo'
  | 'agente_no_encontrado'
  | 'fuera_de_franja_campana'
  | 'fuera_de_franja_cliente'
  | 'tope_diario'
  | 'tope_hora'
  | 'sin_objetivos'
  | 'objetivos_sin_telefono'
  | 'objetivos_sin_consentimiento'
  | 'twilio_no_verificable'
  | 'sin_politica_datos'
  /** Filas que el despachador reprogramó por la Ley 2300 (fuera de horario o tope semanal) y esperan su ventana. */
  | 'ley2300_reprogramadas';

export interface Motivo {
  codigo: MotivoCodigo;
  /** true = hoy mismo impide marcar. false = aviso o dato no verificable. */
  bloquea: boolean;
  /** Números que la UI interpola (tope, cuántos objetivos, etc.). */
  datos?: Record<string, number | string>;
}

/**
 * Motivo de la compuerta REAL de reclamo (`crm_voice_call_claim_motivo`, la
 * misma función que decide `fn_claim_voice_agent_calls`) con cuántas filas
 * pendientes de la campaña frena y la próxima hora programada.
 */
export interface BloqueoCompuerta {
  motivo: string;
  cantidad: number;
  proximo: string | null;
}

export interface DiagnosticoCampana {
  id: string;
  nombre: string;
  estado: string;
  /** Vacío = esta campaña puede marcar ahora mismo. */
  motivos: Motivo[];
  /**
   * Pendientes agrupadas por el motivo de la compuerta (solo campañas en
   * marcha). `null` = la RPC `crm_voice_campana_bloqueos` aún no existe
   * (migración pendiente 20261006210000): el panel usa solo `motivos`.
   */
  compuerta?: BloqueoCompuerta[] | null;
}

export interface DiagnosticoVoz {
  /** Motivos de la organización: bloquean TODAS las campañas. */
  organizacion: Motivo[];
  campanas: DiagnosticoCampana[];
  /** true si nada bloquea y hay al menos una campaña lista. */
  puedeLlamar: boolean;
}

/** Cuántos objetivos se inspeccionan por campaña (teléfono y consentimiento). */
const OBJETIVOS_A_INSPECCIONAR = 25;

interface ScheduleLike {
  timezone?: string;
  start_hour?: number;
  end_hour?: number;
  days?: number[];
}

export async function diagnosticarCampanasDeVoz(
  orgId: number,
  supabase: SupabaseClient
): Promise<DiagnosticoVoz> {
  const organizacion: Motivo[] = [];

  // ── Nivel organización ────────────────────────────────────────────────────
  const commRes = await supabase
    .from('comm_settings')
    .select('organization_id, is_active, voice_agent_enabled, voice_minutes_remaining')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (commRes.error) throw new Error(`comm_settings: ${commRes.error.message}`);
  const comm = commRes.data as {
    is_active: boolean | null;
    voice_agent_enabled: boolean | null;
    voice_minutes_remaining: number | null;
  } | null;

  // El veredicto lo da el MISMO `getOrgVoiceSettings` que aplica el
  // despachador; la fila cruda solo sirve para decir CUÁL de sus dos causas es.
  // Así el diagnóstico no puede divergir del comportamiento real.
  const settings = await getOrgVoiceSettings(orgId, supabase);

  if (!comm) {
    organizacion.push({ codigo: 'sin_comm_settings', bloquea: true });
  } else {
    if (comm.is_active === false) organizacion.push({ codigo: 'canal_inactivo', bloquea: true });
    if (comm.voice_agent_enabled !== true) organizacion.push({ codigo: 'agente_voz_apagado', bloquea: true });
    if (!settings.agentEnabled && comm.is_active !== false && comm.voice_agent_enabled === true) {
      // El despachador se negaría por una causa que esta función no sabe
      // desglosar: se declara igualmente en vez de enseñar «todo listo».
      organizacion.push({ codigo: 'agente_voz_apagado', bloquea: true });
    }
    // `deduct_comm_credits` (verificado por MCP el 2026-09-23) trata
    // `voice_minutes_remaining IS NULL` como ILIMITADO y devuelve true sin
    // debitar. Contar NULL como cero daría un bloqueo falso a los planes
    // Enterprise.
    if (comm.voice_minutes_remaining !== null && comm.voice_minutes_remaining !== undefined) {
      const minutos = Number(comm.voice_minutes_remaining);
      if (!(minutos > 0)) organizacion.push({ codigo: 'sin_minutos', bloquea: true, datos: { minutos } });
    }
  }

  // Caller id propio. `pickAgentCallerId` devuelve '' cuando el único candidato
  // es el número global de la plataforma (N-3): ahí el despachador se para.
  let provider: { credentials: Record<string, unknown> } = { credentials: {} };
  try {
    provider = (await getActiveProvider(orgId, 'voice', supabase)) as { credentials: Record<string, unknown> };
  } catch {
    provider = { credentials: {} };
  }
  const fallback = (provider.credentials.TWILIO_PHONE_NUMBER as string) || getMasterPhoneNumber() || null;
  let numeroPropio = '';
  try {
    numeroPropio = await pickAgentCallerId(orgId, supabase, fallback);
  } catch {
    numeroPropio = '';
  }
  if (!numeroPropio) organizacion.push({ codigo: 'sin_numero_propio', bloquea: true });

  // Compuerta legal: el MISMO `dataPolicyUrl` que exige `runCampaignQueue`.
  if (!settings.dataPolicyUrl) organizacion.push({ codigo: 'sin_politica_datos', bloquea: true });

  // Las credenciales pueden existir y ser inválidas: eso lo dice Twilio al
  // marcar, no una consulta. Se declara, no se finge.
  organizacion.push({
    codigo: 'twilio_no_verificable',
    bloquea: false,
    datos: {
      cuenta: provider.credentials.TWILIO_SUBACCOUNT_SID ? 'subcuenta_propia' : 'cuenta_maestra',
    },
  });

  // ── Nivel campaña ─────────────────────────────────────────────────────────
  const campRes = await supabase
    .from('voice_agent_campaigns')
    .select('*')
    .eq('organization_id', orgId)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (campRes.error) throw new Error(`voice_agent_campaigns: ${campRes.error.message}`);
  const campanasRaw = (campRes.data ?? []) as VoiceAgentCampaign[];

  if (!campanasRaw.some((c) => c.status === 'running' && !c.emergency_stop)) {
    organizacion.push({ codigo: 'sin_campanas_activas', bloquea: true });
  }

  const campanas: DiagnosticoCampana[] = [];
  for (const c of campanasRaw) {
    const motivos = await diagnosticarUna(orgId, supabase, c);
    const enMarcha = c.status === 'running' && !c.emergency_stop;
    const compuerta = enMarcha ? await bloqueosDeCompuerta(orgId, supabase, c.id) : null;
    // Sin la RPC, las reprogramadas por la Ley 2300 se cuentan desde las filas
    // que el propio despachador marcó (`last_error_code = 'LEY2300'`).
    if (enMarcha && compuerta === null) {
      const ley = await reprogramadasLey2300(orgId, supabase, c.id);
      if (ley) motivos.push(ley);
    }
    campanas.push({ id: c.id, nombre: c.name, estado: c.status, motivos, compuerta });
  }

  const puedeLlamar =
    !organizacion.some((m) => m.bloquea) && campanas.some((c) => c.motivos.every((m) => !m.bloquea));

  return { organizacion, campanas, puedeLlamar };
}

/** ¿La RPC todavía no existe? (PostgREST la busca en su caché de esquema). */
function rpcInexistente(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message ?? ''));
}

/**
 * Motivos de la compuerta real para las pendientes de una campaña
 * (`crm_voice_campana_bloqueos`, solo service_role). `null` si la migración
 * aún no se aplicó; cualquier otro error se propaga (fail-closed: el panel
 * muestra el error, no un «todo listo» falso).
 */
async function bloqueosDeCompuerta(orgId: number, supabase: SupabaseClient, campaignId: string): Promise<BloqueoCompuerta[] | null> {
  const { data, error } = await supabase.rpc('crm_voice_campana_bloqueos', { p_org: orgId, p_campaign: campaignId, p_limite: 200 });
  if (rpcInexistente(error)) return null;
  if (error) throw new Error(`crm_voice_campana_bloqueos: ${error.message}`);
  return ((data ?? []) as { motivo: string; cantidad: number; proximo: string | null }[]).map((r) => ({
    motivo: r.motivo,
    cantidad: Number(r.cantidad) || 0,
    proximo: r.proximo ?? null,
  }));
}

/** Pendientes reprogramadas por la Ley 2300 que aún esperan su ventana. */
async function reprogramadasLey2300(orgId: number, supabase: SupabaseClient, campaignId: string): Promise<Motivo | null> {
  const { data, count, error } = await supabase
    .from('voice_agent_calls')
    .select('scheduled_at', { count: 'exact' })
    .eq('organization_id', orgId)
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .eq('last_error_code', 'LEY2300')
    .gt('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(1);
  if (error) throw new Error(`voice_agent_calls: ${error.message}`);
  const n = count ?? 0;
  if (n === 0) return null;
  const proxima = (data?.[0] as { scheduled_at?: string } | undefined)?.scheduled_at ?? '';
  return { codigo: 'ley2300_reprogramadas', bloquea: false, datos: { n, proxima } };
}

async function diagnosticarUna(
  orgId: number,
  supabase: SupabaseClient,
  campaign: VoiceAgentCampaign
): Promise<Motivo[]> {
  const motivos: Motivo[] = [];

  if (campaign.emergency_stop) motivos.push({ codigo: 'parada_emergencia', bloquea: true });
  if (campaign.status !== 'running') {
    motivos.push({ codigo: 'campana_pausada', bloquea: true, datos: { estado: campaign.status } });
    // Una campaña en borrador o pausada no se inspecciona más: el resto de
    // barreras no se ha llegado a evaluar y enseñarlas sería ruido.
    return motivos;
  }

  const caps = await getAgentCaps(supabase, orgId, campaign.voice_agent_id);
  if (!caps) motivos.push({ codigo: 'agente_no_encontrado', bloquea: true });
  else if (!caps.is_active) motivos.push({ codigo: 'agente_inactivo', bloquea: true });

  const schedule = (campaign.schedule as ScheduleLike | null) ?? null;
  const tz = schedule?.timezone || DEFAULT_TIMEZONE;
  if (!isWithinSchedule(schedule, schedule?.timezone)) {
    motivos.push({
      codigo: 'fuera_de_franja_campana',
      bloquea: true,
      datos: {
        zona: tz,
        desde: schedule?.start_hour ?? 0,
        hasta: schedule?.end_hour ?? 24,
      },
    });
  }

  // Topes: los mismos contadores que aplica el despachador.
  const diaIso = startOfDayIso(tz);
  const horaIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [hoy, ultimaHora] = await Promise.all([
    countAttempts(supabase, campaign.id, diaIso),
    countAttempts(supabase, campaign.id, horaIso),
  ]);
  const topeDia = campaign.max_calls_per_day || 120;
  const topeHora = campaign.max_calls_per_hour || 40;
  if (hoy >= topeDia) motivos.push({ codigo: 'tope_diario', bloquea: true, datos: { hechos: hoy, tope: topeDia } });
  if (ultimaHora >= topeHora)
    motivos.push({ codigo: 'tope_hora', bloquea: true, datos: { hechos: ultimaHora, tope: topeHora } });

  // Objetivos: sin teléfono marcable o sin consentimiento no se llama a nadie.
  let objetivos: { customer_id: string }[] = [];
  try {
    objetivos = await buildCampaignTargets(supabase, orgId, campaign, OBJETIVOS_A_INSPECCIONAR);
  } catch {
    objetivos = [];
  }
  if (objetivos.length === 0) {
    motivos.push({ codigo: 'sin_objetivos', bloquea: true });
    return motivos;
  }

  const ids = objetivos.map((o) => o.customer_id);
  const clientesRes = await supabase
    .from('customers')
    .select('id, phone')
    .eq('organization_id', orgId)
    .in('id', ids);
  if (clientesRes.error) throw new Error(`customers: ${clientesRes.error.message}`);
  const conTelefono = ((clientesRes.data ?? []) as { id: string; phone: string | null }[]).filter(
    (c) => !!c.phone && c.phone.trim().length > 0
  );
  if (conTelefono.length === 0) {
    motivos.push({ codigo: 'objetivos_sin_telefono', bloquea: true, datos: { revisados: ids.length } });
    return motivos;
  }
  if (conTelefono.length < ids.length) {
    motivos.push({
      codigo: 'objetivos_sin_telefono',
      bloquea: false,
      datos: { sinTelefono: ids.length - conTelefono.length, revisados: ids.length },
    });
  }

  // Consentimiento: `fn_can_contact` es la única puerta y falla cerrado.
  let permitidos = 0;
  for (const c of conTelefono) {
    if (await canCallCustomer(orgId, c.id, supabase)) permitidos++;
  }
  if (permitidos === 0) {
    motivos.push({
      codigo: 'objetivos_sin_consentimiento',
      bloquea: true,
      datos: { revisados: conTelefono.length },
    });
  } else if (permitidos < conTelefono.length) {
    motivos.push({
      codigo: 'objetivos_sin_consentimiento',
      bloquea: false,
      datos: { bloqueados: conTelefono.length - permitidos, revisados: conTelefono.length },
    });
  }

  // Franja legal del cliente (Ley 2300: L-V 7–19, sáb 8–15, nunca domingos ni
  // festivos). Sin zona por cliente aquí se usa la de la campaña: es un aviso,
  // la comprobación exacta la hace el despachador con la zona del número.
  if (!isWithinCustomerHours(tz)) {
    motivos.push({ codigo: 'fuera_de_franja_cliente', bloquea: false, datos: { zona: tz } });
  }

  return motivos;
}
