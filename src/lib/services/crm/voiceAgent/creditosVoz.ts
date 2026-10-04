/** Solo servidor. La organización y el destinatario ya se resolvieron antes de usar estas RPC privadas. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { CrmHttpError, UUID_RE } from '../crmErrors';

const preparacionSchema = z.object({
  reservation_id: z.string().uuid(), call_id: z.string().uuid(), created: z.boolean(),
  state: z.enum(['reserved', 'consumed', 'refunded']),
  submission_state: z.enum(['prepared', 'submitting', 'accepted', 'rejected', 'uncertain']),
});
const confirmacionSchema = z.object({
  reservation_id: z.string().uuid(), call_id: z.string().uuid(), voice_agent_call_id: z.string().uuid(),
  attempt_no: z.number().int().positive(),
});
const falloSchema = z.object({ refunded: z.boolean(), uncertain: z.boolean(), applied: z.boolean() });
const callbackSchema = z.object({ applied: z.boolean(), refunded: z.boolean(), current_attempt: z.boolean() });
const conciliacionSchema = z.object({
  settled: z.boolean(), applied: z.boolean(), minutes_charged: z.number().int().nonnegative(), minutes_due: z.number().int().nonnegative(),
});
const reintentoSchema = z.object({
  requeued: z.boolean(), applied: z.boolean().optional(), reason: z.string().optional(),
  job_id: z.string().uuid().optional(), run_at: z.string().datetime({ offset: true }).optional(),
}).superRefine((value, ctx) => {
  if (value.requeued && (!value.job_id || !value.run_at)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Reintento incompleto' });
});

/** Una incertidumbre no permite liberar la llamada, devolver ni marcar otro intento. */
export class VoiceCreditPendingError extends CrmHttpError {
  constructor(public readonly cause?: unknown) {
    super(409, 'voz_pendiente_conciliacion', 'La llamada está pendiente de conciliación.');
    this.name = 'VoiceCreditPendingError';
  }
}

async function ejecutar<S extends z.ZodType>(sb: SupabaseClient, name: string, args: Record<string, unknown>, schema: S): Promise<z.infer<S>> {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw error;
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new CrmHttpError(500, 'respuesta_creditos_voz_invalida', 'No se pudo verificar la operación de voz.');
  return parsed.data;
}

export interface PreparacionCreditoVoz {
  callId: string; attempt: number; from: string; to: string; recording: boolean;
  customerPhone: string; customerTimezone: string | null; metadata?: Record<string, unknown>;
}
export function prepararCreditoVoz(sb: SupabaseClient, org: number, input: PreparacionCreditoVoz) {
  return ejecutar(sb, 'crm_voice_dispatch_prepare', {
    p_org: org, p_vac: input.callId, p_attempt: input.attempt, p_from: input.from, p_to: input.to, p_recording: input.recording,
    p_metadata: { ...input.metadata, expected_customer_phone: input.customerPhone, expected_customer_timezone: input.customerTimezone },
  }, preparacionSchema);
}
export function iniciarEnvioVoz(sb: SupabaseClient, org: number, reservation: string) {
  return ejecutar(sb, 'crm_voice_dispatch_begin', { p_org: org, p_reservation: reservation }, z.boolean());
}
export function cancelarPreparacionVoz(sb: SupabaseClient, org: number, reservation: string) {
  return ejecutar(sb, 'crm_voice_dispatch_cancel_prepared', { p_org: org, p_reservation: reservation }, z.boolean());
}
export async function confirmarEnvioVoz(sb: SupabaseClient, org: number, reservation: string, sid: string) {
  const result = await ejecutar(sb, 'crm_voice_dispatch_accept', { p_org: org, p_reservation: reservation, p_sid: sid }, confirmacionSchema);
  if (result.reservation_id !== reservation) throw new CrmHttpError(500, 'respuesta_creditos_voz_invalida', 'Correlación de voz inválida.');
  return result;
}
/** Solo recibe el fallo de calls.create; un error posterior de base no prueba rechazo del proveedor. */
export function registrarFalloEnvioVoz(sb: SupabaseClient, org: number, reservation: string, error: unknown) {
  const provider = error && typeof error === 'object' ? error as { status?: unknown; code?: unknown } : {};
  return ejecutar(sb, 'crm_voice_dispatch_failure', {
    p_org: org, p_reservation: reservation,
    p_http_status: typeof provider.status === 'number' && Number.isInteger(provider.status) ? provider.status : null,
    p_provider_code: typeof provider.code === 'number' || typeof provider.code === 'string' ? String(provider.code) : null,
  }, falloSchema);
}
export function aplicarCallbackVoz(sb: SupabaseClient, org: number, reservation: string, sid: string, status: string, duration: number | null, outcome: string | null) {
  return ejecutar(sb, 'crm_voice_callback_apply', {
    p_org: org, p_reservation: reservation, p_sid: sid, p_status: status, p_duration: duration, p_outcome: outcome,
  }, callbackSchema);
}
export function abrirSesionCreditoVoz(sb: SupabaseClient, org: number, sid: string, callId: string | null, startedAt: string, recipient: string) {
  return ejecutar(sb, 'crm_voice_session_open', {
    p_org: org, p_sid: sid, p_vac: callId, p_started_at: startedAt, p_recipient: recipient,
  }, z.string().uuid());
}
export function conciliarSesionCreditoVoz(sb: SupabaseClient, org: number, sid: string, endedAt: string, messageCount: number) {
  return ejecutar(sb, 'crm_voice_session_settle', { p_org: org, p_sid: sid, p_ended_at: endedAt, p_message_count: messageCount }, conciliacionSchema);
}
export function programarReintentoVoz(sb: SupabaseClient, org: number, reservation: string) {
  return ejecutar(sb, 'crm_voice_retry_rejected', { p_org: org, p_reservation: reservation }, reintentoSchema);
}

const reservaPersistidaSchema = z.object({
  id: z.string().uuid(), organization_id: z.number().int(), voice_agent_call_id: z.string().uuid(),
  call_id: z.string().uuid(), attempt_no: z.number().int().positive(), provider_call_sid: z.string().nullable(),
  state: z.enum(['reserved', 'consumed', 'refunded']),
});
/** Tras firma/AccountSid: un token ajeno nunca cae en el escritor antiguo. SID permite callbacks sin query. */
export async function buscarReservaVoz(sb: SupabaseClient, org: number, callId: string, reservation: string | null, sid: string | null) {
  if (!reservation && !sid) return null;
  if (reservation && !UUID_RE.test(reservation)) throw new CrmHttpError(403, 'reserva_voz_invalida', 'Reserva de voz inválida.');
  let query = sb.from('crm_voice_credit_reservations').select('id,organization_id,voice_agent_call_id,call_id,attempt_no,provider_call_sid,state')
    .eq('organization_id', org).eq('voice_agent_call_id', callId);
  query = reservation ? query.eq('id', reservation) : query.eq('provider_call_sid', sid);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) {
    if (reservation) throw new CrmHttpError(403, 'reserva_voz_invalida', 'Reserva de voz inválida.');
    return null;
  }
  const parsed = reservaPersistidaSchema.safeParse(data);
  if (!parsed.success) throw new CrmHttpError(500, 'respuesta_creditos_voz_invalida', 'Reserva de voz inválida.');
  const row = parsed.data;
  if (row.organization_id !== org || row.voice_agent_call_id !== callId || (reservation && row.id !== reservation) || (row.provider_call_sid && row.provider_call_sid !== sid))
    throw new CrmHttpError(403, 'sid_voz_conflictivo', 'La llamada no corresponde a la reserva.');
  return row;
}
