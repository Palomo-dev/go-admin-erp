/**
 * Bloquear / desbloquear el contacto de una conversación, en el servidor
 * (reglas duras 5 y 6). Exige que quien pide pueda usar el Chat (la MISMA
 * regla de `listarAgentesChat` que usa la asignación) y que la conversación
 * sea de la organización de la sesión.
 *
 * La fila se escribe con el cliente de servicio porque `authenticated` no
 * tiene insert/update en `chat_contactos_bloqueados` (así nadie lo cambia
 * saltándose esta ruta); siempre con la organización y el cliente ya
 * validados con el cliente de la sesión. El cambio queda en
 * `chat_audit_logs` (entity_type 'conversation'), que leen Actividad y
 * Auditoría del Chat.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { listarAgentesChat } from './agentesChat.server';
import { COLUMNAS_BLOQUEO, type BloqueoContacto } from './bloqueoContacto';

type Ctx = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'supabase'>;

/** Acciones que quedan en `chat_audit_logs`. */
export const ACCION_AUDITORIA_BLOQUEO = { bloquear: 'block_contact', desbloquear: 'unblock_contact' } as const;

async function vigente(organizationId: number, customerId: string): Promise<BloqueoContacto | null> {
  const { data, error } = await getServiceClient()
    .from('chat_contactos_bloqueados')
    .select(COLUMNAS_BLOQUEO)
    .eq('organization_id', organizationId)
    .eq('customer_id', customerId)
    .is('desbloqueado_en', null)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer el bloqueo: ${error.message}`);
  return (data as BloqueoContacto | null) ?? null;
}

async function auditar(ctx: Ctx, accion: string, conversationId: string, customerId: string, memberId: number): Promise<void> {
  const { error } = await getServiceClient().from('chat_audit_logs').insert({
    organization_id: ctx.organizationId,
    actor_type: 'member',
    actor_id: ctx.userId,
    action: accion,
    entity_type: 'conversation',
    entity_id: conversationId,
    changes: { customer_id: customerId },
    metadata: { member_id: memberId },
    event_time: new Date().toISOString(),
  });
  // La auditoría no deshace el bloqueo: se registra el fallo y sigue.
  if (error) console.warn('[bloqueoContacto] no se registró en chat_audit_logs', { accion, mensaje: error.message });
}

/**
 * Bloquea (`bloquear = true`) o desbloquea el contacto de la conversación.
 * Idempotente: bloquear lo ya bloqueado devuelve el bloqueo vigente sin
 * duplicarlo; desbloquear sin bloqueo devuelve `null`.
 */
export async function cambiarBloqueoContacto(ctx: Ctx, conversationId: string, bloquear: boolean): Promise<{ bloqueo: BloqueoContacto | null }> {
  const agentes = await listarAgentesChat(ctx);
  const yo = agentes.find((a) => a.esYo);
  if (!yo) throw new OrgContextError('No tienes acceso al Chat', 403, 'SIN_ACCESO_CHAT');

  const { data: conv, error: errConv } = await ctx.supabase
    .from('conversations')
    .select('id, customer_id')
    .eq('id', conversationId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (errConv) throw new Error(`No se pudo leer la conversación: ${errConv.message}`);
  if (!conv?.customer_id) throw new OrgContextError('Conversación no encontrada', 404, 'NOT_FOUND');
  const customerId = String(conv.customer_id);

  const actual = await vigente(ctx.organizationId, customerId);
  const db = getServiceClient();

  if (bloquear) {
    if (actual) return { bloqueo: actual };
    const { data, error } = await db
      .from('chat_contactos_bloqueados')
      .insert({
        organization_id: ctx.organizationId,
        customer_id: customerId,
        conversation_id: conversationId,
        bloqueado_por_member_id: yo.memberId,
      })
      .select(COLUMNAS_BLOQUEO)
      .single();
    if (error) {
      // Dos personas a la vez: el índice único parcial deja pasar a una sola.
      if (error.code === '23505') return { bloqueo: await vigente(ctx.organizationId, customerId) };
      throw new Error(`No se pudo bloquear el contacto: ${error.message}`);
    }
    await auditar(ctx, ACCION_AUDITORIA_BLOQUEO.bloquear, conversationId, customerId, yo.memberId);
    return { bloqueo: data as BloqueoContacto };
  }

  if (!actual) return { bloqueo: null };
  const { error } = await db
    .from('chat_contactos_bloqueados')
    .update({ desbloqueado_en: new Date().toISOString(), desbloqueado_por_member_id: yo.memberId })
    .eq('id', actual.id)
    .eq('organization_id', ctx.organizationId)
    .is('desbloqueado_en', null);
  if (error) throw new Error(`No se pudo desbloquear el contacto: ${error.message}`);
  await auditar(ctx, ACCION_AUDITORIA_BLOQUEO.desbloquear, conversationId, customerId, yo.memberId);
  return { bloqueo: null };
}
