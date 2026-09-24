/**
 * GET /api/finanzas/permisos — qué puede hacer la persona en facturas de venta,
 * cartera y pagos, en la organización de la sesión. Solo para pintar la
 * interfaz: cada acción la vuelve a exigir su route handler y su RPC.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { resolverPermisosFinanzas } from '@/lib/finanzas/permisosFinanzas.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  const permisos = await resolverPermisosFinanzas(ctx);
  return NextResponse.json(
    { organizationId: ctx.organizationId, userId: ctx.userId, ...permisos },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
});
