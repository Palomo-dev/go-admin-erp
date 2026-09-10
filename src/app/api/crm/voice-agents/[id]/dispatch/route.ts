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
 * F-NEW-5 (ronda 2): lanzar llamadas exige rol de administrador de la organización
 * y pasa por las mismas barreras que la cola de campañas (canal habilitado, agente
 * activo, franja horaria, tope diario/horario contra el libro de intentos,
 * concurrencia y deduplicación por cliente). Antes bastaba una sesión de miembro y
 * N peticiones producían N llamadas al mismo cliente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdmin } from '@/lib/utils/orgContext';
import { dispatchAgentCall, VoiceDispatchBlocked } from '@/lib/services/crm/voiceAgentService';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    requireOrgAdmin(ctx);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    if (!body?.opportunity_id && !body?.customer_id) {
      return NextResponse.json(
        { success: false, error: 'Se requiere opportunity_id o customer_id' },
        { status: 400 }
      );
    }

    const result = await dispatchAgentCall(ctx.organizationId, ctx.supabase, {
      voiceAgentId: id,
      opportunityId: body.opportunity_id ?? null,
      customerId: body.customer_id ?? null,
      dialNow: body.dial_now !== false,
    });

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    if (error instanceof VoiceDispatchBlocked) {
      // 429 para los topes (el cliente puede reintentar más tarde), 409 para el resto.
      const isRate = ['daily_cap', 'hourly_cap', 'customer_cap', 'concurrency'].includes(error.reason);
      return NextResponse.json(
        { success: false, error: error.message, reason: error.reason },
        { status: isRate ? 429 : 409 }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    const isBusiness = /no encontrad|desactivad|do_not_call|Se requiere/i.test(message);
    console.error('[voice-agents/dispatch]', message);
    return NextResponse.json({ success: false, error: message }, { status: isBusiness ? 400 : 500 });
  }
}
