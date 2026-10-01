/**
 * POST /api/crm/voice-agents/[id]/dispatch — lanza una llamada del agente IA.
 *
 * Body: { opportunity_id?: string, customer_id?: string, dial_now?: boolean }
 *
 * La organización sale de la sesión. La configuración de la ETAPA del embudo se
 * resuelve en el servidor y viaja en `voice_agent_calls.stage_agent_id`, de modo
 * que gobierna el guion real de la llamada.
 * Respeta la baja voluntaria (`fn_can_contact`) antes de marcar.
 *
 * Lanzar llamadas exige administración o el permiso canónico de campañas
 * y pasa por las mismas barreras que la cola de campañas (canal habilitado, agente
 * activo, franja horaria, tope diario/horario contra el libro de intentos,
 * concurrencia y deduplicación por cliente). Antes bastaba una sesión de miembro y
 * N peticiones producían N llamadas al mismo cliente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, requireOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { dispatchAgentCall, VoiceDispatchBlocked } from '@/lib/services/crm/voiceAgentService';
import { getServiceClient } from '@/lib/supabase/server-service';
import { CRM_PERMISOS, CrmHttpError, exigirUuid, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { z } from 'zod';

export const runtime = 'nodejs';
const bodySchema = z.object({
  opportunity_id: z.string().uuid().nullable().optional(), customer_id: z.string().uuid().nullable().optional(), dial_now: z.boolean().optional(),
}).strict().refine((body) => Boolean(body.opportunity_id || body.customer_id));

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext(request);
    await requireOrgAdminOrPermission(ctx, CRM_PERMISOS.campanasGestionar);
    const { id } = await params;
    const voiceAgentId = exigirUuid(id, 'Agente');
    const parsed = bodySchema.safeParse(readOrgBody(ctx, await request.json().catch(() => ({})), { request }));
    if (!parsed.success) throw new CrmHttpError(400, 'datos_invalidos', 'Selecciona un cliente o una oportunidad válida.');
    const body = parsed.data;

    const result = await dispatchAgentCall(ctx.organizationId, getServiceClient(), {
      voiceAgentId,
      opportunityId: body.opportunity_id ?? null,
      customerId: body.customer_id ?? null,
      dialNow: body.dial_now !== false,
    });

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error) {
    if (error instanceof VoiceDispatchBlocked) {
      // 429 para los topes (el cliente puede reintentar más tarde), 409 para el resto.
      const isRate = ['daily_cap', 'hourly_cap', 'customer_cap', 'concurrency'].includes(error.reason);
      return NextResponse.json(
        { success: false, error: error.message, reason: error.reason },
        { status: isRate ? 429 : 409 }
      );
    }
    return respuestaErrorCrm(error, 'voice-agents.dispatch');
  }
}
