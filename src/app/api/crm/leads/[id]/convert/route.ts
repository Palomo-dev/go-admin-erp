import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { isOrgAdmin } from '@/lib/utils/rbac';
import StageGateService from '@/lib/services/crm/stageGateService';

/**
 * POST /api/crm/leads/[id]/convert — Convierte un lead (record_type='lead') en deal (record_type='deal').
 *
 * Validaciones:
 * 1. El lead debe pertenecer a la organización del usuario.
 * 2. El record_type actual debe ser 'lead'.
 * 3. Evalúa el stage gate de la etapa actual (soft-gate: informa pero no bloquea).
 * 4. Requiere rol de admin de organización.
 *
 * Body opcional: { targetStageId?: string, skipGateCheck?: boolean }
 *
 * CICLO DE VIDA DEL CLIENTE: el paso `customers.lifecycle_stage` 'lead' →
 * 'opportunity' NO se escribe aquí. Lo hace el trigger `trg_sync_customer_lifecycle`
 * sobre el propio UPDATE de `record_type` (migración `crm_customer_lifecycle_ladder`),
 * que es el único sitio que cubre también a los demás escritores de `record_type`
 * (`opportunitiesService.updateOpportunity`) y aplica la escalera monotónica —
 * un cliente que ya es 'customer' nunca baja a 'opportunity'. Esta ruta se limita
 * a releer el resultado para devolverlo, de modo que el cambio sea observable y
 * no un efecto silencioso.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();

    // Validar permisos de admin
    if (!isOrgAdmin(ctx)) {
      return NextResponse.json(
        { success: false, error: 'Se requieren permisos de administrador de organización' },
        { status: 403 }
      );
    }

    const { id: leadId } = await params;

    // Parsear body (puede estar vacío)
    let body: { targetStageId?: string; skipGateCheck?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      // Body vacío es válido
    }

    // 1. Obtener el lead y verificar que pertenece a la org y es record_type='lead'
    const { data: lead, error: leadError } = await ctx.supabase
      .from('opportunities')
      .select('id, record_type, stage_id, pipeline_id, organization_id, name, customer_id')
      .eq('id', leadId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (leadError) {
      throw leadError;
    }

    if (!lead) {
      return NextResponse.json(
        { success: false, error: 'Lead no encontrado en la organización' },
        { status: 404 }
      );
    }

    if (lead.record_type !== 'lead') {
      return NextResponse.json(
        { success: false, error: `La oportunidad no es un lead (record_type actual: '${lead.record_type}')` },
        { status: 400 }
      );
    }

    // 2. Evaluar el stage gate de la etapa actual (soft-gate)
    const stageIdToEvaluate = body.targetStageId || lead.stage_id;
    let gateResult = null;

    if (!body.skipGateCheck && stageIdToEvaluate) {
      const gateService = new StageGateService(ctx.organizationId);
      gateResult = await gateService.evaluateStageGate(leadId, stageIdToEvaluate);
    }

    // 3. Convertir: cambiar record_type a 'deal'
    const updateData: { record_type: string; updated_at: string; stage_id?: string } = {
      record_type: 'deal',
      updated_at: new Date().toISOString(),
    };

    // Si se especifica una etapa destino, actualizarla
    if (body.targetStageId) {
      updateData.stage_id = body.targetStageId;
    }

    const { data: updated, error: updateError } = await ctx.supabase
      .from('opportunities')
      .update(updateData)
      .eq('id', leadId)
      .select('id, name, record_type, stage_id, pipeline_id, updated_at')
      .single();

    if (updateError) {
      throw updateError;
    }

    // 4. Releer la etapa de ciclo de vida que dejó el trigger, para devolverla.
    //    Un fallo aquí no invalida la conversión: se registra y se devuelve null.
    let customerLifecycleStage: string | null = null;
    if (lead.customer_id) {
      const { data: customer, error: customerError } = await ctx.supabase
        .from('customers')
        .select('lifecycle_stage')
        .eq('id', lead.customer_id)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle();
      if (customerError) {
        console.error(
          '[CRM Leads Convert] no se pudo releer lifecycle_stage del cliente %s: %s',
          lead.customer_id,
          customerError.message
        );
      } else {
        customerLifecycleStage = (customer?.lifecycle_stage as string | null) ?? null;
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: updated,
        gate: gateResult,
        customer: lead.customer_id
          ? { id: lead.customer_id, lifecycle_stage: customerLifecycleStage }
          : null,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Leads Convert] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
