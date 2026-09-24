// ============================================================
// GET /api/integrations/mercadopago/payment-methods?connection_id=
// Métodos de pago disponibles en la cuenta de MercadoPago de la organización.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes bastaba `auth.getSession()` y leía
// las credenciales de cualquier `connection_id`. Ahora sesión validada
// (`withOrg`), organización ajena en la query → 403 y registro, permiso de
// cobro y la conexión tiene que ser de la organización (404 si no).
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { mercadopagoService } from '@/lib/services/integrations/mercadopago';
import {
  CONECTORES,
  conexionDelProveedor,
  exigirPermiso,
  PERMISO_COBRO,
  registrarError,
} from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/mercadopago/payment-methods';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await exigirPermiso(ctx, PERMISO_COBRO, RUTA);

    const connectionId = new URL(request.url).searchParams.get('connection_id');
    const conexion = await conexionDelProveedor(ctx, connectionId, CONECTORES.mercadopago, RUTA);
    const credentials = await mercadopagoService.getCredentials(conexion.id, getServiceClient());
    if (!credentials?.accessToken) {
      return NextResponse.json(
        { error: 'La conexión de MercadoPago no tiene credenciales activas', code: 'CREDENCIALES_NO_CONFIGURADAS' },
        { status: 412 },
      );
    }

    const methods = await mercadopagoService.getPaymentMethods(credentials.accessToken);
    return NextResponse.json({ success: true, data: methods });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ error: 'Error al obtener métodos de pago' }, { status: 500 });
  }
});
