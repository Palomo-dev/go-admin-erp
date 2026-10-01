import { NextRequest, NextResponse } from 'next/server';
import { programarDespachoAvisos } from '@/lib/services/avisos/despacho.server';
import { z } from 'zod';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { changeStage } from '@/lib/services/crm/opportunityStageService';
import { CRM_PERMISOS, exigirPermisoCrm, exigirUuid, respuestaErrorCrm, type CrmPermiso } from '@/lib/services/crm/crmRouteSupport';
import { cargarOportunidadEditable } from '@/lib/services/crm/opportunityWriteService';
import { lossDataSchema, respuestaCambioEtapa } from '@/lib/services/crm/opportunityStageHttp';

/**
 * PATCH /api/crm/opportunities/[id]/stage — cambio de etapa único (FASE-09 §4.1).
 *
 * Body: { stage_id, override?: boolean, override_reason?, won_data?: object, loss_data?: LossReasonData }
 * 200 { success, data: { opportunity, stage, gate, overridden } }
 * 409 { success:false, reason:'gate', gate:{ok,missing[]} }  (sin override)
 * 409 { success:false, reason:'needs_won'|'needs_lost' }      (falta modal de cierre)
 * 409 { success:false, reason:'conflict' }                    (otro PATCH ganó la carrera)
 * 403 CRM ola 1 (M7, D5), resuelto en el servidor por PERMISO:
 *     · mover: `crm.opportunities.edit` sobre una oportunidad propia
 *       (responsable o creador) o `crm.opportunities.edit_any`;
 *     · cerrar (won_data / loss_data) o reabrir una cerrada: además
 *       `crm.opportunities.close`;
 *     · override: además `crm.stages.override_gate` (antes, lista de roles).
 * 404 oportunidad/etapa no encontrada · 400 pipeline distinto / misma etapa
 */
const bodySchema = z.object({
  stage_id: z.string().uuid(),
  override: z.boolean().optional(),
  override_reason: z.string().max(500).optional(),
  won_data: z.record(z.unknown()).optional(),
  loss_data: lossDataSchema.optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const { id } = await params;
    const parsed = bodySchema.safeParse(readOrgBody(ctx, await request.json().catch(() => null), { request }));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const b = parsed.data;
    exigirUuid(id);
    // F9-11 / F9-36 → CRM ola 1 (M7): saltarse un gate es una excepción auditable
    // que exige `crm.stages.override_gate` (D5: Admin y Manager por
    // role_permissions; un cargo puede concederlo). Cerrar exige `close`.
    const extra: CrmPermiso[] = [];
    if (b.won_data !== undefined || b.loss_data !== undefined) extra.push(CRM_PERMISOS.oportunidadesCerrar);
    const opp = await cargarOportunidadEditable(ctx, id, 'PATCH /api/crm/opportunities/[id]/stage', extra);
    // Sacar de una etapa ganada o perdida REABRE el cierre: también es `close`.
    if (opp.status && opp.status !== 'open' && extra.length === 0) {
      await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesCerrar], 'PATCH /api/crm/opportunities/[id]/stage (reabrir)');
    }
    if (b.override) await exigirPermisoCrm(ctx, [CRM_PERMISOS.etapasSaltarGate], 'PATCH /api/crm/opportunities/[id]/stage (override)');
    const result = await changeStage(
      ctx.organizationId,
      ctx.userId,
      { opportunityId: id, stageId: b.stage_id, override: b.override, overrideReason: b.override_reason, wonData: b.won_data, lossData: b.loss_data },
      ctx.supabase
    );
    programarDespachoAvisos(ctx.organizationId);

    return respuestaCambioEtapa(result);
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    return respuestaErrorCrm(error, 'PATCH /api/crm/opportunities/[id]/stage');
  }
}
