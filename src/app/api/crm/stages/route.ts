import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { canManageStages, STAGE_MANAGER_REQUIRED } from '@/lib/services/crm/stagePermissions';

/**
 * Escritura de etapas del pipeline (FASE-09 §4.1, F9-41).
 *
 * Hasta la ronda 2 el tablero creaba, editaba, reordenaba y borraba `stages`
 * directamente desde el navegador con el cliente de sesión y **sin ningún
 * control de rol**: cualquier miembro podía marcar una etapa intermedia como
 * ganadora, y desde que `stages.is_won` decide cierres esa acción tiene
 * consecuencias contables. Estas rutas son el punto de entrada con permisos.
 *
 * La barrera real está en la BD (trigger `trg_stages_guard_outcome_flags` y el
 * RPC `update_stage_without_triggers`, ambos con comprobación de pertenencia y
 * rol): estas rutas dan el mensaje claro y el 403, no son la única defensa.
 *
 * POST /api/crm/stages        → crea una etapa en un pipeline de la org
 * PUT  /api/crm/stages        → reordena las etapas de un pipeline
 */

const createSchema = z.object({
  pipeline_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  position: z.number().int().min(1).optional(),
  probability: z.number().min(0).max(100).nullable().optional(),
  color: z.string().max(32).optional(),
  description: z.string().max(2000).nullable().optional(),
  is_won: z.boolean().optional(),
  is_lost: z.boolean().optional(),
});

const reorderSchema = z.object({
  pipeline_id: z.string().uuid(),
  order: z.array(z.object({ id: z.string().uuid(), position: z.number().int().min(1) })).min(1).max(100),
});

/** Verifica que el pipeline es de la organización activa. 404 si no. */
async function assertPipelineInOrg(
  supabase: Awaited<ReturnType<typeof getServerOrgContext>>['supabase'],
  orgId: number,
  pipelineId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('pipelines')
    .select('id')
    .eq('id', pipelineId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo verificar el pipeline: ${error.message}`);
  return Boolean(data);
}

function fail(error: unknown, tag: string): NextResponse {
  if (error instanceof OrgContextError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
  }
  const message = error instanceof Error ? error.message : 'Error desconocido';
  console.error(`[CRM Stages] ${tag}:`, message);
  return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    if (!canManageStages(ctx)) {
      return NextResponse.json({ success: false, error: STAGE_MANAGER_REQUIRED }, { status: 403 });
    }
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const b = parsed.data;
    if (b.is_won && b.is_lost) {
      return NextResponse.json({ success: false, error: 'Una etapa no puede ser ganadora y perdedora a la vez' }, { status: 400 });
    }
    if (!(await assertPipelineInOrg(ctx.supabase, ctx.organizationId, b.pipeline_id))) {
      return NextResponse.json({ success: false, error: 'Pipeline no encontrado' }, { status: 404 });
    }

    let position = b.position;
    if (position == null) {
      const { data: last, error: e } = await ctx.supabase
        .from('stages')
        .select('position')
        .eq('pipeline_id', b.pipeline_id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (e) throw new Error(`No se pudo calcular la posición: ${e.message}`);
      position = ((last?.position as number | undefined) ?? 0) + 1;
    }

    const { data, error } = await ctx.supabase
      .from('stages')
      .insert({
        pipeline_id: b.pipeline_id,
        name: b.name,
        position,
        probability: b.probability ?? null,
        color: b.color || '#3b82f6',
        description: b.description ?? null,
        is_won: b.is_won ?? false,
        is_lost: b.is_lost ?? false,
      })
      .select('id, name, position, pipeline_id, probability, color, description, is_won, is_lost')
      .single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return fail(error, 'POST');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    if (!canManageStages(ctx)) {
      return NextResponse.json({ success: false, error: STAGE_MANAGER_REQUIRED }, { status: 403 });
    }
    const parsed = reorderSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const { pipeline_id: pipelineId, order } = parsed.data;
    if (!(await assertPipelineInOrg(ctx.supabase, ctx.organizationId, pipelineId))) {
      return NextResponse.json({ success: false, error: 'Pipeline no encontrado' }, { status: 404 });
    }
    // Todas las etapas del reordenamiento tienen que ser de ESE pipeline: si no,
    // un id ajeno colado en la lista movería una etapa de otro tablero.
    const { data: owned, error: e } = await ctx.supabase
      .from('stages')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .in('id', order.map((o) => o.id));
    if (e) throw new Error(`No se pudieron leer las etapas: ${e.message}`);
    if ((owned ?? []).length !== order.length) {
      return NextResponse.json({ success: false, error: 'Alguna etapa no pertenece al pipeline' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const results = await Promise.all(
      order.map((o) =>
        ctx.supabase.from('stages').update({ position: o.position, updated_at: now }).eq('id', o.id).eq('pipeline_id', pipelineId)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      return NextResponse.json({ success: false, error: failed.error.message }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: { updated: order.length } }, { status: 200 });
  } catch (error) {
    return fail(error, 'PUT');
  }
}
