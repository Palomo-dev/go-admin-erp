import { NextRequest, NextResponse } from 'next/server';
import { aiActionsService } from '@/lib/services/aiActionsService';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getAssistantCapabilities } from '@/lib/ai/assistant/capabilities';
import { evaluateAction } from '@/lib/ai/assistant/actionGuard';
import { isActionType, sanitizeActionFields, type AIActionType } from '@/lib/ai/assistant/actionCatalog';
import { checkRateLimit } from '@/lib/security/rateLimit';

/**
 * POST /api/ai-assistant/execute-action
 *
 * Este endpoint era el agujero C1 del plan: no llamaba a `getServerOrgContext`
 * y tomaba del body la organización a la que escribir (`action.organizationId`),
 * el rol con el que autorizarse (`action.userRole`) y hasta si la acción ya
 * estaba confirmada (`action.status`). Un POST sin sesión escribía en la base de
 * cualquier tenant.
 *
 * Contrato nuevo:
 *
 *   { actionId: uuid, fields?: [{ name, value }] }
 *
 * - `actionId` referencia una fila de `ai_agent_actions` creada por el servidor
 *   en `/chat`. Los argumentos, el tipo, la organización y el autor salen de esa
 *   fila; el cliente no puede alterarlos entre la propuesta y la confirmación.
 * - `fields` son las correcciones que el usuario hizo en la tarjeta. Se filtran
 *   contra el esquema de la acción (lista blanca) y se persisten antes de
 *   ejecutar, para que quede auditado qué se ejecutó realmente.
 * - RLS restringe la fila a su autor dentro de su organización; además se
 *   comprueba explícitamente por si alguien desactivara la política.
 * - La transición `pending → executing` es un compare-and-set: dos clics
 *   simultáneos producen una sola escritura (§5.8).
 */

interface ActionRow {
  id: string;
  organization_id: number;
  user_id: string;
  tool_name: string;
  risk: string;
  args: Record<string, unknown>;
  status: string;
  result: unknown;
  expires_at: string;
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

  const rl = await checkRateLimit(`assistant:exec:${ctx.userId}`, { limit: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, code: 'RATE_LIMITED', message: 'Demasiadas acciones seguidas. Espera un momento.' },
      { status: 429 }
    );
  }

  try {
    const body = (await request.json()) as { actionId?: unknown; fields?: unknown };
    const actionId = typeof body.actionId === 'string' ? body.actionId : null;

    if (!actionId) {
      return NextResponse.json(
        { success: false, code: 'BAD_REQUEST', message: 'Falta el identificador de la acción' },
        { status: 400 }
      );
    }

    const { data, error } = await ctx.supabase
      .from('ai_agent_actions')
      .select('id, organization_id, user_id, tool_name, risk, args, status, result, expires_at')
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

    // Defensa en profundidad: RLS ya filtra, pero si alguien desactivara la
    // política esto sigue impidiendo el cruce de organizaciones.
    if (action.organization_id !== ctx.organizationId || action.user_id !== ctx.userId) {
      console.warn('[GO Assistant] Intento de ejecutar una acción ajena', {
        actionId,
        actionOrg: action.organization_id,
        sessionOrg: ctx.organizationId,
      });
      return NextResponse.json(
        { success: false, code: 'FORBIDDEN', message: 'Esa acción no es tuya' },
        { status: 403 }
      );
    }

    // Idempotencia: si ya se ejecutó, se devuelve el mismo resultado en vez de
    // volver a escribir (§5.8). Va primero: un resultado ya escrito sigue siendo
    // válido aunque la propuesta haya caducado después.
    if (action.status === 'executed') {
      return NextResponse.json({ ...(action.result as object), alreadyExecuted: true });
    }

    const expired = new Date(action.expires_at).getTime() < Date.now();

    // La caducidad se comprueba ANTES que el estado `executing`. Si no, una fila
    // que quedó a medias (el proceso murió tras el claim: timeout de la función,
    // despliegue) devolvía 409 "ya se está ejecutando" para siempre, sin forma
    // de reintentar. Lo señaló el tester de F0 (fallo 12). El `pg_cron` que las
    // barre es de F1; esto al menos las desatasca al siguiente intento.
    if (expired) {
      await ctx.supabase
        .from('ai_agent_actions')
        .update({ status: 'expired' })
        .eq('id', action.id)
        .in('status', ['pending', 'confirmed', 'executing']);
      return NextResponse.json(
        {
          success: false,
          code: 'EXPIRED',
          message:
            action.status === 'executing'
              ? 'Esa acción se quedó a medias y ya caducó. Pídemela otra vez y la preparo de nuevo.'
              : 'La propuesta caducó. Pídemela otra vez y la vuelvo a preparar con los datos de ahora.',
        },
        { status: 409 }
      );
    }

    if (action.status === 'executing') {
      return NextResponse.json(
        { success: false, code: 'IN_PROGRESS', message: 'Esa acción ya se está ejecutando' },
        { status: 409 }
      );
    }
    if (action.status !== 'pending' && action.status !== 'confirmed') {
      return NextResponse.json(
        { success: false, code: 'INVALID_STATE', message: 'Esa acción ya no se puede ejecutar' },
        { status: 409 }
      );
    }

    if (!isActionType(action.tool_name)) {
      return NextResponse.json(
        { success: false, code: 'UNKNOWN_ACTION', message: 'No reconozco esa acción' },
        { status: 400 }
      );
    }
    const type: AIActionType = action.tool_name;

    // Los permisos se vuelven a evaluar AHORA: entre la propuesta y la
    // confirmación pueden haber cambiado el rol o el nivel de la organización.
    const caps = await getAssistantCapabilities(ctx);
    const decision = evaluateAction(caps, type);
    if (!decision.allowed) {
      await ctx.supabase
        .from('ai_agent_actions')
        .update({ status: 'rejected', error_code: decision.reason, error_message: decision.message })
        .eq('id', action.id);
      return NextResponse.json(
        { success: false, code: decision.reason, message: decision.message },
        { status: 403 }
      );
    }

    // Correcciones del usuario en la tarjeta.
    //
    // Dos reglas que el tester de F0 encontró que faltaban:
    //
    // 1. Los campos `readonly` NO se aceptan del cliente (fallo 3). Son los que
    //    identifican SOBRE QUÉ se actúa (`product_id`, `customer_id`…). La
    //    tarjeta los pinta deshabilitados pero los reenvía, y aceptarlos permitía
    //    cambiar el registro entre lo que el usuario vio y lo que se ejecutó.
    //    No cruzaba el tenant, pero rompía la promesa del contrato.
    // 2. Las correcciones se MEZCLAN sobre los argumentos propuestos, no los
    //    reemplazan (fallo 4). Con reemplazo, un `fields: []` borraba `args` en
    //    la propia fila antes de ejecutar y destruía la traza de qué había
    //    propuesto la IA, que es justo lo que §9.5 manda conservar.
    const args: Record<string, unknown> = { ...(action.args ?? {}) };
    if (Array.isArray(body.fields)) {
      Object.assign(
        args,
        sanitizeActionFields(type, body.fields as Array<{ name?: unknown; value?: unknown }>, {
          editableOnly: true,
        })
      );
    }

    // Compare-and-set: solo una ejecución gana la carrera.
    const { data: claimed, error: claimError } = await ctx.supabase
      .from('ai_agent_actions')
      .update({ status: 'executing', args, confirmed_at: new Date().toISOString() })
      .eq('id', action.id)
      .in('status', ['pending', 'confirmed'])
      .select('id');

    if (claimError) throw new Error(claimError.message);
    if (!claimed || claimed.length === 0) {
      return NextResponse.json(
        { success: false, code: 'IN_PROGRESS', message: 'Esa acción ya se está ejecutando' },
        { status: 409 }
      );
    }

    // A partir del claim, la fila está en `executing` y NADIE más puede tomarla.
    // Si algo lanza aquí y no se cierra el estado, la acción queda atascada: el
    // usuario recibiría 409 "ya se está ejecutando" para siempre, sin forma de
    // reintentar ni de saber qué pasó. `executeAction` captura sus propios
    // errores, pero este `catch` cubre lo que se le escape (y cualquier fallo de
    // la propia actualización), que es justo el caso en el que el usuario se
    // quedaría sin salida.
    let result;
    try {
      result = await aiActionsService.executeAction(type, args, {
        supabase: ctx.supabase,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        branchId: null,
      });
    } catch (executionError) {
      const message =
        executionError instanceof Error ? executionError.message : 'Error inesperado al ejecutar';
      await ctx.supabase
        .from('ai_agent_actions')
        .update({
          status: 'failed',
          error_code: 'unexpected_error',
          error_message: message,
          executed_at: new Date().toISOString(),
        })
        .eq('id', action.id);
      throw executionError;
    }

    const { error: closeError } = await ctx.supabase
      .from('ai_agent_actions')
      .update({
        status: result.success ? 'executed' : 'failed',
        result: result as unknown as Record<string, unknown>,
        error_code: result.success ? null : result.errorCode ?? 'execution_error',
        error_message: result.success ? null : result.message,
        undo_payload: result.undo ?? null,
        entity_type: result.entity?.type ?? null,
        entity_id: result.entity ? String(result.entity.id) : null,
        executed_at: new Date().toISOString(),
      })
      .eq('id', action.id);

    if (closeError) {
      // La escritura de negocio YA ocurrió. No se puede deshacer aquí sin
      // arriesgar más de lo que se arregla, pero dejar la fila en `executing`
      // sería mentir sobre el estado: se registra para conciliar.
      console.error('[GO Assistant] Acción ejecutada pero no se pudo cerrar su registro', {
        actionId: action.id,
        error: closeError.message,
      });
    }

    // Auditoría en el mismo sitio que el resto del ERP (§9.5): un
    // administrador debe poder responder "¿quién creó esto y con qué?".
    if (result.success) {
      // `reason` es obligatorio en el ajuste de stock —la acción de más
      // riesgo— y hasta ahora no salía de `args`: el motivo del ajuste no
      // llegaba a ninguna parte legible (fallo 13 del tester). Va en la nota de
      // auditoría hasta que F2 lo lleve al movimiento de inventario, que es su
      // sitio definitivo.
      const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
      const notes = reason
        ? `GO Assistant: ${result.message}. Motivo: ${reason}`
        : `GO Assistant: ${result.message}`;

      const { error: auditError } = await ctx.supabase.from('activities').insert({
        organization_id: ctx.organizationId,
        user_id: ctx.userId,
        activity_type: 'note',
        notes,
        occurred_at: new Date().toISOString(),
        metadata: {
          source: 'go_assistant',
          action_id: action.id,
          tool_name: type,
          reason: reason || null,
          entity_type: result.entity?.type ?? null,
          entity_id: result.entity ? String(result.entity.id) : null,
        },
      });

      // Si la auditoría falla en silencio, §9.5 deja de cumplirse justo cuando
      // más importa: un administrador ya no puede responder "quién creó esto y
      // con qué se lo pidió a la IA". No se revierte la escritura de negocio por
      // esto, pero tiene que quedar rastro. La fila de `ai_agent_actions` sigue
      // siendo la fuente principal.
      if (auditError) {
        console.error('[GO Assistant] Acción ejecutada sin registro en activities', {
          actionId: action.id,
          toolName: type,
          error: auditError.message,
        });
      }
    }

    return NextResponse.json({
      success: result.success,
      message: result.message,
      code: result.errorCode,
      entity: result.entity,
      data: result.data,
      actionId: action.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error procesando la solicitud';
    console.error('Error ejecutando acción del asistente:', message);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
