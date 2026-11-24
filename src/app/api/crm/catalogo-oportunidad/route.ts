import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { resolverCatalogo } from '@/lib/services/crm/catalogoOportunidad.server';

/**
 * GET /api/crm/catalogo-oportunidad?op=… — lecturas del selector «Agregar a la
 * oportunidad» y de la pestaña «Líneas» (CRM ola 3B, guardarraíl 36).
 *
 * Organización de la sesión (cliente con RLS); cualquier `org` de la query se
 * ignora. Permiso: alguno de `crm.opportunities.view|create|edit` (el
 * selector se usa al crear y al editar; el stock de las líneas, al ver).
 *
 *   op=contar                                         → { productos, servicios }
 *   op=buscar&pestana=productos|servicios&texto&limite → ItemCatalogo[]
 *   op=stock&ids=1,2,3                                → StockProductoApi[]
 *   op=padre&product_id                               → PadreVariante | null
 *   op=membresia&product_id                           → PlanMembresia | null
 *   op=clases&desde (ISO)                             → ClaseProxima[]
 *   op=ocupado&usuario (uuid)&desde&hasta (ISO)       → IntervaloOcupado[]
 *   op=tipos-hospedaje                                → TipoHospedaje[]
 *   op=planes-tarifa&space_type_id                    → string[]
 *   op=disponibilidad&entrada&salida&space_type_id&branch_id → HabitacionDisponible[]
 *   op=total-hospedaje&space_type_id&entrada&salida&plan     → TotalHospedaje | null
 *
 * 200 { success, data } · 400 parámetro · 403 permiso · 404 sucursal o tipo
 * de habitación ajenos.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await exigirPermisoCrm(
      ctx,
      [CRM_PERMISOS.oportunidadesVer, CRM_PERMISOS.oportunidadesCrear, CRM_PERMISOS.oportunidadesEditar],
      'GET /api/crm/catalogo-oportunidad',
    );
    const data = await resolverCatalogo(ctx, new URL(request.url).searchParams);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/catalogo-oportunidad');
  }
}
