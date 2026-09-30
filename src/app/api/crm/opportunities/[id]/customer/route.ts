import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { actualizarOportunidad } from '@/lib/services/crm/opportunityWriteService';

/**
 * PUT /api/crm/opportunities/[id]/customer — vincular o desvincular el cliente
 * (CRM ola 1, `CustomerLinkPicker` del plan §4.8).
 *
 * Body: { customer_id: uuid | null, expected_updated_at? }
 * Es una edición más: pasa por `crm_update_opportunity`, que valida que el
 * cliente sea de la organización (404), exige `edit` sobre una oportunidad
 * propia o `edit_any` (403) y deja la actividad «Cliente vinculado/desvinculado».
 */
const bodySchema = z
  .object({ customer_id: z.string().uuid().nullable(), expected_updated_at: z.string().datetime({ offset: true }).optional() })
  .strict();

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: Record<string, unknown> = await readOrgBody(ctx, request);
    const id = exigirUuid((await params).id);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesEditar, CRM_PERMISOS.oportunidadesEditarCualquiera], 'PUT /api/crm/opportunities/[id]/customer');
    const parsed = bodySchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const data = await actualizarOportunidad(ctx, id, parsed.data);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'PUT /api/crm/opportunities/[id]/customer');
  }
}
