import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getAssistantCapabilities } from '@/lib/ai/assistant/capabilities';
import { applyUndo } from '@/lib/ai/assistant/undoService';
import { checkRateLimit } from '@/lib/security/rateLimit';

/**
 * POST /api/ai-assistant/undo-action  →  { actionId }
 *
 * Fase 3. Desde F0 cada acción guardaba su `undo_payload` y nadie lo aplicaba;
 * este endpoint cierra ese círculo.
 *
 * Reglas:
 * - Solo el autor, dentro de su organización (RLS + comprobación explícita).
 * - Solo acciones `executed`: una fallida no dejó nada que deshacer.
 * - Solo dentro de la ventana `undo_window_minutes` (default 15). Revertir algo
 *   de hace tres horas, cuando el mundo ya cambió, hace más daño que bien.
 * - Idempotente: la transición `executed → undone` es un compare-and-set, así
 *   que dos clics deshacen una vez.
 */

interface ActionRow {
  id: string;
  organization_id: number;
  user_id: string;
  tool_name: string;
  status: string;
  undo_payload: { kind: string; payload: Record<string, unknown> } | null;
  executed_at: string | null;
}

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

  const rl = await checkRateLimit(`assistant:undo:${ctx.userId}`, { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, code: 'RATE_LIMITED', message: 'Demasiadas veces seguidas. Espera un momento.' },
      { status: 429 }
    );
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

    const { data, error } = await ctx.supabase
      .from('ai_agent_actions')
      .select('id, organization_id, user_id, tool_name, status, undo_payload, executed_at')
      .eq('id', actionId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json(
        { success: false, code: 'NOT_FOUND', message: 'Esa acción ya no está disponible' },
        { status: 404 }
      );
    }

    const action = data as unknown as ActionRow;

    // Defensa en profundidad: la RLS ya filtra, pero si alguien desactivara la
    // política esto sigue impidiendo deshacer lo de otro.
    if (action.organization_id !== ctx.organizationId || action.user_id !== ctx.userId) {
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', message: 'Esa acción no es tuya' },
        { status: 403 }
      );
    }

    if (action.status === 'undone') {
      return NextResponse.json({ success: true, alreadyUndone: true, message: 'Eso ya estaba deshecho.' });
    }
    if (action.status !== 'executed') {
      return NextResponse.json(
        { success: false, code: 'NOT_EXECUTED', message: 'Esa acción no llegó a ejecutarse, no hay nada que deshacer.' },
        { status: 409 }
      );
    }
    if (!action.undo_payload?.kind) {
      return NextResponse.json(
        {
          success: false,
          code: 'NOT_UNDOABLE',
          message: 'Esa acción no se puede deshacer desde el chat. Hazlo desde el módulo correspondiente.',
        },
        { status: 409 }
      );
    }

    // La ventana se lee de la configuración de la organización.
    const caps = await getAssistantCapabilities(ctx);
    const ejecutada = action.executed_at ? new Date(action.executed_at).getTime() : 0;
    const limite = ejecutada + caps.undoWindowMinutes * 60_000;
    if (Date.now() > limite) {
      return NextResponse.json(
        {
          success: false,
          code: 'WINDOW_CLOSED',
          message: `Ya pasaron más de ${caps.undoWindowMinutes} minutos: deshacerlo ahora podría pisar cambios posteriores. Hazlo desde el módulo.`,
        },
        { status: 409 }
      );
    }

    // Compare-and-set: dos clics deshacen una sola vez.
    const { data: claimed, error: claimError } = await ctx.supabase
      .from('ai_agent_actions')
      .update({ status: 'undone', undone_at: new Date().toISOString() })
      .eq('id', action.id)
      .eq('status', 'executed')
      .select('id');

    if (claimError) throw new Error(claimError.message);
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ success: true, alreadyUndone: true, message: 'Eso ya estaba deshecho.' });
    }

    const outcome = await applyUndo(
      { supabase: ctx.supabase, organizationId: ctx.organizationId, userId: ctx.userId },
      action.undo_payload
    );

    if (!outcome.ok) {
      // No se pudo revertir: la fila vuelve a `executed`, porque el cambio de
      // negocio SIGUE aplicado. Dejarla en `undone` sería mentir sobre el estado
      // del sistema, que es peor que el fallo en sí.
      await ctx.supabase
        .from('ai_agent_actions')
        .update({ status: 'executed', undone_at: null, error_code: outcome.errorCode ?? 'undo_failed', error_message: outcome.message })
        .eq('id', action.id);

      return NextResponse.json(
        { success: false, code: outcome.errorCode ?? 'UNDO_FAILED', message: outcome.message },
        { status: 409 }
      );
    }

    await ctx.supabase.from('activities').insert({
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      activity_type: 'note',
      notes: `GO Assistant: deshizo "${action.tool_name}". ${outcome.message}`,
      occurred_at: new Date().toISOString(),
      metadata: { source: 'go_assistant', action_id: action.id, tool_name: action.tool_name, undo: true },
    });

    return NextResponse.json({ success: true, message: outcome.message });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error procesando la solicitud';
    console.error('Error deshaciendo acción del asistente:', message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
