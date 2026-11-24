/**
 * POST /api/crm/segments/import — «Importar lista» del listado de Segmentos
 * (Figma CRM 1384:17). Crea un segmento ESTÁTICO con los clientes que
 * coinciden con una lista de correos, teléfonos o documentos.
 * Body: `{ nombre, descripcion?, valores: string[] }` (máx. 5.000 valores).
 * La organización sale de la sesión (una ajena en el body → 403); permiso
 * `crm.segments.manage` en la ruta y otra vez dentro de `crm_save_segment`.
 * Respuesta 201: `{ success, data: { segmento_id, encontrados, no_encontrados } }`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { importarListaComoSegmento, leerEntradaImportacion } from '@/lib/services/crm/segmentosImportacionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = sinClavesDeOrganizacion((await readOrgBody(ctx, request)) as Record<string, unknown>);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.segmentosGestionar], 'POST /api/crm/segments/import');
    const entrada = leerEntradaImportacion(body);
    const data = await importarListaComoSegmento(ctx.supabase, getServiceClient(), ctx.organizationId, ctx.userId, entrada);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return respuestaErrorCrm(error, 'POST /api/crm/segments/import');
  }
}
