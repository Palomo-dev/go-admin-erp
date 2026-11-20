/**
 * /api/pos/propinas/liquidaciones
 *
 * GET — liquidaciones paginadas (`fn_propinas_liquidaciones_listado`). Query:
 * q, estado (pagada · anulada), medio, desde, hasta, pagina, tamano, sucursal.
 *
 * POST — liquida propinas (`fn_propinas_liquidacion_crear`): en una sola
 * transacción de la base valida, reparte, numera (LIQ-000001), registra el
 * egreso de caja con el mecanismo de Cajas y marca las propinas. Permiso
 * `pos.propinas.liquidar` en la base. La organización es la de la sesión; un
 * body con otra organización → 403 (`readOrgBody`). `solicitud` hace
 * idempotente el reintento.
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { crearLiquidacion, listarLiquidaciones, validarDatosLiquidacion } from '@/lib/pos/propinas/propinasServidor';
import { SIN_CACHE, consultaDe, puedeVerPropinas, respuestaErrorPropinas, sinPermiso } from '@/lib/pos/propinas/respuestas';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  if (!(await puedeVerPropinas(ctx))) return sinPermiso();
  try {
    return NextResponse.json(await listarLiquidaciones(ctx, consultaDe(req)), { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorPropinas(err, 'GET /api/pos/propinas/liquidaciones', ctx.organizationId);
  }
});

export const POST = withOrg(async (ctx, req) => {
  const body = await readOrgBody<unknown>(ctx, req, { route: 'POST /api/pos/propinas/liquidaciones' });
  try {
    const datos = validarDatosLiquidacion(body);
    return NextResponse.json(await crearLiquidacion(ctx, datos), { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorPropinas(err, 'POST /api/pos/propinas/liquidaciones', ctx.organizationId);
  }
});
