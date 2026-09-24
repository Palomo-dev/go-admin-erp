// ============================================================
// GET /api/integrations/payu/payment-methods?connection_id=
// Métodos de pago disponibles en la cuenta de PayU de la organización.
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
import { payuService } from '@/lib/services/integrations/payu';
import { detectEnvironment } from '@/lib/services/integrations/payu/payuConfig';
import {
  CONECTORES,
  conexionDelProveedor,
  exigirPermiso,
  PERMISO_COBRO,
  registrarError,
} from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/payu/payment-methods';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await exigirPermiso(ctx, PERMISO_COBRO, RUTA);

    const connectionId = new URL(request.url).searchParams.get('connection_id');
    const conexion = await conexionDelProveedor(ctx, connectionId, CONECTORES.payu, RUTA);
    const credentials = await payuService.getCredentials(conexion.id, getServiceClient());
    if (!credentials?.apiKey || !credentials?.apiLogin) {
      return NextResponse.json(
        { error: 'La conexión de PayU no tiene credenciales activas', code: 'CREDENCIALES_NO_CONFIGURADAS' },
        { status: 412 },
      );
    }

    const isTest = detectEnvironment(credentials.merchantId) === 'sandbox';
    const result = await payuService.getPaymentMethods(credentials, isTest);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ error: 'Error al obtener métodos de pago' }, { status: 500 });
  }
});
