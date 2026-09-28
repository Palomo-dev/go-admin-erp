/**
 * GET /api/pos/cajas/permisos — qué puede hacer la persona con las cajas del
 * POS en la organización activa (la de la sesión, `withOrg`).
 *
 * Sustituye la deducción en el navegador por el NOMBRE del rol
 * («admin», «owner»…) que hacían /app/pos/cajas y `useBlindCloseMode`
 * (regla dura 6). La barrera real al cerrar es `POST /api/pos/cajas/[id]/cerrar`
 * (y `pos_caja_cerrar` en la base).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { organizacionUsaCierreCiego, resolverPermisosCaja } from '@/lib/pos/cajas/permisosCaja';
import { visibilidadImportes } from '@/lib/pos/cajas/cierreCiego';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  const [permisos, cierreCiego] = await Promise.all([resolverPermisosCaja(ctx), organizacionUsaCierreCiego(ctx)]);
  return NextResponse.json(
    {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      ...permisos,
      cierreCiego,
      verImportes: visibilidadImportes(cierreCiego, permisos.verEsperadoEnCierreCiego),
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
});
