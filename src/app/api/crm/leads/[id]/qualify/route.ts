import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { oportunidadAltaSchema } from '@/lib/services/crm/opportunityWriteService';
import { calificarLead } from '@/lib/services/crm/leadWriteService';

/**
 * POST /api/crm/leads/[id]/qualify — «Calificar» un lead (CRM ola 1, D2, plan §4.1).
 *
 * `[id]` es el CLIENTE en etapa lead. Crea su oportunidad (`record_type='deal'`,
 * `metadata.origen='lead'`) con `crm_create_opportunity`: pipeline de ventas
 * por defecto, primera etapa no terminal, moneda base, actividad «Oportunidad
 * creada desde lead»; el cliente pasa a 'opportunity' (trigger de alta). Lo que
 * el cuerpo no trae se prellena con `metadata.lead` y el responsable del lead.
 *
 * Body: el de `POST /api/crm/opportunities` (name obligatorio); `customer_id` y
 * `origen` los fija la ruta. `crm.opportunities.create`.
 * 201 · 400 · 403 · 404 lead ajeno · 409 sin embudo de ventas.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const leido: Record<string, unknown> = await readOrgBody(ctx, request);
    const body = sinClavesDeOrganizacion(leido);
    const id = exigirUuid((await params).id);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesCrear], 'POST /api/crm/leads/[id]/qualify');
    delete body.customer_id;
    delete body.origen;
    const parsed = oportunidadAltaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const data = await calificarLead(ctx, id, parsed.data);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/leads/[id]/qualify');
  }
}
