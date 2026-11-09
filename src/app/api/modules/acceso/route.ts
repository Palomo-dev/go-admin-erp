/**
 * GET /api/modules/acceso?ruta=/app/pos — por qué la sesión no puede usar esa
 * ruta y quién lo resuelve (docs/design/MODULO-NO-HABILITADO.md §5.3).
 *
 * La organización sale de la sesión (`withOrg`); la causa, `puedeResolver` y los
 * datos de plan los calcula `resolverAccesoModulo` en el servidor. Cualquier
 * miembro activo puede preguntar por SU acceso: la respuesta solo trae lo que
 * su papel debe ver (sin precios ni planes para quien no resuelve).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { resolverAccesoModulo, rutaValida } from '@/lib/organizacion/accesoModulo.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const GET = withOrg(async (ctx, req) => {
  const ruta = rutaValida(new URL(req.url).searchParams.get('ruta'));
  if (!ruta) return NextResponse.json({ error: 'ruta inválida', code: 'ruta_invalida' }, { status: 400, headers: SIN_CACHE });
  try {
    const acceso = await resolverAccesoModulo(ctx, ruta);
    return NextResponse.json({ acceso }, { headers: SIN_CACHE });
  } catch (err) {
    console.error('[api/modules/acceso]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'No se pudo resolver el acceso', code: 'error' }, { status: 500, headers: SIN_CACHE });
  }
});
