/**
 * Consent Service — Registro y consulta de consentimientos de grabación.
 * GO Admin ERP — Fase 3 (Telefonía CRM)
 *
 * Tabla: call_consents
 * Tabla relacionada: calls (campo consent_given)
 *
 * Todas las funciones reciben `supabase` y `organizationId` para garantizar
 * aislamiento por organización (multi-tenant).
 *
 * ÚNICO ESCRITOR DE `call_consents` (ronda 5, regla 7 de CLAUDE.md). Hasta la
 * ronda 4 este servicio existía y no lo llamaba nadie, mientras cuatro rutas
 * escribían el acta a mano y divergían (una al marcar, otra al contestar, otra
 * fallando abierto, otra fallando cerrado). La prueba G.1 de
 * `f3f5Round5Consent` recorre `src/` entero y falla si aparece otro
 * `from('call_consents').insert|upsert(`.
 *
 * Invariante que sostiene: «nunca grabar sin acta». Quien quiera grabar llama
 * a `recordConsent` ANTES de emitir el TwiML que graba; si lanza, no se graba.
 * El acta certifica que el AVISO sonó (`announced_at` = momento en que se
 * sirvió), no que exista una grabación: cuando Twilio reporta la grabación
 * `absent`, `voidConsentWithoutRecording` retira acta y flags para que la fila
 * no prometa lo que no hay.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { updateCall } from './callManagementService';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ConsentType = 'recording' | 'data_processing' | 'marketing' | 'custom';
/**
 * `manual`: declaración del usuario sobre una grabación hecha fuera del sistema
 * (subida a mano, F4). `unverified_announcement`: Twilio entregó una grabación
 * `completed` de una llamada SIN acta (el whisper no llegó a servirse): la
 * grabación se registra para no ocultarla, pero `calls.consent_given` queda
 * en `false` porque el aviso no se pudo acreditar. La columna no tiene CHECK
 * (verificado por MCP, ronda 6).
 */
export type ConsentMethod = 'voice_announcement' | 'sms' | 'email' | 'manual' | 'ivrs' | 'unverified_announcement';

/** Método de la acta que la UI marca como «Aviso no acreditado» (F-4, ronda 7). */
export const UNVERIFIED_CONSENT_METHOD: ConsentMethod = 'unverified_announcement';

/**
 * Nota que acompaña a `announced_at` de una acta `unverified_announcement` en
 * `calls.metadata` (F-4): la columna es NOT NULL y solo puede llevar la hora
 * del callback, que NO es la de un aviso.
 */
export const UNVERIFIED_ANNOUNCED_AT_NOTE =
  'announced_at del acta unverified_announcement es la hora del callback completed de la grabación, no la de un aviso: no consta que el aviso sonara';

/** Texto de la acta no acreditada (F-4): dice lo que consta, no lo que se configuró. */
export function unverifiedAnnouncementText(callbackAt: string, configuredMessage: string | null | undefined): string {
  const configured = (configuredMessage ?? '').trim();
  return (
    `AVISO NO ACREDITADO. Twilio entregó la grabación completada (callback del ${callbackAt}) de una llamada sin acta previa: ` +
    'no consta que el aviso de grabación se reprodujera al interlocutor. ' +
    (configured
      ? `Aviso configurado en la organización en ese momento (NO acreditado como reproducido): "${configured}".`
      : 'La organización no tenía aviso configurado.')
  );
}

/**
 * Texto legal que marca quien sube una grabación hecha fuera del sistema
 * (F-5, Ley 1581 de 2012 · Habeas Data). Es el mismo en la casilla de la UI,
 * en la ruta (que exige `recording_declaration=true`) y en la acta.
 */
export const MANUAL_RECORDING_DECLARATION_TEXT =
  'Declaro que esta grabación se hizo con el conocimiento del interlocutor y que cuento con su autorización para tratarla conforme a la Ley 1581 de 2012 (Habeas Data).';

/**
 * Evidencia de la acta `manual` (F-5): quién la aporta, cuándo, de dónde, que
 * el sistema NO reprodujo aviso alguno y, SOLO si el usuario la marcó, la
 * declaración. Sin declaración marcada no se le atribuye ninguna.
 */
export function manualConsentText(p: { userId: string | null; uploadedAt: string; callStartedAt: string; source: string; declared: boolean }): string {
  const base = `Grabación aportada fuera del sistema por el usuario ${p.userId ?? 'desconocido'} el ${p.uploadedAt} (llamada del ${p.callStartedAt}, origen ${p.source}). El sistema no reprodujo aviso alguno.`;
  return p.declared
    ? `${base} Declaración marcada por el usuario al subirla: "${MANUAL_RECORDING_DECLARATION_TEXT}"`
    : `${base} No consta declaración del usuario sobre el conocimiento del interlocutor (la subida no la incluyó).`;
}

export interface CallConsent {
  id: string;
  organization_id: number;
  call_id: string;
  consent_type: string;
  announced_at: string;
  method: string;
  locale: string;
  recorded_announcement_text: string | null;
}

export interface RecordConsentParams {
  /** UUID de la llamada en la tabla calls */
  callId: string;
  /** ID del cliente (opcional — se valida contra calls.customer_id si se proporciona) */
  customerId?: string;
  /** Número de teléfono del cliente (informativo — se valida contra calls.to_number) */
  phoneNumber?: string;
  /** Tipo de consentimiento: recording, data_processing, marketing, custom */
  consentType: string;
  /** Si el consentimiento fue otorgado (true) o rechazado (false) */
  consentGiven: boolean;
  /** Texto del aviso que se reprodujo al cliente (ej. "Esta llamada será grabada...") */
  consentMessage?: string;
  /** Método por el cual se obtuvo el consentimiento (default: voice_announcement) */
  method?: string;
  /** Locale del aviso (default: es-CO) */
  locale?: string;
  /**
   * Momento en que el aviso se reprodujo (ISO). Por defecto, AHORA: quien llama
   * lo hace en el instante en que sirve el aviso. Nunca se deja al DEFAULT
   * now() de la columna, que fechaba el acta al marcar (V-4, ronda 4).
   */
  announcedAt?: string;
}

export interface ConsentHistoryFilters {
  consentType?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

// ─── Funciones ───────────────────────────────────────────────────────────────

/**
 * ÚNICA fuente de verdad para decidir `record=` en un TwiML de una llamada ya
 * registrada: la fila `calls.recording_enabled`, la MISMA que lee
 * `consent-whisper` para decidir si anuncia y escribe el acta.
 *
 * Ronda 6 (N-1): `customer-leg`/`agent-leg` decidían `record=` releyendo
 * `comm_settings` al conectar, mientras el whisper miraba la fila que
 * `initiateBridge` fijó al marcar. Si la organización encendía la grabación
 * entre marcar y conectar (10–60 s), el `<Dial>` salía con `record=` y el
 * whisper respondía `<Response/>` vacío: grabación sin aviso y sin acta.
 *
 * Falla CERRADO: sin `callId`, sin fila de esa organización o con error de
 * lectura devuelve `false` (se conecta sin grabar).
 */
export async function recordingEnabledForCall(callId: string | null | undefined, organizationId: number, supabase: SupabaseClient): Promise<boolean> {
  if (!callId) return false;
  const { data, error } = await supabase
    .from('calls')
    .select('recording_enabled')
    .eq('id', callId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) {
    console.error('[consentService.recordingEnabledForCall] no se pudo leer la fila, no se graba:', error.message);
    return false;
  }
  return (data as { recording_enabled?: boolean | null } | null)?.recording_enabled === true;
}

/** Columnas del índice único real `call_consents_org_call_type_uidx` (verificado por MCP). */
export const CONSENT_CONFLICT_TARGET = 'organization_id,call_id,consent_type';

/**
 * Registra un consentimiento de grabación en la tabla call_consents.
 *
 * Idempotente: `upsert` sobre el índice único (organization_id, call_id,
 * consent_type) con `ignoreDuplicates`, así que un reintento de Twilio (el
 * mismo webhook dos veces) devuelve el acta original SIN mover `announced_at`.
 * La fecha del acta es la del primer aviso, que es el que el cliente oyó.
 *
 * Si `consentGiven` es true, también pone `calls.consent_given = true`
 * filtrando por organización. Si esa escritura falla o no alcanza ninguna
 * fila (llamada de otra organización), LANZA: el acta sin su marca en `calls`
 * no vale como "hay acta", y quien graba debe poder fallar cerrado.
 *
 * @param organizationId ID de la organización
 * @param params Parámetros del consentimiento
 * @param supabase Cliente Supabase
 * @returns El acta (nueva o preexistente)
 * @throws si el acta o la marca en `calls` no se pueden escribir
 */
export async function recordConsent(
  organizationId: number,
  params: RecordConsentParams,
  supabase: SupabaseClient
): Promise<CallConsent> {
  const {
    callId,
    consentType,
    consentGiven,
    consentMessage,
    method = 'voice_announcement',
    locale = 'es-CO',
    announcedAt = new Date().toISOString(),
  } = params;

  if (!callId) {
    throw new Error('recordConsent: callId es requerido');
  }
  if (!consentType) {
    throw new Error('recordConsent: consentType es requerido');
  }

  // 1. Acta, una sola por (org, llamada, tipo). En conflicto no se toca la
  //    existente (DO NOTHING) y `data` vuelve vacío: se relee abajo.
  const { data: upserted, error } = await supabase
    .from('call_consents')
    .upsert(
      {
        organization_id: organizationId,
        call_id: callId,
        consent_type: consentType,
        announced_at: announcedAt,
        method,
        locale,
        recorded_announcement_text: consentMessage ?? null,
      },
      { onConflict: CONSENT_CONFLICT_TARGET, ignoreDuplicates: true }
    )
    .select()
    .maybeSingle();

  if (error) {
    console.error('[consentService.recordConsent] error escribiendo el acta:', error.message);
    throw error;
  }

  let consent = upserted as CallConsent | null;
  if (!consent) {
    const { data: existing, error: readError } = await supabase
      .from('call_consents')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('call_id', callId)
      .eq('consent_type', consentType)
      .maybeSingle();
    if (readError || !existing) {
      const message = readError?.message ?? 'el acta no existe tras el upsert';
      console.error('[consentService.recordConsent] no se pudo releer el acta:', message);
      throw new Error(`recordConsent: ${message}`);
    }
    consent = existing as CallConsent;
  }

  // 2. Marca en `calls`, filtrada por organización. Sin fila alcanzada → error.
  if (consentGiven) {
    const updated = await updateCall(callId, organizationId, { consent_given: true }, supabase);
    if (!updated) {
      throw new Error('recordConsent: la llamada no pertenece a la organización o no existe');
    }
  }

  return consent;
}

/**
 * Twilio reportó la grabación como `absent` (error de sistema, silencio
 * recortado a cero, borrado automático) y la llamada no tiene NINGUNA
 * grabación registrada: se retira el acta de grabación y se deja la fila
 * `calls` honesta (`recording_enabled=false`, `consent_given=false`,
 * `metadata.recording_absent_at`). Un acta sin grabación es un acta que
 * miente sobre lo que la organización conserva.
 *
 * Scoped por organización: un `callId` de otra org no toca nada.
 */
export async function voidConsentWithoutRecording(
  callId: string,
  organizationId: number,
  supabase: SupabaseClient,
  reason: string
): Promise<void> {
  const { data: call, error: readError } = await supabase
    .from('calls')
    .select('id, metadata')
    .eq('id', callId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (readError) throw readError;
  if (!call) return;

  const { error: deleteError } = await supabase
    .from('call_consents')
    .delete()
    .eq('organization_id', organizationId)
    .eq('call_id', callId)
    .eq('consent_type', 'recording');
  if (deleteError) throw deleteError;

  const metadata = { ...(((call as { metadata?: Record<string, unknown> | null }).metadata) ?? {}), recording_absent_at: new Date().toISOString(), recording_absent_reason: reason };
  await updateCall(callId, organizationId, { consent_given: false, recording_enabled: false, metadata }, supabase);
}

/**
 * Lista los consentimientos registrados para una llamada específica.
 *
 * @param callId UUID de la llamada
 * @param organizationId ID de la organización
 * @param supabase Cliente Supabase
 * @returns Lista de consentimientos ordenados por announced_at descendente
 */
export async function getConsents(
  callId: string,
  organizationId: number,
  supabase: SupabaseClient
): Promise<CallConsent[]> {
  const { data, error } = await supabase
    .from('call_consents')
    .select('*')
    .eq('call_id', callId)
    .eq('organization_id', organizationId)
    .order('announced_at', { ascending: false });

  if (error) {
    console.error('[consentService.getConsents] error:', error.message);
    return [];
  }

  return (data || []) as CallConsent[];
}

/**
 * Obtiene el historial de consentimientos de un cliente, consultando
 * todas las llamadas asociadas a ese cliente y sus consentimientos.
 *
 * @param customerId UUID del cliente en la tabla customers
 * @param organizationId ID de la organización
 * @param supabase Cliente Supabase
 * @param filters Filtros opcionales (consentType, rango de fechas, paginación)
 * @returns Lista de consentimientos del cliente
 */
export async function getConsentHistory(
  customerId: string,
  organizationId: number,
  supabase: SupabaseClient,
  filters?: ConsentHistoryFilters
): Promise<CallConsent[]> {
  // 1. Obtener los IDs de llamadas del cliente
  let callsQuery = supabase
    .from('calls')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('customer_id', customerId);

  if (filters?.fromDate) {
    callsQuery = callsQuery.gte('started_at', filters.fromDate);
  }
  if (filters?.toDate) {
    callsQuery = callsQuery.lte('started_at', filters.toDate);
  }

  const { data: calls, error: callsError } = await callsQuery;

  if (callsError || !calls || calls.length === 0) {
    if (callsError) {
      console.error('[consentService.getConsentHistory] error consultando llamadas:', callsError.message);
    }
    return [];
  }

  const callIds = calls.map((c) => c.id as string);

  // 2. Buscar consentimientos de esas llamadas
  let consentQuery = supabase
    .from('call_consents')
    .select('*')
    .eq('organization_id', organizationId)
    .in('call_id', callIds);

  if (filters?.consentType) {
    consentQuery = consentQuery.eq('consent_type', filters.consentType);
  }

  consentQuery = consentQuery.order('announced_at', { ascending: false });

  const limit = filters?.limit ?? 100;
  const offset = filters?.offset ?? 0;
  consentQuery = consentQuery.range(offset, offset + limit - 1);

  const { data: consents, error: consentError } = await consentQuery;

  if (consentError) {
    console.error('[consentService.getConsentHistory] error consultando consentimientos:', consentError.message);
    return [];
  }

  return (consents || []) as CallConsent[];
}
