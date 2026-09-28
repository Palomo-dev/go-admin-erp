// ============================================================
// /api/integrations/open-finance/real-balance
// Saldos en tiempo real de cuentas bancarias de la organizacion
// GET - saldo real de una cuenta (?bankAccountId=xxx)
//       o de todas las cuentas de la organizacion de la sesion (sin parametros)
//
// SEGURIDAD (GO-sec, 2026-09-23): antes cualquier `bankAccountId` u
// `organizationId` (y escribia `last_balance` en cuentas ajenas). Ahora la
// cuenta tiene que ser de la organizacion de la sesion (404) y un
// `?organizationId=` ajeno responde 403.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { balanceService } from '@/lib/services/integrations/openFinance/balanceService';
import { cuentaBancariaDeLaOrganizacion } from '@/lib/services/integrations/openFinance/seguridadRutas';

const RUTA = 'open-finance/real-balance';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const bankAccountIdParam = new URL(request.url).searchParams.get('bankAccountId');

    if (bankAccountIdParam) {
      const bankAccountId = Number(bankAccountIdParam);
      if (!Number.isInteger(bankAccountId) || bankAccountId <= 0) {
        return NextResponse.json({ error: 'bankAccountId debe ser un numero valido' }, { status: 400 });
      }
      await cuentaBancariaDeLaOrganizacion(ctx, bankAccountId);
      const balance = await balanceService.getRealTimeBalance(bankAccountId);
      return NextResponse.json({ success: true, data: balance });
    }

    const balances = await balanceService.getRealTimeBalances(ctx.organizationId);
    return NextResponse.json({ success: true, data: balances });
  } catch (error) {
    return routeErrorResponse('Open Finance Real Balance GET', error);
  }
});
