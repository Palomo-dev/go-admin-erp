/** Reanuda el mismo mensaje: el claim privado de Edge evita una segunda publicación. */
import { cargarSecretoInterno } from '../../../../supabase/functions/_shared/contacto/puerta';
import { JobFatalError, JobRetryableError, type JobHandler } from '../types';

export const whatsappDispatchHandler: JobHandler = async ({ job, supabase, orgId, signal, log }) => {
  const id = job.payload.dispatch_message_id;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new JobFatalError('dispatch_message_id inválido');
  if (signal.aborted) throw new JobRetryableError('aborted antes de reanudar el mensaje');
  const { data: message, error } = await supabase.from('messages').select('id, organization_id, conversation_id')
    .eq('organization_id', orgId).eq('id', id).maybeSingle();
  if (error) throw new JobRetryableError('No se pudo consultar el mensaje propio');
  if (!message || message.organization_id !== orgId) throw new JobFatalError('Mensaje no encontrado en la organización');
  const secret = await cargarSecretoInterno(supabase, process.env.AI_INTERNAL_SECRET);
  if (!secret) throw new JobRetryableError('Secreto interno no disponible');
  if (signal.aborted) throw new JobRetryableError('aborted antes del despacho');
  const result = await supabase.functions.invoke('channel-dispatch', {
    body: { messageId: id, organizationId: orgId, conversationId: message.conversation_id },
    headers: { 'x-internal-secret': secret },
  });
  if (result.error) throw new JobRetryableError('No se pudo completar el consumidor de despacho');
  if (!result.data || typeof result.data !== 'object') throw new JobRetryableError('Consumidor sin resultado válido');
  log.info('whatsapp_dispatch_resumed', { message_id: id, deferred: result.data.deferred === true, uncertain: result.data.pendingReconciliation === true });
  return { ...result.data, message_id: id };
};
