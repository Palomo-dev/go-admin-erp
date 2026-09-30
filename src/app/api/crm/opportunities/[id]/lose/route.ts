import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { changeStage } from '@/lib/services/crm/opportunityStageService';
import { CRM_PERMISOS, exigirPermisoCrm, exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { cargarOportunidadEditable } from '@/lib/services/crm/opportunityWriteService';
import { etapaDeDesenlace, lossDataSchema, respuestaCambioEtapa } from '@/lib/services/crm/opportunityStageHttp';

/**
 * POST /api/crm/opportunities/[id]/lose — marcar perdida (CRM ola 1, pasos 1.3
 * y §4.8).
 *
 * Perder SIEMPRE mueve a una etapa `is_lost` del pipeline (la indicada o la
 * primera) por `opportunityStageService.changeStage`, con el motivo
 * estructurado; sustituye al `markAsLost` del navegador, que cambiaba el
 * estado sin mover la etapa. Sin etapa de pérdida → 409 `sin_etapa_perdida`.
 *
 * Body: { loss_data: { lossReasonId? | lossReasonLabel?, competitor?, … }, stage_id?, override?, override_reason? }
 * Permisos: `crm.opportunities.close` + (propia con `edit` o `edit_any`);
 * `override` exige `crm.stages.override_gate`.
 */
const bodySchema = z
  .object({
    loss_data: lossDataSchema.refine((l) => Boolean(l.lossReasonId?.trim() || l.lossReasonLabel?.trim()), 'Falta el motivo de pérdida'),
    stage_id: z.string().uuid().optional(),
    override: z.boolean().optional(),
    override_reason: z.string().max(500).optional(),
  })
  .strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: Record<string, unknown> = await readOrgBody(ctx, request);
    const id = exigirUuid((await params).id);
    const parsed = bodySchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const b = parsed.data;
    const opp = await cargarOportunidadEditable(ctx, id, 'POST /api/crm/opportunities/[id]/lose', [CRM_PERMISOS.oportunidadesCerrar]);
    if (b.override) await exigirPermisoCrm(ctx, [CRM_PERMISOS.etapasSaltarGate], 'POST /api/crm/opportunities/[id]/lose (override)');
    const stageId = await etapaDeDesenlace(ctx.supabase, opp.pipeline_id, 'lost', b.stage_id);
    const result = await changeStage(
      ctx.organizationId,
      ctx.userId,
      { opportunityId: id, stageId, override: b.override, overrideReason: b.override_reason, lossData: b.loss_data },
      ctx.supabase,
    );
    return respuestaCambioEtapa(result);
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/opportunities/[id]/lose');
  }
}
