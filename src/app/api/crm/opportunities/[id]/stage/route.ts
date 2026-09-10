import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { changeStage } from '@/lib/services/crm/opportunityStageService';
import { canOverrideStageGate, STAGE_MANAGER_REQUIRED } from '@/lib/services/crm/stagePermissions';

/**
 * PATCH /api/crm/opportunities/[id]/stage — cambio de etapa único (FASE-09 §4.1).
 *
 * Body: { stage_id, override?: boolean, override_reason?, won_data?: object, loss_data?: LossReasonData }
 * 200 { success, data: { opportunity, stage, gate, overridden } }
 * 409 { success:false, reason:'gate', gate:{ok,missing[]} }  (sin override)
 * 409 { success:false, reason:'needs_won'|'needs_lost' }      (falta modal de cierre)
 * 409 { success:false, reason:'conflict' }                    (otro PATCH ganó la carrera)
 * 403 override sin rol de jefatura (admin de org o Manager) — F9-11/F9-36
 * 404 oportunidad/etapa no encontrada · 400 pipeline distinto / misma etapa
 */
const bodySchema = z.object({
  stage_id: z.string().uuid(),
  override: z.boolean().optional(),
  override_reason: z.string().max(500).optional(),
  won_data: z.record(z.unknown()).optional(),
  loss_data: z
    .object({
      lossReasonId: z.string().optional(),
      lossReasonLabel: z.string().optional(),
      competitor: z.string().optional(),
      competitorPrice: z.number().optional(),
      missingFeatures: z.array(z.string()).optional(),
      recontactDate: z.string().optional(),
      notes: z.string().optional(),
    })
    .optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const { id } = await params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const b = parsed.data;
    // F9-11 / F9-36: saltarse un gate es una excepción auditable, no una acción
    // de cualquier miembro — pero tampoco una acción exclusiva del administrador
    // de la organización: la jefatura comercial (`Manager`) es justo el perfil
    // que debe poder hacerlo. Ver `stagePermissions.ts`.
    if (b.override && !canOverrideStageGate(ctx)) {
      throw new OrgContextError(STAGE_MANAGER_REQUIRED, 403, 'STAGE_OVERRIDE_FORBIDDEN');
    }
    const result = await changeStage(
      ctx.organizationId,
      ctx.userId,
      { opportunityId: id, stageId: b.stage_id, override: b.override, overrideReason: b.override_reason, wonData: b.won_data, lossData: b.loss_data },
      ctx.supabase
    );

    if (result.ok) {
      return NextResponse.json({ success: true, data: result }, { status: 200 });
    }
    switch (result.reason) {
      case 'gate':
        return NextResponse.json({ success: false, reason: 'gate', gate: result.gate, stage: result.stage, error: 'Faltan criterios para la etapa' }, { status: 409 });
      case 'needs_won':
      case 'needs_lost':
        return NextResponse.json({ success: false, reason: result.reason, stage: result.stage, error: 'La etapa requiere datos de cierre' }, { status: 409 });
      case 'conflict':
        return NextResponse.json({ success: false, reason: 'conflict', error: 'La oportunidad cambió mientras se guardaba; vuelve a intentarlo' }, { status: 409 });
      case 'not_found':
      case 'stage_not_found':
        return NextResponse.json({ success: false, reason: result.reason, error: 'No encontrado' }, { status: 404 });
      case 'same_stage':
      case 'pipeline_mismatch':
      default:
        return NextResponse.json({ success: false, reason: result.reason, error: 'Etapa no válida para esta oportunidad' }, { status: 400 });
    }
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Stage] PATCH error:', message);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
