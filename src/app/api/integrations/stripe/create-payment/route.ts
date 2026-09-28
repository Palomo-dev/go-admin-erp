// ============================================================
// POST /api/integrations/stripe/create-payment
// Crea un PaymentIntent con la cuenta de Stripe de la organización.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes solo comprobaba `auth.getSession()`
// y cobraba con el `connection_id` del body (cualquier organización). Ahora:
// sesión validada (`withOrg`), organización ajena en body o query → 403 y
// registro, permiso de cobro resuelto en el servidor y la conexión tiene que
// ser de la organización y de Stripe (404 si no). La llave secreta sale de la
// conexión, nunca del body.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { stripeClientService } from '@/lib/services/integrations/stripe';
import type { CreatePaymentIntentParams } from '@/lib/services/integrations/stripe';
import {
  CONECTORES,
  conexionDelProveedor,
  exigirPermiso,
  parametrosDelProveedor,
  PERMISO_COBRO,
  registrarError,
} from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/stripe/create-payment';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    await exigirPermiso(ctx, PERMISO_COBRO, RUTA);

    const params = parametrosDelProveedor(body) as unknown as CreatePaymentIntentParams;
    if (!Number.isInteger(params.amount) || params.amount <= 0 || typeof params.currency !== 'string' || !params.currency) {
      return NextResponse.json({ error: 'amount (entero positivo, en centavos) y currency son requeridos' }, { status: 400 });
    }

    const conexion = await conexionDelProveedor(ctx, body.connection_id, CONECTORES.stripe, RUTA);
    const credentials = await stripeClientService.getCredentials(conexion.id, getServiceClient());
    if (!credentials?.secretKey) {
      return NextResponse.json(
        { error: 'La conexión de Stripe no tiene credenciales activas', code: 'CREDENCIALES_NO_CONFIGURADAS' },
        { status: 412 },
      );
    }

    const result = await stripeClientService.createPaymentIntent(credentials.secretKey, params);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ error: 'Error al crear el pago' }, { status: 500 });
  }
});
