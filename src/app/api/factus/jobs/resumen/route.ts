/**
 * GET /api/factus/jobs/resumen — KPIs de la bandeja de envíos a la DIAN
 * (`finance.view`): en cola, retenidos, aceptados del mes (y % de éxito),
 * rechazados, con error y los contadores de las pestañas, contados en la base.
 * Antes la bandeja bajaba TODOS los envíos al navegador para contarlos.
 * Incluye el estado del servicio de GO Admin (sin credenciales ni ambiente).
 *
 * Solo lectura; la organización sale de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { getServiceClient } from '@/lib/supabase/server-service';
import { resumenBandeja } from '@/lib/services/einvoicing/bandeja.server';
import { tasaExito } from '@/lib/finanzas/facturacionElectronica/bandejaLogica';

const RUTA = 'factus/jobs/resumen';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const [resumen, config] = await Promise.all([
      resumenBandeja(ctx.supabase, ctx.organizationId),
      getServiceClient()
        .from('electronic_invoicing_config')
        .select('service_status, activated_at')
        .eq('organization_id', ctx.organizationId)
        .eq('provider', 'factus')
        .maybeSingle(),
    ]);
    const c = config.data as { service_status: string; activated_at: string | null } | null;

    return NextResponse.json(
      {
        servicio: { estado: c?.service_status ?? 'pending_activation', activoDesde: c?.activated_at ?? null },
        mes: resumen.mes,
        conteos: resumen.conteos,
        exito: tasaExito(resumen.conteos),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error: unknown) {
    return routeErrorResponse('Factus jobs resumen GET', error);
  }
});
