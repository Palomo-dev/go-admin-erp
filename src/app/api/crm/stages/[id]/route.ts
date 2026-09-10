import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { canManageStages, STAGE_MANAGER_REQUIRED } from '@/lib/services/crm/stagePermissions';

/**
 * PATCH /api/crm/stages/[id]  — edita una etapa del pipeline (F9-41)
 * DELETE /api/crm/stages/[id] — borra una etapa vacía
 *
 * Ver la cabecera de `../route.ts`: la barrera real está en la BD; aquí se
 * comprueba el rol, la pertenencia a la organización y las reglas de negocio
 * (una etapa no puede ser ganadora y perdedora; no se borra una etapa con
 * oportunidades dentro).
 *
 * `name/color/description/probability` se escriben por el RPC
 * `update_stage_without_triggers` (desactiva los triggers de forecast durante
 * la escritura, comportamiento heredado); `is_won`/`is_lost` van por UPDATE
 * normal para que el trigger de guarda los revise.
 */

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    color: z.string().max(32).optional(),
    description: z.string().max(2000).nullable().optional(),
    probability: z.number().min(0).max(100).nullable().optional(),
    is_won: z.boolean().optional(),
    is_lost: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' });

interface StageRow {
  id: string;
  name: string;
  position: number;
  pipeline_id: string;
  probability: number | null;
  color: string | null;
  description: string | null;
  is_won: boolean | null;
  is_lost: boolean | null;
}

/** Lee la etapa comprobando que su pipeline es de la organización activa. */
async function readStageInOrg(
  supabase: Awaited<ReturnType<typeof getServerOrgContext>>['supabase'],
  orgId: number,
  stageId: string
): Promise<StageRow | null> {
  const { data, error } = await supabase
    .from('stages')
    .select('id, name, position, pipeline_id, probability, color, description, is_won, is_lost, pipelines!inner(id, organization_id)')
    .eq('id', stageId)
    .eq('pipelines.organization_id', orgId)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la etapa: ${error.message}`);
  return (data as unknown as StageRow | null) ?? null;
}

function fail(error: unknown, tag: string): NextResponse {
  if (error instanceof OrgContextError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
  }
  const message = error instanceof Error ? error.message : 'Error desconocido';
  console.error(`[CRM Stages] ${tag}:`, message);
  return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    if (!canManageStages(ctx)) {
      return NextResponse.json({ success: false, error: STAGE_MANAGER_REQUIRED }, { status: 403 });
    }
    const { id } = await params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const b = parsed.data;
    const stage = await readStageInOrg(ctx.supabase, ctx.organizationId, id);
    if (!stage) return NextResponse.json({ success: false, error: 'Etapa no encontrada' }, { status: 404 });

    const nextWon = b.is_won ?? Boolean(stage.is_won);
    const nextLost = b.is_lost ?? Boolean(stage.is_lost);
    if (nextWon && nextLost) {
      return NextResponse.json({ success: false, error: 'Una etapa no puede ser ganadora y perdedora a la vez' }, { status: 400 });
    }

    const touchesBasics = b.name !== undefined || b.color !== undefined || b.description !== undefined || b.probability !== undefined;
    if (touchesBasics) {
      const { error } = await ctx.supabase.rpc('update_stage_without_triggers', {
        p_stage_id: id,
        p_name: b.name ?? stage.name,
        p_color: b.color ?? stage.color,
        p_description: b.description !== undefined ? b.description : stage.description,
        p_probability: b.probability !== undefined ? b.probability : stage.probability,
      });
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    if (b.is_won !== undefined || b.is_lost !== undefined) {
      const { error } = await ctx.supabase
        .from('stages')
        .update({ is_won: nextWon, is_lost: nextLost, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('pipeline_id', stage.pipeline_id);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    const fresh = await readStageInOrg(ctx.supabase, ctx.organizationId, id);
    return NextResponse.json({ success: true, data: fresh ?? stage }, { status: 200 });
  } catch (error) {
    return fail(error, 'PATCH');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    if (!canManageStages(ctx)) {
      return NextResponse.json({ success: false, error: STAGE_MANAGER_REQUIRED }, { status: 403 });
    }
    const { id } = await params;
    const stage = await readStageInOrg(ctx.supabase, ctx.organizationId, id);
    if (!stage) return NextResponse.json({ success: false, error: 'Etapa no encontrada' }, { status: 404 });

    // Borrar una etapa con oportunidades dentro las dejaría huérfanas (o haría
    // saltar la FK con un mensaje ilegible): se responde con el conteo real.
    const { count, error: countError } = await ctx.supabase
      .from('opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.organizationId)
      .eq('stage_id', id);
    if (countError) throw new Error(`No se pudo comprobar la etapa: ${countError.message}`);
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { success: false, error: `La etapa tiene ${count} oportunidad(es); muévelas antes de borrarla` },
        { status: 409 }
      );
    }

    const { error } = await ctx.supabase.from('stages').delete().eq('id', id).eq('pipeline_id', stage.pipeline_id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, data: { id } }, { status: 200 });
  } catch (error) {
    return fail(error, 'DELETE');
  }
}
