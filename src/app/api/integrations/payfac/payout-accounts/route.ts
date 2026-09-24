// ============================================================
// /api/integrations/payfac/payout-accounts
// Cuentas de dispersion de la organizacion de la sesion
// GET  - lista cuentas de dispersion (datos bancarios enmascarados)
// POST - crea cuenta de dispersion
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria de integraciones §2.4): antes la
// organizacion salia de `?organizationId=` / del body, sin permiso y con
// service role: cualquiera con sesion leia numero de cuenta y documento del
// titular de otra organizacion, o REGISTRABA SU PROPIA CUENTA como destino de
// dispersion de otra. Ahora: `withOrg` (organizacion de la sesion),
// `readOrgBody` (organizacion ajena en body o query → 403 y registro), permiso
// `finance.view` / `finance.approve` resuelto en el servidor, y la cuenta
// contable vinculada tiene que ser de la organizacion (404 si no).
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { assertRecordOfOrg, PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { payoutService } from '@/lib/services/integrations/payfac';
import { enmascararCuentaDispersion } from '@/lib/services/integrations/payfac/enmascarar';

const RUTA = 'payfac/payout-accounts';

// GET - lista cuentas de dispersion de la organizacion de la sesion
export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const accounts = await payoutService.listAccounts(ctx.supabase, ctx.organizationId);

    return NextResponse.json({ success: true, data: accounts.map(enmascararCuentaDispersion) });
  } catch (error) {
    return routeErrorResponse('PayFac Payout Accounts GET', error);
  }
});

interface CuentaDispersionBody {
  bankName?: string;
  accountType?: string;
  accountNumber?: string;
  accountHolderName?: string;
  accountHolderId?: string;
  accountHolderIdType?: string;
  brebKeyValue?: string;
  bankAccountId?: number | string;
}

// POST - crea cuenta de dispersion de la organizacion de la sesion
export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<CuentaDispersionBody>(ctx, request, { route: RUTA });
    // Registrar el destino del dinero de la organizacion: permiso de aprobacion.
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.APROBAR, RUTA);

    const {
      bankName,
      accountType,
      accountNumber,
      accountHolderName,
      accountHolderId,
      accountHolderIdType,
      brebKeyValue,
      bankAccountId,
    } = body;

    // Validar campos requeridos
    if (!bankName || !accountType || !accountNumber || !accountHolderName
      || !accountHolderId || !accountHolderIdType) {
      return NextResponse.json(
        {
          error: 'bankName, accountType, accountNumber, accountHolderName, accountHolderId y accountHolderIdType son requeridos',
        },
        { status: 400 },
      );
    }

    // Vinculacion opcional con una cuenta contable: tiene que ser de la organizacion.
    const bankAccountIdNum = bankAccountId ? Number(bankAccountId) : undefined;
    if (bankAccountId !== undefined && bankAccountId !== null && bankAccountId !== '') {
      if (!Number.isInteger(bankAccountIdNum) || (bankAccountIdNum as number) <= 0) {
        return NextResponse.json({ error: 'bankAccountId no valido' }, { status: 400 });
      }
      await assertRecordOfOrg(ctx, 'bank_accounts', bankAccountIdNum as number, 'Cuenta bancaria no encontrada');
    }

    const account = await payoutService.createAccount(
      ctx.supabase,
      {
        bankName,
        accountType,
        accountNumber,
        accountHolderName,
        accountHolderId,
        accountHolderIdType,
        brebKeyValue,
        bankAccountId: bankAccountIdNum,
      },
      ctx.organizationId,
    );

    if (account.error || !account.id) {
      console.error(`[${RUTA}] No se pudo crear la cuenta de dispersion`, { organizationId: ctx.organizationId });
      return NextResponse.json({ error: 'No se pudo crear la cuenta de dispersion' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { id: account.id } }, { status: 201 });
  } catch (error) {
    return routeErrorResponse('PayFac Payout Accounts POST', error);
  }
});
