/**
 * PUT /api/chat/ai/trabajos/[id]/valoracion — 👍/👎 de una respuesta de la IA
 * del Chat (Figma 93-chat-pendientes-03).
 * Body: `{ voto: 'util' }` o `{ voto: 'no_util', motivo, comentario? }`.
 *
 * - La organización sale de la sesión; otra en body o query → 403 (`readOrgBody`).
 * - Solo vota quien puede usar el Chat (`listarAgentesChat`, regla del servidor).
 * - El trabajo se lee con el cliente de la sesión (RLS) y además se exige que
 *   sea de la organización de la sesión.
 * - Un voto por persona y trabajo: votar otra vez lo reemplaza. Se escribe con
 *   el cliente de servicio (la tabla no tiene política de UPDATE), ya
 *   validados trabajo, organización y persona.
 */
import { NextResponse } from 'next/server';
import { withOrg, jsonError, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { listarAgentesChat } from '@/lib/services/chat/agentesChat.server';
import { leerValoracion, tipoFeedback } from '@/lib/services/chat/valoracionIa';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PUT = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = String(params.id ?? '');
  if (!UUID.test(id)) return jsonError(400, 'ID_INVALIDO', 'Trabajo inválido');
  const cuerpo = await readOrgBody<unknown>(ctx, req, { route: 'PUT /api/chat/ai/trabajos/[id]/valoracion' });
  const valoracion = leerValoracion(cuerpo);
  if (!valoracion) return jsonError(400, 'CUERPO_INVALIDO', "Indica voto 'util', o 'no_util' con un motivo válido");

  try {
    const yo = (await listarAgentesChat(ctx)).find((a) => a.esYo);
    if (!yo) throw new OrgContextError('No tienes acceso al Chat', 403, 'SIN_ACCESO_CHAT');

    const { data: trabajo, error: errTrabajo } = await ctx.supabase
      .from('ai_jobs')
      .select('id, result_message_id')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (errTrabajo) throw new Error(`No se pudo leer el trabajo: ${errTrabajo.message}`);
    if (!trabajo) return jsonError(404, 'NOT_FOUND', 'Trabajo no encontrado');

    const { error } = await getServiceClient()
      .from('ai_training_feedback')
      .upsert(
        {
          ai_job_id: trabajo.id,
          organization_id: ctx.organizationId,
          result_message_id: trabajo.result_message_id ?? null,
          feedback_type: tipoFeedback(valoracion.voto),
          motivo: valoracion.motivo,
          notes: valoracion.comentario,
          feedback_by_member_id: yo.memberId,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'ai_job_id,feedback_by_member_id' },
      );
    if (error) throw new Error(`No se pudo guardar la valoración: ${error.message}`);
    return NextResponse.json({ ok: true, voto: valoracion.voto });
  } catch (err) {
    if (err instanceof OrgContextError) return jsonError(err.statusCode, err.code ?? 'ERROR', err.message);
    throw err;
  }
});
