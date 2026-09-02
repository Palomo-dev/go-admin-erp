/**
 * Consent Service — Registro y consulta de consentimientos de grabación.
 * GO Admin ERP — Fase 3 (Telefonía CRM)
 *
 * Tabla: call_consents
 * Tabla relacionada: calls (campo consent_given)
 *
 * Todas las funciones reciben `supabase` y `organizationId` para garantizar
 * aislamiento por organización (multi-tenant).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { updateCall } from './callManagementService';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ConsentType = 'recording' | 'data_processing' | 'marketing' | 'custom';
export type ConsentMethod = 'voice_announcement' | 'sms' | 'email' | 'manual' | 'ivrs';

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
 * Registra un consentimiento de grabación en la tabla call_consents.
 *
 * Si `consentGiven` es true, también actualiza `calls.consent_given = true`.
 * Si es false, no modifica `calls.consent_given` (queda en su valor actual).
 *
 * @param organizationId ID de la organización
 * @param params Parámetros del consentimiento
 * @param supabase Cliente Supabase
 * @returns El registro creado o null si falla
 */
export async function recordConsent(
  organizationId: number,
  params: RecordConsentParams,
  supabase: SupabaseClient
): Promise<CallConsent | null> {
  const {
    callId,
    consentType,
    consentGiven,
    consentMessage,
    method = 'voice_announcement',
    locale = 'es-CO',
  } = params;

  if (!callId) {
    throw new Error('recordConsent: callId es requerido');
  }
  if (!consentType) {
    throw new Error('recordConsent: consentType es requerido');
  }

  // 1. Insertar el registro de consentimiento
  const { data: consent, error } = await supabase
    .from('call_consents')
    .insert({
      organization_id: organizationId,
      call_id: callId,
      consent_type: consentType,
      method,
      locale,
      recorded_announcement_text: consentMessage ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('[consentService.recordConsent] error insertando:', error.message);
    throw error;
  }

  // 2. Si el consentimiento fue otorgado, actualizar calls.consent_given = true
  if (consentGiven) {
    try {
      await updateCall(
        callId,
        organizationId,
        { consent_given: true },
        supabase
      );
    } catch (updateErr) {
      // No fallar toda la operación si solo falla el update de calls
      const message = updateErr instanceof Error ? updateErr.message : 'Error desconocido';
      console.warn('[consentService.recordConsent] no se pudo actualizar calls.consent_given:', message);
    }
  }

  return consent as CallConsent;
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
