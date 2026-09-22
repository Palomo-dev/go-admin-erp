import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash } from 'crypto';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getAssistantCapabilities } from '@/lib/ai/assistant/capabilities';
import { resolveOrgCurrency } from '@/lib/ai/assistant/orgCurrency';
import { getTool, evaluateTool } from '@/lib/ai/agent/toolRegistry';
import type { ToolContext, ToolResult } from '@/lib/ai/agent/types';
import { checkRateLimit } from '@/lib/security/rateLimit';

/**
 * `external`: el usuario abrió el formulario REAL del módulo (p. ej. el de
 * clientes) desde la tarjeta y guardó allí. El módulo ya escribió con la
 * sesión del usuario y su RLS; aquí solo se cierra la propuesta con la entidad
 * resultante, tras comprobar que existe en la organización. Nada más se acepta:
 * corregir sigue requiriendo una propuesta nueva.
 */
const confirmation = z.object({
  actionId: z.string().uuid(),
  external: z.object({ entityType: z.literal('customer'), entityId: z.string().uuid() }).strict().optional(),
}).strict();

/** Qué herramienta puede cerrarse con qué entidad externa. */
const EXTERNAL_ALLOWED: Record<string, string> = { create_customer: 'customer' };

interface ActionRow {
  id: string;
  organization_id: number;
  user_id: string;
  branch_id: number | null;
  conversation_id: string | null;
  tool_name: string;
  risk: string;
  args: Record<string, unknown>;
  status: string;
  result: Record<string, unknown> | null;
  expires_at: string;
  executed_at: string | null;
  created_at: string;
}

const reply = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Solo acepta { actionId }. Corregir requiere una NUEVA propuesta.
 * Service role se limita al almacén de acciones, siempre acotado por sesión;
 * negocio, moneda, permisos y auditoría siguen usando el cliente con RLS.
 */
export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (error) {
    if (error instanceof OrgContextError) {
      return reply({ success: false, error: error.message, code: error.code }, error.statusCode);
    }
    throw error;
  }

  const rl = await checkRateLimit(`assistant:exec:${ctx.organizationId}:${ctx.userId}`, { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return reply({ success: false, code: 'RATE_LIMITED', message: 'Demasiadas acciones seguidas. Espera un momento.' }, 429);

  try {
    const body: unknown = await readOrgBody(ctx, request);
    const parsedBody = confirmation.safeParse(body);
    if (!parsedBody.success) {
      return reply({ success: false, code: 'BAD_REQUEST', message: 'Envía únicamente actionId con un UUID válido. Las correcciones requieren una nueva propuesta.' }, 400);
    }
    const actionId = parsedBody.data.actionId;
    const external = parsedBody.data.external;
    const actionStore = getServiceClient();
    const { data, error } = await actionStore.from('ai_agent_actions')
      .select('id, organization_id, user_id, branch_id, conversation_id, tool_name, risk, args, status, result, expires_at, executed_at, created_at')
      .eq('id', actionId).eq('organization_id', ctx.organizationId).eq('user_id', ctx.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return reply({ success: false, code: 'NOT_FOUND', message: 'Esa acción ya no está disponible.' }, 404);
    const action = data as ActionRow;
    // Defensa adicional ante errores de consulta o cambios futuros del almacén.
    if (action.organization_id !== ctx.organizationId || action.user_id !== ctx.userId) {
      console.warn('[GO Assistant] Acción ajena rechazada', { actionId, organizationId: ctx.organizationId, userId: ctx.userId });
      return reply({ success: false, code: 'FORBIDDEN', message: 'Esa acción no es tuya.' }, 403);
    }
    const updateAction = (patch: Record<string, unknown>) => actionStore.from('ai_agent_actions')
      .update(patch).eq('id', actionId).eq('organization_id', ctx.organizationId).eq('user_id', ctx.userId);

    // UUID estable + ON CONFLICT DO NOTHING: reintentos/concurrencia no duplican
    // el desenlace y no requieren UPDATE sobre mensajes. Solo cliente de sesión.
    const persistResult = async (result: Record<string, unknown>): Promise<boolean> => {
      if (!action.conversation_id) return false;
      try {
        const conversation = await ctx.supabase.from('ai_assistant_conversations').select('id')
          .eq('id', action.conversation_id).eq('organization_id', ctx.organizationId).eq('user_id', ctx.userId).maybeSingle();
        if (conversation.error || !conversation.data) return false;
        const hash = createHash('sha256').update('go-assistant:result:' + actionId).digest('hex');
        const messageId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
        const message = typeof result.message === 'string' ? result.message : 'Acción procesada';
        const saved = await ctx.supabase.from('ai_assistant_messages').upsert({
          id: messageId, organization_id: ctx.organizationId, conversation_id: action.conversation_id,
          role: 'assistant', action_id: actionId,
          content: `${result.success ? 'Acción completada' : 'La acción no se completó'}: ${message}`,
          content_json: { kind: 'action_result', result },
          created_at: action.executed_at ?? new Date().toISOString(),
        }, { onConflict: 'id', ignoreDuplicates: true });
        if (saved.error) throw saved.error;
        return true;
      } catch (historyError) {
        console.error('[GO Assistant] Resultado pendiente de guardar en el hilo', { actionId, error: historyError });
        return false;
      }
    };

    if (action.status === 'executed') {
      const historySaved = await persistResult(action.result ?? {});
      return reply({ ...action.result, actionId, alreadyExecuted: true, historySaved });
    }
    // No reabrir una ejecución incierta: podría haber escrito antes de un timeout.
    if (action.status === 'executing') {
      return reply({ success: false, code: 'IN_PROGRESS', message: 'La acción está en ejecución o pendiente de conciliación. No la repitas.' }, 409);
    }
    if (!['pending', 'confirmed'].includes(action.status)) {
      if (action.status === 'failed' && action.result) await persistResult(action.result);
      return reply({ success: false, code: 'INVALID_STATE', message: 'Esa acción ya no se puede ejecutar.' }, 409);
    }
    const expiresAt = Date.parse(action.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      const expired = await updateAction({ status: 'expired' }).in('status', ['pending', 'confirmed']);
      if (expired.error) throw expired.error;
      return reply({ success: false, code: 'EXPIRED', message: 'La propuesta caducó. Pídeme un resumen nuevo antes de confirmar.' }, 409);
    }

    const tool = getTool(action.tool_name);
    if (!tool || tool.risk === 'low' || tool.risk !== action.risk) {
      return reply({ success: false, code: 'UNKNOWN_ACTION', message: 'La herramienta ya no corresponde a esta propuesta. Solicita una nueva.' }, 400);
    }
    // Cierre externo: la escritura ya la hizo el módulo con la sesión del usuario.
    if (external) {
      if (EXTERNAL_ALLOWED[tool.name] !== external.entityType) {
        return reply({ success: false, code: 'BAD_REQUEST', message: 'Esa propuesta no se cierra desde un formulario.' }, 400);
      }
      const { data: entity } = await ctx.supabase.from('customers').select('id, full_name, created_at')
        .eq('id', external.entityId).eq('organization_id', ctx.organizationId).maybeSingle();
      const found = entity as { id: string; full_name: string | null; created_at: string | null } | null;
      if (!found) return reply({ success: false, code: 'NOT_FOUND', message: 'No encuentro el cliente que dices haber creado.' }, 404);
      // Solo un cliente creado DESPUÉS de la propuesta puede cerrarla: si no, «Deshacer»
      // (delete_customer) podría borrar un cliente preexistente que el asistente nunca creó.
      if (!found.created_at || Date.parse(found.created_at) < Date.parse(action.created_at)) {
        return reply({ success: false, code: 'NOT_FOUND', message: 'Ese cliente ya existía antes de la propuesta; no puedo cerrarla con él.' }, 404);
      }

      const { data: claimed, error: claimError } = await updateAction({ status: 'executing', confirmed_at: new Date().toISOString() })
        .in('status', ['pending', 'confirmed']).select('id');
      if (claimError) throw claimError;
      if (!claimed?.length) return reply({ success: false, code: 'IN_PROGRESS', message: 'Otra solicitud ya tomó esta acción.' }, 409);

      const result = {
        success: true, message: `Cliente "${found.full_name ?? ''}" creado desde el formulario.`,
        entity: { type: 'customer', id: found.id }, actionId, undoAvailable: true,
      };
      const closed = await updateAction({
        status: 'executed', result, undo_payload: { kind: 'delete_customer', payload: { customer_id: found.id } },
        entity_type: 'customer', entity_id: found.id, executed_at: new Date().toISOString(),
      }).eq('status', 'executing');
      if (closed.error) console.error('[GO Assistant] Resultado pendiente de conciliación', { actionId, error: closed.error });
      try {
        await ctx.supabase.from('activities').insert({
          organization_id: ctx.organizationId, user_id: ctx.userId, activity_type: 'note',
          notes: `GO Assistant: ${result.message}`, occurred_at: new Date().toISOString(),
          metadata: { source: 'go_assistant', action_id: actionId, tool_name: tool.name, entity_type: 'customer', entity_id: found.id, via: 'module_form' },
        });
      } catch (auditError) {
        console.error('[GO Assistant] Auditoría pendiente', { actionId, error: auditError });
      }
      return reply({ ...result, historySaved: await persistResult(result) });
    }

    const caps = await getAssistantCapabilities(ctx);
    const decision = evaluateTool(caps, tool, 'text');
    if (!decision.allowed) {
      const message = 'Tu acceso actual no permite esta operación. Revisa permisos, módulos y configuración del asistente.';
      const rejected = await updateAction({ status: 'rejected', error_code: decision.reason, error_message: message }).in('status', ['pending', 'confirmed']);
      if (rejected.error) throw rejected.error;
      return reply({ success: false, code: decision.reason, message }, 403);
    }
    const args = tool.parseArgs(action.args);
    if (args === null) {
      return reply({ success: false, code: 'INVALID_ARGS', message: 'Los datos de la propuesta no son válidos. Solicita un resumen nuevo.' }, 400);
    }
    const currency = await resolveOrgCurrency(ctx.supabase, ctx.organizationId);
    const toolCtx: ToolContext = {
      organizationId: ctx.organizationId, userId: ctx.userId, supabase: ctx.supabase,
      branchId: action.branch_id ?? null, conversationId: action.conversation_id ?? null,
      capabilities: caps, locale: 'es-CO', currency: currency.code, channel: 'text',
    };
    const { data: claimed, error: claimError } = await updateAction({
      status: 'executing', confirmed_at: new Date().toISOString(),
    }).in('status', ['pending', 'confirmed']).select('id');
    if (claimError) throw claimError;
    if (!claimed?.length) return reply({ success: false, code: 'IN_PROGRESS', message: 'Otra solicitud ya tomó esta acción.' }, 409);

    let outcome: ToolResult;
    try {
      outcome = await tool.execute(toolCtx, args);
    } catch (executionError) {
      console.error('[GO Assistant] Herramienta fallida', { actionId, tool: tool.name, error: executionError });
      const result = { success: false, code: 'EXECUTION_ERROR', message: 'No pude completar la acción. Revisa su estado antes de intentarlo otra vez.' };
      const failed = await updateAction({
        status: 'failed', error_code: 'unexpected_error', error_message: 'Fallo al ejecutar la herramienta',
        executed_at: new Date().toISOString(), result,
      }).eq('status', 'executing');
      if (failed.error) console.error('[GO Assistant] No se pudo cerrar la acción fallida', { actionId, error: failed.error });
      return reply({ ...result, historySaved: await persistResult(result) }, 500);
    }
    const result = {
      success: outcome.ok, message: outcome.message, code: outcome.errorCode,
      entity: outcome.entity, data: outcome.data, actionId, undoAvailable: Boolean(outcome.undo),
    };
    const closed = await updateAction({
      status: outcome.ok ? 'executed' : 'failed', result,
      error_code: outcome.ok ? null : outcome.errorCode ?? 'execution_error',
      error_message: outcome.ok ? null : outcome.message, undo_payload: outcome.undo ?? null,
      entity_type: outcome.entity?.type ?? null, entity_id: outcome.entity ? String(outcome.entity.id) : null,
      executed_at: new Date().toISOString(),
    }).eq('status', 'executing');
    if (closed.error) console.error('[GO Assistant] Resultado pendiente de conciliación', { actionId, error: closed.error });

    if (outcome.ok) {
      // Un fallo de auditoría no debe convertir en fallo una escritura ya completada.
      try {
        const reason = typeof action.args.reason === 'string' ? action.args.reason : null;
        const audit = await ctx.supabase.from('activities').insert({
          organization_id: ctx.organizationId, user_id: ctx.userId, activity_type: 'note',
          notes: `GO Assistant: ${outcome.message}${reason ? '. Motivo: ' + reason : ''}`,
          occurred_at: new Date().toISOString(),
          metadata: { source: 'go_assistant', action_id: actionId, tool_name: tool.name, reason,
            entity_type: outcome.entity?.type ?? null, entity_id: outcome.entity ? String(outcome.entity.id) : null },
        });
        if (audit.error) console.error('[GO Assistant] Auditoría pendiente', { actionId, error: audit.error });
      } catch (auditError) {
        console.error('[GO Assistant] Auditoría pendiente', { actionId, error: auditError });
      }
    }
    return reply({ ...result, historySaved: await persistResult(result) });
  } catch (error) {
    if (error instanceof OrgContextError) return reply({ success: false, error: error.message, code: error.code }, error.statusCode);
    if (error instanceof SyntaxError) return reply({ success: false, code: 'BAD_REQUEST', message: 'JSON inválido.' }, 400);
    console.error('[GO Assistant] No se pudo confirmar la acción', error);
    return reply({ success: false, code: 'EXECUTION_ERROR', message: 'No pude completar la confirmación. Revisa el estado antes de reintentar.' }, 500);
  }
}
