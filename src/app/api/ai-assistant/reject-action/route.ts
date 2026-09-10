import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { checkRateLimit } from '@/lib/security/rateLimit';

/**
 * POST /api/ai-assistant/reject-action  →  { actionId }
 *
 * Marca una propuesta como rechazada.
 *
 * Antes, "Rechazar" solo hacía `setPendingAction(null)` en el navegador: la fila
 * seguía `pending` y ejecutable durante 30 minutos con solo reenviar el
 * `actionId` capturado de la pestaña Red. Además, la auditoría nunca registraba
 * que el usuario había dicho que no — y una acción contable rechazada es
 * información tan relevante como una ejecutada. Lo encontró el tester de F0
 * (fallo 6).
 *
 * Solo el autor puede rechazar (RLS de `ai_agent_actions` + comprobación
 * explícita), y solo desde un estado no terminal.
 */
export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  const rl = await checkRateLimit(`assistant:reject:${ctx.userId}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ success: false, code: 'RATE_LIMITED' }, { status: 429 });
  }

  try {
    const body = (await request.json()) as { actionId?: unknown };
    const actionId = typeof body.actionId === 'string' ? body.actionId : null;
    if (!actionId) {
      return NextResponse.json(
        { success: false, code: 'BAD_REQUEST', message: 'Falta el identificador de la acción' },
        { status: 400 }
      );
    }

    // El compare-and-set sobre el estado hace el trabajo: si ya se ejecutó, se
    // rechazó o caducó, no hay nada que rechazar y no se pisa el desenlace.
    const { data, error } = await ctx.supabase
      .from('ai_agent_actions')
      .update({
        status: 'rejected',
        error_code: 'rejected_by_user',
        error_message: 'El usuario canceló la acción',
      })
      .eq('id', actionId)
      .eq('organization_id', ctx.organizationId)
      .eq('user_id', ctx.userId)
      .in('status', ['pending', 'confirmed'])
      .select('id');

    if (error) throw new Error(error.message);

    // Sin filas afectadas no es un error para el usuario: puede que ya se
    // hubiera ejecutado o caducado. Cerrar la tarjeta es la respuesta correcta.
    return NextResponse.json({ success: true, rejected: (data?.length ?? 0) > 0 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error procesando la solicitud';
    console.error('Error rechazando acción del asistente:', message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
