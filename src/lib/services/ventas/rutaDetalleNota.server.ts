/**
 * GET del detalle de una nota (crédito o débito): la misma lógica para
 * `/api/notas-credito/[id]` y `/api/notas-debito/[id]`, que la envuelven en
 * `withOrg` (sesión y organización de la sesión). Permiso `finance.view`; la
 * nota debe ser de la organización de la sesión y del tipo de la ruta (404 si no).
 */
import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, type OrgRouteHandler } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import type { TipoNota } from '@/lib/finanzas/notas/contratoNotas';
import { detalleNota, ErrorNotasServidor } from './notas.server';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function manejarDetalleNota(tipo: TipoNota, ruta: string): OrgRouteHandler {
  return async (ctx, req, routeParams) => {
    await readOrgBody(ctx, req, { route: ruta });
    const params = routeParams ? await routeParams.params : {};
    const id = typeof params.id === 'string' ? params.id : '';
    if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Nota no encontrada', codigo: 'nota_no_encontrada' }, { status: 404, headers: SIN_CACHE });
    if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) {
      return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
    }
    try {
      return NextResponse.json(await detalleNota(ctx, id, tipo), { headers: SIN_CACHE });
    } catch (err) {
      if (err instanceof ErrorNotasServidor) {
        return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: err.codigo === 'nota_no_encontrada' ? 404 : 500, headers: SIN_CACHE });
      }
      throw err;
    }
  };
}
