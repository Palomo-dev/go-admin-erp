// ============================================================
// POST /api/integrations/payu/create-payment
// Crea una transacción en PayU con la conexión de la organización.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes solo comprobaba `auth.getSession()`
// y cobraba con el `connection_id` del body (cualquier organización). Ahora:
// sesión validada (`withOrg`), organización ajena en body o query → 403 y
// registro, permiso de cobro resuelto en el servidor y la conexión tiene que
// ser de la organización y de PayU (404 si no). Credenciales de la conexión.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { payuService } from '@/lib/services/integrations/payu';
import type { PayUTransaction } from '@/lib/services/integrations/payu';
import { detectEnvironment } from '@/lib/services/integrations/payu/payuConfig';
import {
  CONECTORES,
  conexionDelProveedor,
  exigirPermiso,
  PERMISO_COBRO,
  registrarError,
} from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/payu/create-payment';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    await exigirPermiso(ctx, PERMISO_COBRO, RUTA);

    const transaction = body.transaction;
    if (!transaction || typeof transaction !== 'object' || Array.isArray(transaction)) {
      return NextResponse.json({ error: 'transaction es requerido' }, { status: 400 });
    }

    const conexion = await conexionDelProveedor(ctx, body.connection_id, CONECTORES.payu, RUTA);
    const credentials = await payuService.getCredentials(conexion.id, getServiceClient());
    if (!credentials?.apiKey || !credentials?.apiLogin) {
      return NextResponse.json(
        { error: 'La conexión de PayU no tiene credenciales activas', code: 'CREDENCIALES_NO_CONFIGURADAS' },
        { status: 412 },
      );
    }

    const isTest = detectEnvironment(credentials.merchantId) === 'sandbox';
    const result = await payuService.createPayment(credentials, transaction as PayUTransaction, isTest);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ error: 'Error al crear el pago' }, { status: 500 });
  }
});
