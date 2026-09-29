/**
 * /api/inventario/garantias
 *
 * - GET: reclamos de garantía de la organización de la sesión, paginados, con
 *   KPI y permisos (Figma «Existencias — Garantías»). Permiso de ver.
 * - POST: abre un reclamo sobre un serial vendido con garantía vigente
 *   (`fn_garantia_crear`: el serial pasa a «Reclamo garantía» y queda el
 *   evento). Body `{ serial_id, motivo, descripcion? }`. Permiso de gestionar.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { crearReclamoSchema, filtrosGarantiasSchema, type ListadoGarantias } from '@/lib/services/seriales/contrato';
import { SIN_CACHE, exigirGestionar, exigirVer, leerCuerpo, leerQuery, respuestaError, rpc } from '@/lib/services/seriales/rutas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  const RUTA = 'GET /api/inventario/garantias';
  try {
    const filtros = await leerQuery(ctx, req, filtrosGarantiasSchema, RUTA, ['estados']);
    await exigirVer(ctx, RUTA);
    const listado = await rpc<ListadoGarantias>(ctx, 'fn_garantias_listado', { p_org: ctx.organizationId, p_filtros: filtros });
    return NextResponse.json(listado, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});

export const POST = withOrg(async (ctx, req) => {
  const RUTA = 'POST /api/inventario/garantias';
  try {
    const cuerpo = await leerCuerpo(ctx, req, crearReclamoSchema, RUTA);
    await exigirGestionar(ctx, RUTA);
    const resultado = await rpc<{ id: string; codigo: string }>(ctx, 'fn_garantia_crear', {
      p_org: ctx.organizationId,
      p_serial_id: cuerpo.serial_id,
      p_motivo: cuerpo.motivo,
      p_descripcion: cuerpo.descripcion ?? null,
    });
    return NextResponse.json({ resultado }, { status: 201, headers: SIN_CACHE });
  } catch (err) {
    return respuestaError(RUTA, err);
  }
});
