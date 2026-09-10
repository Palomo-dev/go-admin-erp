import { JobFatalError, JobRetryableError, type JobHandler } from '../types';
import { sendWhatsApp } from '@/lib/services/crm/whatsapp/outboundService';
import { WhatsAppError, type SendWhatsAppInput } from '@/lib/services/crm/whatsapp/types';

/**
 * Handler kind 'whatsapp' (FASE-16 §4.4): envío programado
 * `{ message_request: SendWhatsAppInput, customer_id }`.
 * WINDOW_CLOSED / OPTED_OUT / NOT_FOUND → JobFatalError (terminal);
 * PROVIDER / INTERNAL → JobRetryableError (backoff de fn_fail_job).
 */
export const whatsappJobHandler: JobHandler = async ({ job, supabase, orgId, log }) => {
  const req = job.payload?.message_request as SendWhatsAppInput | undefined;
  if (!req) throw new JobFatalError('payload.message_request requerido');
  if (Number(req.orgId) !== orgId) throw new JobFatalError('message_request.orgId no coincide con el job');
  try {
    const r = await sendWhatsApp({ ...req, orgId, scheduledAt: null, force: true }, supabase, supabase);
    log.info('whatsapp_scheduled_sent', { message_id: r.message_id });
    return { message_id: r.message_id, conversation_id: r.conversation_id, activity_id: r.activity_id };
  } catch (err) {
    if (err instanceof WhatsAppError) {
      if (err.code === 'PROVIDER' || err.code === 'INTERNAL' || err.code === 'DAILY_LIMIT' || err.code === 'OUTSIDE_HOURS') throw new JobRetryableError(`${err.code}: ${err.message}`, err.code === 'DAILY_LIMIT' ? 3600 : undefined);
      throw new JobFatalError(`${err.code}: ${err.message}`);
    }
    throw err;
  }
};
