// ============================================================
// POST /api/integrations/paypal/capture-order
// Captura una orden de PayPal con la conexión de la organización.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes solo comprobaba `auth.getSession()`,
// capturaba con el `connection_id` del body (cualquier organización) y el
// ambiente lo decidía el cliente. Ahora: sesión validada (`withOrg`),
// organización ajena en body o query → 403 y registro, permiso de cobro
// resuelto en el servidor, la conexión tiene que ser de la organización y de
// PayPal (404 si no) y el ambiente sale de la conexión.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { paypalService } from '@/lib/services/integrations/paypal';
import {
  CONECTORES,
  conexionDelProveedor,
  exigirPermiso,
  PERMISO_COBRO,
  registrarError,
  textoDe,
} from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/paypal/capture-order';
const ORDER_ID_RE = /^[A-Za-z0-9-]{5,64}$/;

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    await exigirPermiso(ctx, PERMISO_COBRO, RUTA);

    const orderId = textoDe(body.order_id);
    if (!ORDER_ID_RE.test(orderId)) {
      return NextResponse.json({ error: 'order_id es requerido' }, { status: 400 });
    }

    const conexion = await conexionDelProveedor(ctx, body.connection_id, CONECTORES.paypal, RUTA);
    const credentials = await paypalService.getCredentials(conexion.id, getServiceClient());
    if (!credentials?.clientId || !credentials?.clientSecret) {
      return NextResponse.json(
        { error: 'La conexión de PayPal no tiene credenciales activas', code: 'CREDENCIALES_NO_CONFIGURADAS' },
        { status: 412 },
      );
    }

    const result = await paypalService.captureOrder(credentials, orderId, conexion.environment !== 'production');
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ error: 'Error al capturar la orden' }, { status: 500 });
  }
});
