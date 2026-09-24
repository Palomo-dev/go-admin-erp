/**
 * GET /api/pos/ventas/permisos — qué acciones del listado de ventas puede usar
 * la persona en la organización de la sesión (`withOrg`). Solo decide qué se
 * muestra habilitado: cada RPC vuelve a comprobar su permiso.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { resolverPermisosVentas } from '@/lib/pos/ventas/permisosVentas';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  const permisos = await resolverPermisosVentas(ctx);
  return NextResponse.json(permisos, { headers: { 'Cache-Control': 'private, no-store' } });
});
