import { NextRequest, NextResponse } from 'next/server';
import { programarDespachoAvisos } from '@/lib/services/avisos/despacho.server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { changeStage } from '@/lib/services/crm/opportunityStageService';
import { CRM_PERMISOS, exigirPermisoCrm, exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { cargarOportunidadEditable } from '@/lib/services/crm/opportunityWriteService';
import { etapaDeDesenlace, respuestaCambioEtapa } from '@/lib/services/crm/opportunityStageHttp';

/**
 * POST /api/crm/opportunities/[id]/win — marcar ganada (CRM ola 1, plan §4.8).
 *
 * Mueve a la etapa `is_won` del pipeline (la indicada o la primera) por
 * `opportunityStageService.changeStage`, el único punto de cambio de etapa:
 * mismo gate, mismos datos de cierre, mismo bloqueo optimista. Los pasos
 * posteriores (factura, comisión, onboarding…) siguen en `wonCloseSteps`.
 *
 * Body: { won_data: object (no vacío), stage_id?, override?, override_reason? }
 * Permisos: `crm.opportunities.close` + (propia con `edit` o `edit_any`);
 * `override` exige `crm.stages.override_gate`.
 * 200 · 400 · 403 · 404 · 409 gate | sin_etapa_ganada | conflict
 */
const bodySchema = z
  .object({
    won_data: z.record(z.unknown()).refine((v) => Object.keys(v).length > 0, 'won_data vacío'),
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
    const opp = await cargarOportunidadEditable(ctx, id, 'POST /api/crm/opportunities/[id]/win', [CRM_PERMISOS.oportunidadesCerrar]);
    if (b.override) await exigirPermisoCrm(ctx, [CRM_PERMISOS.etapasSaltarGate], 'POST /api/crm/opportunities/[id]/win (override)');
    const stageId = await etapaDeDesenlace(ctx.supabase, opp.pipeline_id, 'won', b.stage_id);
    const result = await changeStage(
      ctx.organizationId,
      ctx.userId,
      { opportunityId: id, stageId, override: b.override, overrideReason: b.override_reason, wonData: b.won_data },
      ctx.supabase,
    );
    programarDespachoAvisos(ctx.organizationId);
    return respuestaCambioEtapa(result);
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/opportunities/[id]/win');
  }
}
