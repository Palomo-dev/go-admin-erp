/**
 * GET /api/inventario/seriales — listado de seriales de la organización de la
 * sesión (Figma «Existencias — Seriales»): filas paginadas, total, KPI y
 * permisos. Query: busqueda, estados (lista), sucursal (la del selector del
 * encabezado; la RPC comprueba el acceso), producto, garantia, orden,
 * direccion, desde, limite. Permiso de ver inventario.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { filtrosSerialesSchema, type ListadoSeriales, type PermisosSeriales } from '@/lib/services/seriales/contrato';
import { SIN_CACHE, exigirVer, leerQuery, respuestaError, rpc } from '@/lib/services/seriales/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'GET /api/inventario/seriales';

export const GET = withOrg(async (ctx, req) => {
  try {
    const filtros = await leerQuery(ctx, req, filtrosSerialesSchema, RUTA, ['estados']);
    await exigirVer(ctx, RUTA);
    const [listado, permisos] = await Promise.all([
      rpc<Omit<ListadoSeriales, 'permisos'>>(ctx, 'fn_seriales_listado', { p_org: ctx.organizationId, p_filtros: filtros }),
      rpc<PermisosSeriales>(ctx, 'fn_seriales_permisos', { p_org: ctx.organizationId }),
    ]);
    return NextResponse.json({ ...listado, permisos }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
