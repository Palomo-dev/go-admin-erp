/**
 * GET /api/pos/cajas/permisos — qué puede hacer la persona con las cajas del
 * POS en la organización activa (la de la sesión, `withOrg`).
 *
 * Sustituye la deducción en el navegador por el NOMBRE del rol
 * («admin», «owner»…) que hacían /app/pos/cajas y `useBlindCloseMode`
 * (regla dura 6). La barrera real al cerrar es `POST /api/pos/cajas/[id]/cerrar`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { resolverPermisosCaja } from '@/lib/pos/cajas/permisosCaja';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx) => {
  const permisos = await resolverPermisosCaja(ctx);
  return NextResponse.json(
    { organizationId: ctx.organizationId, userId: ctx.userId, ...permisos },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
});
