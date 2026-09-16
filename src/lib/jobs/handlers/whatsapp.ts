import { JobFatalError, JobRetryableError, type JobHandler } from '../types';
import { findByClientRequestId, sendWhatsApp } from '@/lib/services/crm/whatsapp/outboundService';
import { WhatsAppError, type SendWhatsAppInput } from '@/lib/services/crm/whatsapp/types';

/**
 * Handler kind 'whatsapp' (FASE-16 §4.4): envío programado
 * `{ message_request: SendWhatsAppInput, customer_id }`.
 * WINDOW_CLOSED / OPTED_OUT / NOT_FOUND → JobFatalError (terminal);
 * PROVIDER / INTERNAL → JobRetryableError (backoff de fn_fail_job).
 *
 * Idempotencia (F0-JOBS r3, QA r2 N-4). El contrato de FASE-00 §4.4
 * (`{message_id}` de una fila `messages` en `pending`) no es implementable con
 * el esquema real: `messages` no tiene `status` ni `provider_message_id`
 * (verificado por MCP 2026-09-15) y el envío lo dispara el INSERT
 * (`trg_channel_dispatch`). Lo que sí existe es la clave de idempotencia de
 * F16 (`metadata.client_request_id`, `findByClientRequestId`, ventana 7 d).
 * Este handler la fija SIEMPRE: si `message_request` no trae
 * `clientRequestId`, usa `job:{job.id}`. Así, una segunda ejecución del mismo
 * job (timeout advisory, reclaim, `complete_failed`, retry manual con
 * `retried_from`) encuentra el `messages` ya creado y devuelve
 * `{skipped:true, reason:'already_sent'}` SIN llamar a `sendWhatsApp`.
 * `sendWhatsApp` repite la comprobación antes de descontar créditos.
 *
 * r4 (tester r3 T-1/T-2):
 *  - La comprobación de idempotencia es fail-closed: si la consulta falla
 *    (timeout, red) se lanza `JobRetryableError('idempotency_check_failed')`
 *    y NO se envía; el backoff de `fn_fail_job` repite la comprobación.
 *  - `signal` se recomprueba antes de cada efecto (al entrar y justo antes de
 *    `sendWhatsApp`). `sendWhatsApp` no admite `signal` (F16): un abort DURANTE
 *    el envío no lo cancela; lo cubre la clave `client_request_id` en la
 *    siguiente ejecución. Contrato honesto en FASE-00 §4.4.
 */
export function whatsappJobClientRequestId(jobId: string, req: Pick<SendWhatsAppInput, 'clientRequestId'>, payload: Record<string, unknown>): string {
  if (typeof req.clientRequestId === 'string' && req.clientRequestId) return req.clientRequestId;
  // Un retry manual (`retried_from`) es el MISMO envío: hereda la clave del job original.
  const origin = typeof payload.retried_from === 'string' && payload.retried_from ? payload.retried_from : jobId;
  return `job:${origin}`;
}

export const whatsappJobHandler: JobHandler = async ({ job, supabase, orgId, log, signal }) => {
  const req = job.payload?.message_request as SendWhatsAppInput | undefined;
  if (!req) throw new JobFatalError('payload.message_request requerido');
  if (Number(req.orgId) !== orgId) throw new JobFatalError('message_request.orgId no coincide con el job');
  // El timeout del runner es advisory: no se inicia un envío que ya no se va a esperar.
  if (signal.aborted) throw new JobRetryableError('aborted antes del envío');

  const clientRequestId = whatsappJobClientRequestId(job.id, req, job.payload ?? {});
  let previo: Awaited<ReturnType<typeof findByClientRequestId>>;
  try {
    previo = await findByClientRequestId(orgId, clientRequestId, supabase);
  } catch (err) {
    // Sin saber si ya se envió, no se envía (T-2): se reintenta la comprobación.
    throw new JobRetryableError(`idempotency_check_failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (previo) {
    log.info('whatsapp_scheduled_already_sent', { message_id: previo.id, client_request_id: clientRequestId });
    return { skipped: true, reason: 'already_sent', message_id: previo.id, conversation_id: previo.conversation_id };
  }
  // Segundo punto de decisión (T-1): el abort pudo llegar durante la consulta.
  if (signal.aborted) throw new JobRetryableError('aborted tras la comprobación de idempotencia');

  try {
    const r = await sendWhatsApp({ ...req, orgId, clientRequestId, scheduledAt: null, force: true }, supabase, supabase);
    log.info('whatsapp_scheduled_sent', { message_id: r.message_id, duplicate: r.duplicate === true });
    return { message_id: r.message_id, conversation_id: r.conversation_id, activity_id: r.activity_id, ...(r.duplicate ? { skipped: true, reason: 'already_sent' } : {}) };
  } catch (err) {
    if (err instanceof WhatsAppError) {
      if (err.code === 'PROVIDER' || err.code === 'INTERNAL' || err.code === 'DAILY_LIMIT' || err.code === 'OUTSIDE_HOURS') throw new JobRetryableError(`${err.code}: ${err.message}`, err.code === 'DAILY_LIMIT' ? 3600 : undefined);
      throw new JobFatalError(`${err.code}: ${err.message}`);
    }
    throw err;
  }
};
