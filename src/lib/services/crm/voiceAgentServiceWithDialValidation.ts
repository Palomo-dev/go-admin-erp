/**
 * Extensión de voiceAgentService con validación canDial integrada
 * 
 * GO Admin ERP - CRM
 * 
 * Este módulo extiende las funciones de voiceAgentService.ts agregando
 * la validación canDial (V0-V10) antes de cada marcación.
 * 
 * IMPORTANTE: Este archivo debe reemplazar las llamadas directas a
 * dialClaimedCall y dispatchAgentCall en el cron y otros puntos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canDial,
  type DialContext,
  type DialValidationResult,
} from './dialValidation';
import {
  dispatchAgentCall as originalDispatchAgentCall,
  type DispatchAgentCallInput,
  type DispatchAgentCallResult,
} from './voiceAgentService';

/**
 * Registra un intento de marcación rechazado en voice_agent_call_attempts
 * 
 * Esto asegura que los rechazos cuenten para las métricas de frecuencia (V6)
 * y auditoría (CA-37)
 */
async function logRejectedAttempt(
  orgId: number,
  customerId: string,
  voiceAgentId: string | undefined,
  campaignId: string | undefined,
  code: string,
  reason: string,
  supabase: SupabaseClient
): Promise<void> {
  try {
    await supabase.from('voice_agent_call_attempts').insert({
      organization_id: orgId,
      customer_id: customerId,
      voice_agent_id: voiceAgentId || null,
      campaign_id: campaignId || null,
      attempted_at: new Date().toISOString(),
      answered: false,
      rejection_code: code,
      rejection_reason: reason,
    });
  } catch (err) {
    console.error('[logRejectedAttempt] Error:', err);
    // No propagamos el error para no bloquear el flujo
  }
}

/**
 * Wrapper de dispatchAgentCall que valida con canDial antes de marcar
 * 
 * Esta es la función que deben usar todos los puntos de entrada:
 * - API de despacho manual
 * - Triggers por etapa del embudo
 * - Botones de "llamar ahora" en la UI
 */
export async function dispatchAgentCallWithValidation(
  orgId: number,
  supabase: SupabaseClient,
  input: DispatchAgentCallInput
): Promise<DispatchAgentCallResult & { validation?: DialValidationResult }> {
  // 1. Obtener información del cliente para validar
  if (!input.customerId && !input.opportunityId) {
    throw new Error('Se requiere customerId o opportunityId');
  }

  let customerId = input.customerId || null;
  let customerPhone = '';

  if (!customerId && input.opportunityId) {
    const { data: opp } = await supabase
      .from('opportunities')
      .select('customer_id')
      .eq('id', input.opportunityId)
      .eq('organization_id', orgId)
      .maybeSingle();

    customerId = opp?.customer_id || null;
  }

  if (!customerId) {
    throw new Error('No se pudo resolver el cliente');
  }

  const { data: customer } = await supabase
    .from('customers')
    .select('id, phone, timezone')
    .eq('id', customerId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!customer || !customer.phone) {
    throw new Error('Cliente no encontrado o sin teléfono');
  }

  customerPhone = customer.phone;

  // 2. Ejecutar validación canDial
  const context: DialContext = {
    organizationId: orgId,
    customerId: customer.id,
    customerPhone,
    timezone: customer.timezone || undefined,
    voiceAgentId: input.voiceAgentId,
  };

  const validation = await canDial(context, supabase);

  // 3. Si no se permite, registrar el rechazo y devolverlo
  if (!validation.allowed) {
    await logRejectedAttempt(
      orgId,
      customerId,
      input.voiceAgentId,
      undefined, // No hay campaignId en despacho puntual
      validation.code,
      validation.reason || 'Validación rechazada',
      supabase
    );

    return {
      voice_agent_call_id: '',
      dialed: false,
      reason: validation.reason || `Rechazado por validación: ${validation.code}`,
      validation,
    };
  }

  // 4. Si se permite, ejecutar el despacho original
  try {
    const result = await originalDispatchAgentCall(orgId, supabase, input);
    return {
      ...result,
      validation,
    };
  } catch (err) {
    // Registrar como intento fallido
    const message = err instanceof Error ? err.message : 'Error desconocido';
    await logRejectedAttempt(
      orgId,
      customerId,
      input.voiceAgentId,
      undefined,
      'DISPATCH_ERROR',
      message,
      supabase
    );
    throw err;
  }
}

/**
 * Valida si una llamada de campaña puede marcarse ahora
 * 
 * Esta función debe llamarse ANTES de dialClaimedCall en el cron.
 * Devuelve un resultado de validación que permite:
 * - Rechazar la llamada (liberar la fila)
 * - Reprogramarla para más tarde
 * - Continuar con la marcación
 */
export async function validateCampaignCall(
  orgId: number,
  customerId: string,
  customerPhone: string,
  customerTimezone: string | null,
  voiceAgentId: string,
  campaignId: string,
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<DialValidationResult> {
  const context: DialContext = {
    organizationId: orgId,
    customerId,
    customerPhone,
    timezone: customerTimezone || undefined,
    voiceAgentId,
    campaignId,
  };

  const validation = await canDial(context, supabase, now);

  // Registrar intentos rechazados para auditoría y métricas
  if (!validation.allowed) {
    await logRejectedAttempt(
      orgId,
      customerId,
      voiceAgentId,
      campaignId,
      validation.code,
      validation.reason || 'Validación rechazada',
      supabase
    );
  }

  return validation;
}

/**
 * Integración con el cron de campañas
 * 
 * Esta función debe llamarse EN LUGAR de dialClaimedCall directamente.
 * Valida con canDial primero y solo marca si todas las validaciones pasan.
 * 
 * Devuelve:
 * - { shouldDial: true, validation } si se debe marcar
 * - { shouldDial: false, validation, action: 'reschedule' | 'skip' } si no
 */
export async function shouldDialCampaignCall(params: {
  orgId: number;
  customerId: string;
  customerPhone: string;
  customerTimezone: string | null;
  voiceAgentId: string;
  campaignId: string;
  supabase: SupabaseClient;
  now?: Date;
}): Promise<{
  shouldDial: boolean;
  validation: DialValidationResult;
  action?: 'reschedule' | 'skip';
  rescheduleTo?: Date;
}> {
  const validation = await validateCampaignCall(
    params.orgId,
    params.customerId,
    params.customerPhone,
    params.customerTimezone,
    params.voiceAgentId,
    params.campaignId,
    params.supabase,
    params.now
  );

  if (validation.allowed) {
    return {
      shouldDial: true,
      validation,
    };
  }

  // Determinar acción según el código de rechazo
  const reschedulableCodes = [
    'OUTSIDE_LEGAL_HOURS',
    'OUTSIDE_POLICY_HOURS',
    'FREQUENCY_LIMIT',
    'CONCURRENCY',
  ];

  const skipCodes = [
    'LEGAL_GATE',
    'DNC_INTERNAL',
    'RNE_EXCLUDED',
    'RNE_STALE',
    'LOCKED_TO_HUMAN',
    'BUDGET_EXCEEDED',
    'DAILY_BUDGET',
    'NO_CREDITS',
    'NO_CALLER_ID',
    'DISABLED',
  ];

  if (reschedulableCodes.includes(validation.code)) {
    return {
      shouldDial: false,
      validation,
      action: 'reschedule',
      rescheduleTo: validation.next_allowed_at || undefined,
    };
  }

  if (skipCodes.includes(validation.code)) {
    return {
      shouldDial: false,
      validation,
      action: 'skip',
    };
  }

  // Por defecto: skip
  return {
    shouldDial: false,
    validation,
    action: 'skip',
  };
}
