import { NextRequest, NextResponse } from 'next/server';
import { programarDespachoAvisos } from '@/lib/services/avisos/despacho.server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { filtrosDesdeQuery, listarOportunidades, opcionesDesdeQuery } from '@/lib/services/crm/oportunidadesLecturaService';
import { crearOportunidad, oportunidadAltaSchema } from '@/lib/services/crm/opportunityWriteService';

/**
 * /api/crm/opportunities — CRM ola 1 (plan §4.4 y §4.7).
 *
 * GET  lista paginada en el servidor (`crm.opportunities.view`).
 *      Query: status, record_type (lead|deal), pipeline_id, stage_id,
 *      salesperson_id (uuid | none), customer_id, temperature (cold,warm,hot),
 *      close_from/close_to (date), q (nombre o cliente), sort
 *      (creada|cierre|monto|proximo|nombre), dir (asc|desc), page (1…),
 *      limit (≤ 100). Ola 3B: cada fila trae `cliente_nombre`, `etapa`
 *      (nombre, probabilidad, color, desenlace) y `entro_etapa_en`
 *      (`oportunidadesLecturaService`).
 *      Las 42 oportunidades `record_type='lead'` heredadas salen con
 *      `es_lead: true` para que la interfaz las etiquete «Lead» (D2).
 * POST alta con la RPC `crm_create_opportunity` (`crm.opportunities.create`):
 *      pipeline de ventas por defecto, primera etapa no terminal, moneda base,
 *      líneas y actividad en la misma transacción; siempre `record_type='deal'`.
 *      201 { data } · 400 cuerpo · 403 permiso · 404 cliente/pipeline/etapa
 *      ajenos · 409 sin embudo de ventas.
 */

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'GET /api/crm/opportunities');
    const sp = new URL(request.url).searchParams;
    const opciones = opcionesDesdeQuery(sp);
    const { filas, total } = await listarOportunidades(ctx, filtrosDesdeQuery(sp), opciones);
    return NextResponse.json({ success: true, data: filas, page: opciones.page, limit: opciones.limit, total });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/opportunities');
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: Record<string, unknown> = await readOrgBody(ctx, request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesCrear], 'POST /api/crm/opportunities');
    const parsed = oportunidadAltaSchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const data = await crearOportunidad(ctx, parsed.data);
    programarDespachoAvisos(ctx.organizationId);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/opportunities');
  }
}
