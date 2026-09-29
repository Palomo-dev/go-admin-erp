/**
 * Validación previa a cada marcación (función canDial) — Ley 2300 de 2023
 * 
 * GO Admin ERP - Agente de voz
 * 
 * Esta función implementa las validaciones V0-V10 requeridas antes de marcar
 * cualquier llamada del agente de IA, cumpliendo con la Ley 2300 de 2023
 * de Colombia y las políticas internas.
 * 
 * FAIL-CLOSED: Si no se puede comprobar algo, NO se llama.
 * 
 * @see uploads/reglas_horario_llamadas_v1.md secciones 1-3.4
 * @see uploads/especificacion_agente_goadmin_v1.md sección 4, validaciones V0-V10
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isHolidayInTz, toDateStringInTz } from './holidays/colombia2026_2027';
import { localHourAndDay, DEFAULT_TIMEZONE } from './voiceAgentService';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type DialValidationCode =
  | 'ALLOWED'
  | 'LEGAL_GATE'
  | 'OUTSIDE_LEGAL_HOURS'
  | 'OUTSIDE_POLICY_HOURS'
  | 'DNC_INTERNAL'
  | 'RNE_EXCLUDED'
  | 'RNE_STALE'
  | 'LOCKED_TO_HUMAN'
  | 'FREQUENCY_LIMIT'
  | 'BUDGET_EXCEEDED'
  | 'DAILY_BUDGET'
  | 'NO_CREDITS'
  | 'CONCURRENCY'
  | 'NO_CALLER_ID'
  | 'DISABLED';

export interface DialValidationResult {
  allowed: boolean;
  code: DialValidationCode;
  reason?: string;
  next_allowed_at?: Date;
}

export interface DialContext {
  organizationId: number;
  customerId: string;
  customerPhone: string;
  timezone?: string;
  campaignId?: string;
  voiceAgentId?: string;
}

interface LegalGateConfig {
  privacy_policy_published_at?: string | null;
  crc_rne_registered_at?: string | null;
  crc_8308_number_registered_at?: string | null;
  internal_test_numbers?: string[];
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const LEGAL_HOURS = {
  weekday: { start: 7, end: 19 },  // L-V 7:00-19:00
  saturday: { start: 8, end: 15 },  // Sáb 8:00-15:00
} as const;

const POLICY_HOURS = {
  weekday: [
    { start: 8, end: 12 },   // 8:00-12:00
    { start: 14, end: 18 },  // 14:00-18:00
  ],
  saturday: null,  // Sin sábados en el piloto
} as const;

const LAST_DIAL_MARGIN_MINUTES = {
  ai_agent: 15,  // Llamadas del agente IA
  human: 30,     // Llamadas humanas
} as const;

const MAX_ATTEMPTS_PER_DAY = 1;
const MAX_UNANSWERED_ATTEMPTS_14_DAYS = 3;
const MIN_DAYS_AFTER_CONVERSATION = 7;
const MAX_CONTACTS_PER_MONTH = 2;

const PILOT_BUDGET_USD = 120;
const PILOT_DAILY_BUDGET_USD = 8;
const ALERT_THRESHOLDS = [80, 108]; // US$ 80 y US$ 108

// ─── Función principal ───────────────────────────────────────────────────────

/**
 * Valida si se puede marcar a un cliente en este momento.
 * 
 * Implementa las validaciones V0-V10 de la especificación:
 * - V0: Condiciones legales previas (política publicada, registro CRC/RNE)
 * - V1: Horario legal (Ley 2300): L-V 7-19, Sáb 8-15, nunca domingos ni festivos
 * - V2: Horario interno del piloto: L-V 8-12 y 14-18, sin sábados
 * - V3: Lista interna de no llamar
 * - V4: Registro de Números Excluidos (RNE) de la CRC
 * - V5: Bloqueo del lead al canal humano
 * - V6: Frecuencia (1/día, 3 en 14 días, 7 días después de conversación, 2/mes)
 * - V7: Tope de gasto (US$120 piloto, US$8 diario, alertas)
 * - V8: Concurrencia (máx 2 simultáneas) y ritmo (20s entre marcaciones)
 * - V9: Caller ID válido (604)
 * - V10: Interruptor de emergencia
 */
export async function canDial(
  context: DialContext,
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<DialValidationResult> {
  const tz = context.timezone || DEFAULT_TIMEZONE;

  try {
    // ─── V0: Condiciones legales previas ──────────────────────────────────
    const legalGate = await checkLegalGate(context.organizationId, context.customerPhone, supabase);
    if (!legalGate.allowed) return legalGate;

    // ─── V10: Interruptor de emergencia ───────────────────────────────────
    const emergencyStop = await checkEmergencyStop(context, supabase);
    if (!emergencyStop.allowed) return emergencyStop;

    // ─── V1: Horario legal (Ley 2300) ─────────────────────────────────────
    const legalHours = checkLegalHours(now, tz);
    if (!legalHours.allowed) return legalHours;

    // ─── V2: Horario interno del piloto ───────────────────────────────────
    const policyHours = checkPolicyHours(now, tz);
    if (!policyHours.allowed) return policyHours;

    // ─── V3: Lista interna de no llamar ───────────────────────────────────
    const dncCheck = await checkDoNotCall(context, supabase);
    if (!dncCheck.allowed) return dncCheck;

    // ─── V4: Registro de Números Excluidos (RNE) ──────────────────────────
    const rneCheck = await checkRNE(context, supabase, now);
    if (!rneCheck.allowed) return rneCheck;

    // ─── V5: Bloqueo del lead al canal humano ─────────────────────────────
    if (context.voiceAgentId) {
      const channelLock = await checkChannelLock(context, supabase);
      if (!channelLock.allowed) return channelLock;
    }

    // ─── V6: Frecuencia ────────────────────────────────────────────────────
    const frequency = await checkFrequency(context, supabase, now, tz);
    if (!frequency.allowed) return frequency;

    // ─── V7: Tope de gasto ─────────────────────────────────────────────────
    const budget = await checkBudget(context.organizationId, supabase, now, tz);
    if (!budget.allowed) return budget;

    // ─── V8: Concurrencia y ritmo ──────────────────────────────────────────
    const concurrency = await checkConcurrency(context.organizationId, supabase);
    if (!concurrency.allowed) return concurrency;

    // ─── V9: Caller ID válido ──────────────────────────────────────────────
    const callerId = await checkCallerId(context.organizationId, supabase);
    if (!callerId.allowed) return callerId;

    // ✓ Todas las validaciones pasaron
    return {
      allowed: true,
      code: 'ALLOWED',
    };
  } catch (error) {
    // Fail-closed: cualquier error bloquea la llamada
    console.error('[canDial] Error en validación:', error);
    return {
      allowed: false,
      code: 'DISABLED',
      reason: `Error al validar: ${error instanceof Error ? error.message : 'desconocido'}`,
    };
  }
}

// ─── Validaciones individuales ───────────────────────────────────────────────

/**
 * V0: Verifica las condiciones legales previas
 * - Política de privacidad publicada
 * - Registro en el RNE de la CRC
 * - Registro del número comercial (Resolución CRC 8308)
 * 
 * Si falta alguna, solo se permite llamar a números de prueba internos.
 */
async function checkLegalGate(
  orgId: number,
  phone: string,
  supabase: SupabaseClient
): Promise<DialValidationResult> {
  const { data, error } = await supabase
    .from('comm_settings')
    .select('metadata')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) {
    return {
      allowed: false,
      code: 'LEGAL_GATE',
      reason: 'Error al consultar configuración legal',
    };
  }

  const config = (data?.metadata || {}) as LegalGateConfig;
  const hasLegalPrereqs =
    config.privacy_policy_published_at &&
    config.crc_rne_registered_at &&
    config.crc_8308_number_registered_at;

  if (!hasLegalPrereqs) {
    // Solo números de prueba internos
    const testNumbers = config.internal_test_numbers || [];
    const normalizedPhone = phone.replace(/[^\d]/g, '');
    const isTestNumber = testNumbers.some(test =>
      test.replace(/[^\d]/g, '') === normalizedPhone
    );

    if (!isTestNumber) {
      return {
        allowed: false,
        code: 'LEGAL_GATE',
        reason: 'Faltan requisitos legales previos (política publicada, registro CRC/RNE). Solo números de prueba permitidos.',
      };
    }
  }

  return { allowed: true, code: 'ALLOWED' };
}

/**
 * V1: Verifica el horario legal según la Ley 2300 de 2023
 * - Lunes a viernes: 7:00 AM - 7:00 PM
 * - Sábados: 8:00 AM - 3:00 PM
 * - Nunca domingos ni festivos
 * 
 * La llamada debe poder TERMINAR antes del cierre (margen de 15 min para IA)
 */
function checkLegalHours(now: Date, timezone: string): DialValidationResult {
  const local = localHourAndDay(timezone, now);
  if (!local) {
    return {
      allowed: false,
      code: 'OUTSIDE_LEGAL_HOURS',
      reason: 'Zona horaria inválida',
    };
  }

  const { hour, day } = local;
  const dateString = toDateStringInTz(now, timezone);

  // Nunca domingos (día 0)
  if (day === 0) {
    return {
      allowed: false,
      code: 'OUTSIDE_LEGAL_HOURS',
      reason: 'No se permite llamar los domingos (Ley 2300 art. 3)',
    };
  }

  // Nunca festivos
  if (isHolidayInTz(now, timezone)) {
    return {
      allowed: false,
      code: 'OUTSIDE_LEGAL_HOURS',
      reason: `No se permite llamar en festivos (${dateString})`,
    };
  }

  // Sábado: 8:00-15:00 (última marcación 14:45 para IA)
  if (day === 6) {
    const { start, end } = LEGAL_HOURS.saturday;
    const lastDialHour = end - (LAST_DIAL_MARGIN_MINUTES.ai_agent / 60);
    if (hour < start || hour >= lastDialHour) {
      return {
        allowed: false,
        code: 'OUTSIDE_LEGAL_HOURS',
        reason: `Fuera del horario legal de sábado (8:00-${lastDialHour.toFixed(2).replace('.', ':')}). Hora actual: ${hour}:00`,
      };
    }
    return { allowed: true, code: 'ALLOWED' };
  }

  // Lunes a viernes: 7:00-19:00 (última marcación 18:45 para IA)
  const { start, end } = LEGAL_HOURS.weekday;
  const lastDialHour = end - (LAST_DIAL_MARGIN_MINUTES.ai_agent / 60);
  if (hour < start || hour >= lastDialHour) {
    return {
      allowed: false,
      code: 'OUTSIDE_LEGAL_HOURS',
      reason: `Fuera del horario legal L-V (7:00-${lastDialHour.toFixed(2).replace('.', ':')}). Hora actual: ${hour}:00`,
    };
  }

  return { allowed: true, code: 'ALLOWED' };
}

/**
 * V2: Verifica el horario interno del piloto (más estricto que el legal)
 * - Lunes a viernes: 8:00-12:00 y 14:00-18:00
 * - Sin sábados en el piloto
 * - No se marca después de 11:55 ni 17:55 (margen para que termine antes del cierre)
 */
function checkPolicyHours(now: Date, timezone: string): DialValidationResult {
  const local = localHourAndDay(timezone, now);
  if (!local) {
    return {
      allowed: false,
      code: 'OUTSIDE_POLICY_HOURS',
      reason: 'Zona horaria inválida',
    };
  }

  const { hour, day } = local;
  const minutes = now.getMinutes();
  const hourDecimal = hour + minutes / 60;

  // No sábados en el piloto
  if (day === 6) {
    return {
      allowed: false,
      code: 'OUTSIDE_POLICY_HOURS',
      reason: 'Sin llamadas del agente los sábados en el piloto',
    };
  }

  // Domingos ya se filtraron en V1

  // Lunes a viernes: dos franjas
  const windows = POLICY_HOURS.weekday;
  let inWindow = false;
  for (const window of windows) {
    // No marcar en los últimos 5 minutos de cada ventana
    const effectiveEnd = window.end - (LAST_DIAL_MARGIN_MINUTES.ai_agent / 60);
    if (hourDecimal >= window.start && hourDecimal < effectiveEnd) {
      inWindow = true;
      break;
    }
  }

  if (!inWindow) {
    return {
      allowed: false,
      code: 'OUTSIDE_POLICY_HOURS',
      reason: `Fuera del horario interno del piloto (L-V 8:00-11:55 y 14:00-17:55). Hora actual: ${hour}:${minutes.toString().padStart(2, '0')}`,
    };
  }

  return { allowed: true, code: 'ALLOWED' };
}

/**
 * V3: Verifica la lista interna de no llamar (do_not_call)
 * Usa la función existente fn_can_contact que lee:
 * - customers.do_not_call
 * - metadata->>'do_not_call'
 * - contact_consents
 */
async function checkDoNotCall(
  context: DialContext,
  supabase: SupabaseClient
): Promise<DialValidationResult> {
  const { data, error } = await supabase.rpc('fn_can_contact', {
    p_org: context.organizationId,
    p_customer: context.customerId,
    p_channel: 'voice',
    p_purpose: 'utility',
  });

  if (error) {
    // Fail-closed
    console.warn('[canDial] fn_can_contact falló:', error.message);
    return {
      allowed: false,
      code: 'DNC_INTERNAL',
      reason: 'Error al verificar lista de no llamar',
    };
  }

  if (data !== true) {
    return {
      allowed: false,
      code: 'DNC_INTERNAL',
      reason: 'Cliente con baja voluntaria de llamadas (do_not_call)',
    };
  }

  return { allowed: true, code: 'ALLOWED' };
}

/**
 * V4: Verifica el Registro de Números Excluidos (RNE) de la CRC
 * 
 * El número debe tener:
 * - rne_status = 'no_excluido'
 * - rne_checked_at de 30 días o menos
 * 
 * Si no hay consulta o está vencida, NO se llama (fail-closed)
 */
async function checkRNE(
  context: DialContext,
  supabase: SupabaseClient,
  now: Date
): Promise<DialValidationResult> {
  const { data, error } = await supabase
    .from('customers')
    .select('metadata')
    .eq('id', context.customerId)
    .eq('organization_id', context.organizationId)
    .maybeSingle();

  if (error) {
    return {
      allowed: false,
      code: 'RNE_STALE',
      reason: 'Error al consultar estado RNE del cliente',
    };
  }

  const metadata = (data?.metadata || {}) as {
    rne_status?: string;
    rne_checked_at?: string;
  };

  if (!metadata.rne_status || !metadata.rne_checked_at) {
    return {
      allowed: false,
      code: 'RNE_STALE',
      reason: 'No hay consulta del RNE para este número',
    };
  }

  if (metadata.rne_status === 'excluido') {
    return {
      allowed: false,
      code: 'RNE_EXCLUDED',
      reason: 'Número inscrito en el Registro de Números Excluidos (RNE) de la CRC',
    };
  }

  // Verificar que la consulta no tenga más de 30 días
  const checkedAt = new Date(metadata.rne_checked_at);
  const daysSinceCheck = (now.getTime() - checkedAt.getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSinceCheck > 30) {
    return {
      allowed: false,
      code: 'RNE_STALE',
      reason: `Consulta del RNE vencida (${Math.floor(daysSinceCheck)} días). Se requiere consulta de los últimos 30 días.`,
    };
  }

  return { allowed: true, code: 'ALLOWED' };
}

/**
 * V5: Verifica que el lead no esté bloqueado al canal humano
 * 
 * El agente IA solo puede marcar oportunidades con:
 * - Etiqueta 'canal_ia'
 * - salesperson_id = usuario "Agente IA"
 * 
 * El bloqueo dura 30 días desde la asignación
 */
async function checkChannelLock(
  context: DialContext,
  supabase: SupabaseClient
): Promise<DialValidationResult> {
  if (!context.campaignId && !context.voiceAgentId) {
    // Despacho puntual sin campaña: se asume que ya pasó las validaciones
    return { allowed: true, code: 'ALLOWED' };
  }

  const { data, error } = await supabase
    .from('opportunities')
    .select('tags, salesperson_id, assigned_at')
    .eq('customer_id', context.customerId)
    .eq('organization_id', context.organizationId)
    .eq('status', 'open')
    .maybeSingle();

  if (error) {
    return {
      allowed: false,
      code: 'LOCKED_TO_HUMAN',
      reason: 'Error al verificar bloqueo de canal',
    };
  }

  if (!data) {
    // No hay oportunidad abierta: se permite
    return { allowed: true, code: 'ALLOWED' };
  }

  const tags = (data.tags || []) as string[];
  const hasHumanLock = tags.includes('canal_humano');

  if (hasHumanLock) {
    // Verificar si el bloqueo sigue vigente (30 días)
    if (data.assigned_at) {
      const assignedAt = new Date(data.assigned_at);
      const daysSinceAssignment = (Date.now() - assignedAt.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceAssignment <= 30) {
        return {
          allowed: false,
          code: 'LOCKED_TO_HUMAN',
          reason: 'Lead bloqueado al canal humano',
        };
      }
    } else {
      // Sin fecha de asignación: se mantiene el bloqueo
      return {
        allowed: false,
        code: 'LOCKED_TO_HUMAN',
        reason: 'Lead bloqueado al canal humano',
      };
    }
  }

  return { allowed: true, code: 'ALLOWED' };
}

/**
 * V6: Verifica la frecuencia de contacto
 * - Máximo 1 intento por día
 * - Máximo 3 intentos sin respuesta en 14 días
 * - 7 días de espera después de una conversación contestada
 * - Máximo 2 contactos al mes
 */
async function checkFrequency(
  context: DialContext,
  supabase: SupabaseClient,
  now: Date,
  timezone: string
): Promise<DialValidationResult> {
  const dayStart = startOfDayInTz(timezone, now);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Contar intentos hoy
  const { count: attemptsToday, error: errorToday } = await supabase
    .from('voice_agent_call_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', context.organizationId)
    .eq('customer_id', context.customerId)
    .gte('attempted_at', dayStart);

  if (errorToday) {
    return {
      allowed: false,
      code: 'FREQUENCY_LIMIT',
      reason: 'Error al verificar intentos del día',
    };
  }

  if ((attemptsToday || 0) >= MAX_ATTEMPTS_PER_DAY) {
    const tomorrow = new Date(dayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0); // Próximo día a las 8:00 AM

    return {
      allowed: false,
      code: 'FREQUENCY_LIMIT',
      reason: `Ya se hizo ${attemptsToday} intento(s) hoy. Máximo ${MAX_ATTEMPTS_PER_DAY} por día.`,
      next_allowed_at: tomorrow,
    };
  }

  // Contar intentos sin respuesta en 14 días
  const { data: unansweredAttempts, error: errorUnanswered } = await supabase
    .from('voice_agent_call_attempts')
    .select('id')
    .eq('organization_id', context.organizationId)
    .eq('customer_id', context.customerId)
    .gte('attempted_at', fourteenDaysAgo.toISOString())
    .eq('answered', false);

  if (errorUnanswered) {
    return {
      allowed: false,
      code: 'FREQUENCY_LIMIT',
      reason: 'Error al verificar intentos no contestados',
    };
  }

  if ((unansweredAttempts?.length || 0) >= MAX_UNANSWERED_ATTEMPTS_14_DAYS) {
    return {
      allowed: false,
      code: 'FREQUENCY_LIMIT',
      reason: `Ya se hicieron ${unansweredAttempts?.length} intentos sin respuesta en 14 días. Máximo ${MAX_UNANSWERED_ATTEMPTS_14_DAYS}.`,
    };
  }

  // Verificar conversaciones contestadas en los últimos 7 días
  const { data: recentConversations, error: errorConversations } = await supabase
    .from('calls')
    .select('started_at')
    .eq('organization_id', context.organizationId)
    .eq('customer_id', context.customerId)
    .gte('started_at', sevenDaysAgo.toISOString())
    .eq('status', 'completed')
    .not('duration_seconds', 'is', null)
    .gte('duration_seconds', 30); // Solo conversaciones reales (>30s)

  if (errorConversations) {
    return {
      allowed: false,
      code: 'FREQUENCY_LIMIT',
      reason: 'Error al verificar conversaciones recientes',
    };
  }

  if (recentConversations && recentConversations.length > 0) {
    const lastConversation = new Date(recentConversations[0].started_at);
    const nextAllowed = new Date(lastConversation.getTime() + 7 * 24 * 60 * 60 * 1000);

    return {
      allowed: false,
      code: 'FREQUENCY_LIMIT',
      reason: `Última conversación hace ${Math.floor((now.getTime() - lastConversation.getTime()) / (1000 * 60 * 60 * 24))} días. Mínimo ${MIN_DAYS_AFTER_CONVERSATION} días de espera.`,
      next_allowed_at: nextAllowed,
    };
  }

  // Verificar contactos exitosos en el último mes
  const { data: monthlyContacts, error: errorMonthly } = await supabase
    .from('calls')
    .select('id')
    .eq('organization_id', context.organizationId)
    .eq('customer_id', context.customerId)
    .gte('started_at', thirtyDaysAgo.toISOString())
    .eq('status', 'completed')
    .not('duration_seconds', 'is', null)
    .gte('duration_seconds', 30);

  if (errorMonthly) {
    return {
      allowed: false,
      code: 'FREQUENCY_LIMIT',
      reason: 'Error al verificar contactos del mes',
    };
  }

  if ((monthlyContacts?.length || 0) >= MAX_CONTACTS_PER_MONTH) {
    return {
      allowed: false,
      code: 'FREQUENCY_LIMIT',
      reason: `Ya se hicieron ${monthlyContacts?.length} contactos este mes. Máximo ${MAX_CONTACTS_PER_MONTH} por mes.`,
    };
  }

  return { allowed: true, code: 'ALLOWED' };
}

/**
 * V7: Verifica el tope de gasto del piloto
 * - Tope total: US$120
 * - Tope diario: US$8
 * - Alertas en US$80 y US$108
 * 
 * Calcula el gasto acumulado desde calls.cost_amount (Twilio real)
 * + estimación de ConversationRelay, ElevenLabs y LLM por minuto
 */
async function checkBudget(
  orgId: number,
  supabase: SupabaseClient,
  now: Date,
  timezone: string
): Promise<DialValidationResult> {
  const dayStart = startOfDayInTz(timezone, now);

  // Consultar gasto acumulado (debería haber una vista v_voice_pilot_spend)
  const { data: totalData, error: errorTotal } = await supabase
    .from('calls')
    .select('cost_amount')
    .eq('organization_id', orgId)
    .eq('mode', 'ai_agent')
    .not('cost_amount', 'is', null);

  if (errorTotal) {
    return {
      allowed: false,
      code: 'BUDGET_EXCEEDED',
      reason: 'Error al verificar presupuesto total',
    };
  }

  const totalSpent = (totalData || []).reduce((sum, call) => 
    sum + (typeof call.cost_amount === 'number' ? call.cost_amount : 0), 0
  );

  if (totalSpent >= PILOT_BUDGET_USD) {
    return {
      allowed: false,
      code: 'BUDGET_EXCEEDED',
      reason: `Presupuesto del piloto agotado (US$${totalSpent.toFixed(2)} de US$${PILOT_BUDGET_USD})`,
    };
  }

  // Verificar alertas (enviar correo a Juan si es necesario)
  for (const threshold of ALERT_THRESHOLDS) {
    if (totalSpent >= threshold && totalSpent < threshold + 1) {
      console.warn(`[canDial] ALERTA: Gasto del piloto alcanzó US$${totalSpent.toFixed(2)} (${((totalSpent/PILOT_BUDGET_USD)*100).toFixed(1)}%)`);
      // TODO: Enviar correo a Juan
    }
  }

  // Consultar gasto del día
  const { data: dailyData, error: errorDaily } = await supabase
    .from('calls')
    .select('cost_amount')
    .eq('organization_id', orgId)
    .eq('mode', 'ai_agent')
    .gte('started_at', dayStart)
    .not('cost_amount', 'is', null);

  if (errorDaily) {
    return {
      allowed: false,
      code: 'DAILY_BUDGET',
      reason: 'Error al verificar presupuesto diario',
    };
  }

  const dailySpent = (dailyData || []).reduce((sum, call) => 
    sum + (typeof call.cost_amount === 'number' ? call.cost_amount : 0), 0
  );

  if (dailySpent >= PILOT_DAILY_BUDGET_USD) {
    return {
      allowed: false,
      code: 'DAILY_BUDGET',
      reason: `Tope diario alcanzado (US$${dailySpent.toFixed(2)} de US$${PILOT_DAILY_BUDGET_USD})`,
    };
  }

  // Verificar créditos de voz disponibles
  const { data: creditsData, error: errorCredits } = await supabase
    .from('comm_settings')
    .select('voice_credits_remaining')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (errorCredits) {
    return {
      allowed: false,
      code: 'NO_CREDITS',
      reason: 'Error al verificar créditos de voz',
    };
  }

  const credits = creditsData?.voice_credits_remaining || 0;
  if (credits <= 0) {
    return {
      allowed: false,
      code: 'NO_CREDITS',
      reason: 'Sin créditos de voz disponibles',
    };
  }

  return { allowed: true, code: 'ALLOWED' };
}

/**
 * V8: Verifica concurrencia y ritmo
 * - Máximo 2 llamadas simultáneas
 * - Mínimo 20 segundos entre marcaciones
 */
async function checkConcurrency(
  orgId: number,
  supabase: SupabaseClient
): Promise<DialValidationResult> {
  // Contar llamadas en progreso
  const { count, error } = await supabase
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('mode', 'ai_agent')
    .eq('status', 'in_progress');

  if (error) {
    return {
      allowed: false,
      code: 'CONCURRENCY',
      reason: 'Error al verificar llamadas simultáneas',
    };
  }

  const maxConcurrent = 2; // De comm_settings.voice_max_concurrent_calls
  if ((count || 0) >= maxConcurrent) {
    return {
      allowed: false,
      code: 'CONCURRENCY',
      reason: `Máximo de llamadas simultáneas alcanzado (${count}/${maxConcurrent})`,
    };
  }

  // Verificar ritmo: última marcación hace más de 20 segundos
  const { data: lastCall, error: errorLast } = await supabase
    .from('calls')
    .select('started_at')
    .eq('organization_id', orgId)
    .eq('mode', 'ai_agent')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errorLast) {
    // Fail-open en el ritmo: si no se puede verificar, se permite
    return { allowed: true, code: 'ALLOWED' };
  }

  if (lastCall) {
    const lastCallTime = new Date(lastCall.started_at);
    const secondsSince = (Date.now() - lastCallTime.getTime()) / 1000;
    
    if (secondsSince < 20) {
      return {
        allowed: false,
        code: 'CONCURRENCY',
        reason: `Mínimo 20 segundos entre marcaciones (último hace ${Math.floor(secondsSince)}s)`,
      };
    }
  }

  return { allowed: true, code: 'ALLOWED' };
}

/**
 * V9: Verifica que haya un caller ID válido configurado
 * Debe ser el número 604 propio de la organización, nunca el de la plataforma
 */
async function checkCallerId(
  orgId: number,
  supabase: SupabaseClient
): Promise<DialValidationResult> {
  const { data, error } = await supabase
    .from('comm_settings')
    .select('voice_caller_id')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) {
    return {
      allowed: false,
      code: 'NO_CALLER_ID',
      reason: 'Error al verificar caller ID',
    };
  }

  if (!data?.voice_caller_id) {
    return {
      allowed: false,
      code: 'NO_CALLER_ID',
      reason: 'No hay número de salida configurado (Configuración › CRM › Telefonía)',
    };
  }

  // Verificar que no sea un número de la plataforma
  const callerId = String(data.voice_caller_id);
  if (!callerId.includes('604') && !callerId.includes('+57604')) {
    // TODO: verificar contra phone_numbers table
    return {
      allowed: false,
      code: 'NO_CALLER_ID',
      reason: 'Caller ID no válido (se requiere número propio 604)',
    };
  }

  return { allowed: true, code: 'ALLOWED' };
}

/**
 * V10: Verifica el interruptor de emergencia
 * - voice_agent_enabled en comm_settings
 * - Campaña activa (si aplica)
 * - Agente activo
 */
async function checkEmergencyStop(
  context: DialContext,
  supabase: SupabaseClient
): Promise<DialValidationResult> {
  // Verificar configuración de la organización
  const { data: orgData, error: orgError } = await supabase
    .from('comm_settings')
    .select('voice_agent_enabled')
    .eq('organization_id', context.organizationId)
    .maybeSingle();

  if (orgError) {
    return {
      allowed: false,
      code: 'DISABLED',
      reason: 'Error al verificar configuración del agente',
    };
  }

  if (orgData?.voice_agent_enabled !== true) {
    return {
      allowed: false,
      code: 'DISABLED',
      reason: 'El agente de voz está desactivado para esta organización',
    };
  }

  // Verificar campaña si aplica
  if (context.campaignId) {
    const { data: campaignData, error: campaignError } = await supabase
      .from('voice_agent_campaigns')
      .select('status, emergency_stop')
      .eq('id', context.campaignId)
      .eq('organization_id', context.organizationId)
      .maybeSingle();

    if (campaignError) {
      return {
        allowed: false,
        code: 'DISABLED',
        reason: 'Error al verificar estado de la campaña',
      };
    }

    if (campaignData?.emergency_stop === true) {
      return {
        allowed: false,
        code: 'DISABLED',
        reason: 'Campaña en parada de emergencia',
      };
    }

    if (campaignData?.status !== 'running') {
      return {
        allowed: false,
        code: 'DISABLED',
        reason: `Campaña no está activa (estado: ${campaignData?.status || 'desconocido'})`,
      };
    }
  }

  // Verificar agente si aplica
  if (context.voiceAgentId) {
    const { data: agentData, error: agentError } = await supabase
      .from('voice_agents')
      .select('is_active')
      .eq('id', context.voiceAgentId)
      .eq('organization_id', context.organizationId)
      .maybeSingle();

    if (agentError) {
      return {
        allowed: false,
        code: 'DISABLED',
        reason: 'Error al verificar estado del agente',
      };
    }

    if (agentData?.is_active !== true) {
      return {
        allowed: false,
        code: 'DISABLED',
        reason: 'El agente está desactivado',
      };
    }
  }

  return { allowed: true, code: 'ALLOWED' };
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

/**
 * Inicio del día en la zona horaria especificada
 * (copia de voiceAgentService.startOfDayIso para evitar dependencia circular)
 */
function startOfDayInTz(timezone: string, now: Date = new Date()): string {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const dateStr = fmt.format(now);
    return `${dateStr}T00:00:00.000Z`;
  } catch {
    // Fallback a medianoche UTC
    const utc = new Date(now);
    utc.setUTCHours(0, 0, 0, 0);
    return utc.toISOString();
  }
}
