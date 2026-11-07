// ============================================================
// /api/integrations/payfac/payout-accounts/[id]
// Desactiva una cuenta de dispersion de la organizacion de la sesion
// DELETE - desactiva cuenta (409 si es la unica verificada con dispersiones pendientes)
//
// SEGURIDAD (GO-sec, 2026-09-23): antes desactivaba la cuenta de CUALQUIER
// organizacion (service role, sin organizacion ni permiso). Ahora: `withOrg`,
// `readOrgBody`, permiso `finance.approve` y la cuenta tiene que ser de la
// organizacion de la sesion (404 si no).
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { assertRecordOfOrg, PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { payoutService } from '@/lib/services/integrations/payfac';
import { UNICA_VERIFICADA_CON_PENDIENTES } from '@/lib/services/integrations/payfac/cuentaAbonoReglas';

const RUTA = 'payfac/payout-accounts/[id]';

// DELETE - desactiva cuenta de dispersion por id
export const DELETE = withOrg(async (ctx, request, routeParams) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.APROBAR, RUTA);

    const params = routeParams ? await routeParams.params : {};
    const id = typeof params.id === 'string' ? params.id : '';
    if (!id) {
      return NextResponse.json(
        { error: 'ID de cuenta requerido' },
        { status: 400 },
      );
    }

    await assertRecordOfOrg(ctx, 'organization_payout_accounts', id, 'Cuenta de dispersion no encontrada');

    const result = await payoutService.deactivateAccount(ctx.supabase, id);
    // Finanzas ronda 2, A9: la unica cuenta verificada no se quita con dispersiones pendientes.
    if (result.codigo === UNICA_VERIFICADA_CON_PENDIENTES) {
      return NextResponse.json(
        {
          error: 'Es la unica cuenta verificada y hay dispersiones pendientes: agrega y verifica otra antes de quitarla',
          code: UNICA_VERIFICADA_CON_PENDIENTES,
        },
        { status: 409 },
      );
    }
    if (!result.success) {
      return NextResponse.json({ error: 'No se pudo desactivar la cuenta' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return routeErrorResponse('PayFac Payout Accounts DELETE', error);
  }
});
