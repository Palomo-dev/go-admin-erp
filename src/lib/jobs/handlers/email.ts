import { JobFatalError, JobRetryableError, type JobHandler } from '../types';
import { dispatchScheduledEmail } from '@/lib/services/crm/email/sendService';
import { sendPendingBatch } from '@/lib/services/crm/email/batchService';
import { ingestReceivedEmail } from '@/lib/services/crm/email/inboundService';
import { isEmailError } from '@/lib/services/crm/email/types';

/**
 * Handler kind 'email' (FASE-07 §4.4):
 *   { email_message_id }                        → envío programado (>1 h)
 *   { batch: true, email_message_ids: [≤100] }  → lote de campaña (sin adjuntos)
 *   { inbound: true, resend_email_id, to[] }    → reintento de ingestión inbound
 * 429/5xx del proveedor → JobRetryableError (backoff de fn_fail_job);
 * 4xx definitivos → JobFatalError.
 */
export const emailJobHandler: JobHandler = async ({ job, supabase, orgId, log }) => {
  const p = job.payload ?? {};
  try {
    if (p.batch === true) {
      const ids = Array.isArray(p.email_message_ids) ? (p.email_message_ids as string[]) : [];
      const r = await sendPendingBatch(orgId, ids, supabase);
      // `sendPendingBatch` ya no lanza a mitad de lote: devuelve SIEMPRE el
      // resultado parcial (tester r2 #3). Se registra antes de decidir el
      // reintento para que el resultado no se pierda con la excepción.
      log.info('email_batch', { sent: r.sent.length, failed: r.failed.length, skipped: r.skipped.length });
      const retryable = r.failed.filter((f) => f.retryable);
      if (retryable.length > 0) {
        // Esas filas siguen en `pending`; el reintento del job las recoge y
        // salta las ya enviadas (`status_sent` → skipped), así que es idempotente.
        throw new JobRetryableError(`lote parcial: ${r.sent.length} enviados, ${retryable.length} pendientes de reintento (${retryable[0].error})`);
      }
      return { sent: r.sent.length, failed: r.failed, skipped: r.skipped };
    }
    if (p.inbound === true) {
      const r = await ingestReceivedEmail(String(p.resend_email_id ?? ''), (p.to as string[]) ?? [], supabase);
      if (!r.email_message_id && r.reason?.startsWith('provider:')) throw new JobRetryableError(r.reason);
      return { email_message_id: r.email_message_id, reason: r.reason, skipped: !r.email_message_id };
    }
    const id = String(p.email_message_id ?? '');
    if (!id) throw new JobFatalError('payload.email_message_id requerido');
    const r = await dispatchScheduledEmail(id, supabase);
    if (!r.sent) return { skipped: true, reason: r.reason };
    return { sent: true, email_message_id: id };
  } catch (err) {
    if (err instanceof JobFatalError || err instanceof JobRetryableError) throw err;
    if (isEmailError(err)) {
      if (err.code === 'PROVIDER') throw new JobRetryableError(err.message);
      throw new JobFatalError(`${err.code}: ${err.message}`);
    }
    throw err;
  }
};
