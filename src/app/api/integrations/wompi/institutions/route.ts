// ============================================================
// GET /api/integrations/wompi/institutions?connectionId=
// Instituciones financieras PSE (proxy con la conexión de la organización).
//
// SEGURIDAD (GO-sec, 2026-09-24): antes bastaba `auth.getSession()` y leía
// las credenciales de cualquier `connectionId`. Ahora sesión validada
// (`withOrg`), organización ajena en la query → 403 y registro, permiso de
// cobro y la conexión tiene que ser de la organización y de Wompi (404).
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { wompiService } from '@/lib/services/integrations/wompi/wompiService';
import {
  CONECTORES,
  conexionDelProveedor,
  exigirPermiso,
  PERMISO_COBRO,
  registrarError,
} from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/wompi/institutions';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await exigirPermiso(ctx, PERMISO_COBRO, RUTA);

    const connectionId = new URL(request.url).searchParams.get('connectionId');
    const conexion = await conexionDelProveedor(ctx, connectionId, CONECTORES.wompi, RUTA);
    const credentials = await wompiService.getCredentials(conexion.id, getServiceClient());
    if (!credentials) {
      return NextResponse.json(
        { error: 'La conexión de Wompi no tiene credenciales activas', code: 'CREDENCIALES_NO_CONFIGURADAS' },
        { status: 412 },
      );
    }

    const result = await wompiService.getPSEInstitutions(credentials);
    if (!result) {
      return NextResponse.json({ error: 'Error obteniendo instituciones PSE' }, { status: 502 });
    }
    return NextResponse.json({ institutions: result.data });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
});
