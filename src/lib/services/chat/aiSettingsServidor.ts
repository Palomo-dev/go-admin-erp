/**
 * Escritura de la configuración del chat IA (`ai_settings`) desde el servidor.
 *
 * Antes la escribía el navegador con el cliente anon y RLS de «miembro activo»:
 * cualquier miembro podía cambiar el modelo, el prompt o encender la IA. Ahora
 * pasa por `PATCH /api/chat/ai/settings` (organización de la sesión, permiso
 * `admin.full_access` resuelto en el servidor) y la base lo vuelve a exigir
 * (migración 20261008005828_ai_settings_escritura_solo_admin).
 *
 * Solo columnas de comportamiento: los créditos (`credits_remaining`,
 * `purchased_credits`, `credits_reset_at`) los mueven únicamente las funciones
 * de cobro y el webhook de pagos. Los límites del zod son los CHECK reales de
 * la tabla (verificados por MCP el 2026-10-08).
 */
import { z } from 'zod';
import type { ServerOrgContext } from '@/lib/utils/orgContext';

export const PERMISO_CONFIGURAR_IA_CHAT = 'admin.full_access';

export const cambiosAjustesIaSchema = z
  .object({
    provider: z.enum(['openai', 'anthropic', 'custom']),
    model: z.string().trim().min(1).max(120),
    temperature: z.number().min(0).max(2),
    max_tokens: z.number().int().min(1).max(32000),
    system_rules: z.string().max(8000).nullable(),
    tone: z.enum(['professional', 'friendly', 'casual', 'formal']),
    language: z.string().trim().min(2).max(10),
    fallback_message: z.string().trim().max(1000),
    auto_response_enabled: z.boolean(),
    auto_response_delay_seconds: z.number().int().min(0).max(3600),
    confidence_threshold: z.number().min(0).max(1),
    max_fragments_context: z.number().int().min(1).max(50),
    is_active: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'No hay cambios' });

export type CambiosAjustesIa = z.infer<typeof cambiosAjustesIaSchema>;

type Contexto = Pick<ServerOrgContext, 'organizationId' | 'supabase'>;

export class ErrorAjustesIa extends Error {
  constructor(message: string, readonly statusCode = 500) {
    super(message);
    this.name = 'ErrorAjustesIa';
  }
}

/** Crea la fila si no existe (solo con estas columnas) o actualiza la existente. Devuelve la fila. */
export async function guardarAjustesIa(ctx: Contexto, cambios: CambiosAjustesIa): Promise<Record<string, unknown>> {
  const sb = ctx.supabase;
  const { data: anterior, error: errLectura } = await sb
    .from('ai_settings')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (errLectura) throw new ErrorAjustesIa(`No se pudo leer la configuración: ${errLectura.message}`);

  const escritura = anterior
    ? sb.from('ai_settings').update({ ...cambios, updated_at: new Date().toISOString() }).eq('organization_id', ctx.organizationId).select('*').maybeSingle()
    : sb.from('ai_settings').insert({ organization_id: ctx.organizationId, ...cambios }).select('*').maybeSingle();
  const { data, error } = await escritura;
  // Con la política restrictiva, un UPDATE sin permiso no da error: no ve la fila.
  if (error) throw new ErrorAjustesIa(`No se pudo guardar la configuración: ${error.message}`, error.code === '42501' ? 403 : 500);
  if (!data) throw new ErrorAjustesIa('Sin permiso para cambiar la configuración de la IA', 403);

  const { error: errAuditoria } = await sb.from('chat_audit_logs').insert({
    organization_id: ctx.organizationId,
    actor_type: 'member',
    actor_id: null,
    action: anterior ? 'update_ai_settings' : 'create_ai_settings',
    entity_type: 'ai_settings',
    entity_id: null,
    changes: anterior ? { previous: anterior, updated: cambios } : { settings: cambios },
    metadata: {},
  });
  if (errAuditoria) console.warn('[aiSettingsServidor] auditoría no registrada', { organizationId: ctx.organizationId, message: errAuditoria.message });

  return data as Record<string, unknown>;
}
