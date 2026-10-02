import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { programarDespachoAvisos } from '@/lib/services/avisos/despacho.server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { asignarResponsable } from '@/lib/services/crm/leadWriteService';

/**
 * POST /api/crm/leads/assign — «Asignar responsable» en lote (CRM ola 1, plan §4.1).
 *
 * Body: { customer_ids: uuid[] (1–500), owner_id: uuid | null }
 * `crm.leads.assign` (D5: Admin y Manager). Solo actualiza clientes de la
 * organización de la sesión (los ids ajenos se ignoran y no cuentan).
 * 200 { actualizados, ids } · 400 responsable que no es miembro · 403.
 */
const bodySchema = z
  .object({ customer_ids: z.array(z.string().uuid()).min(1).max(500), owner_id: z.string().uuid().nullable() })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: Record<string, unknown> = await readOrgBody(ctx, request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.leadsAsignar], 'POST /api/crm/leads/assign');
    const parsed = bodySchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const data = await asignarResponsable(ctx, Array.from(new Set(parsed.data.customer_ids)), parsed.data.owner_id);
    if (data.actualizados > 0) programarDespachoAvisos(ctx.organizationId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/leads/assign');
  }
}
