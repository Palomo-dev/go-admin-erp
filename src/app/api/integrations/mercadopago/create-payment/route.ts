// ============================================================
// POST /api/integrations/mercadopago/create-payment
// Crea un pago en MercadoPago con la conexión de la organización.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes solo comprobaba `auth.getSession()`
// y cobraba con el `connection_id` del body: cualquier sesión usaba la cuenta
// de MercadoPago de otra organización. Ahora: sesión validada (`withOrg`),
// organización ajena en body o query → 403 y registro (`readOrgBody`),
// permiso de cobro resuelto en el servidor y la conexión tiene que ser de la
// organización y de MercadoPago (404 si no). Las credenciales salen de la
// conexión, nunca del body. Ver `accesoIntegraciones.ts`.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { mercadopagoService } from '@/lib/services/integrations/mercadopago';
import type { CreatePaymentRequest } from '@/lib/services/integrations/mercadopago';
import {
  CONECTORES,
  conexionDelProveedor,
  exigirPermiso,
  PERMISO_COBRO,
  registrarError,
} from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/mercadopago/create-payment';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    await exigirPermiso(ctx, PERMISO_COBRO, RUTA);

    const paymentData = body.payment_data;
    if (!paymentData || typeof paymentData !== 'object' || Array.isArray(paymentData)) {
      return NextResponse.json({ error: 'payment_data es requerido' }, { status: 400 });
    }

    const conexion = await conexionDelProveedor(ctx, body.connection_id, CONECTORES.mercadopago, RUTA);
    const credentials = await mercadopagoService.getCredentials(conexion.id, getServiceClient());
    if (!credentials?.accessToken) {
      return NextResponse.json(
        { error: 'La conexión de MercadoPago no tiene credenciales activas', code: 'CREDENCIALES_NO_CONFIGURADAS' },
        { status: 412 },
      );
    }

    const payment = await mercadopagoService.createPayment(credentials.accessToken, paymentData as CreatePaymentRequest);
    return NextResponse.json({ success: true, data: payment });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ error: 'Error al crear el pago' }, { status: 500 });
  }
});
