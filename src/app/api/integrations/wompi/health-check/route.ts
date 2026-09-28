// ============================================================
// POST /api/integrations/wompi/health-check
// Verifica que las credenciales de una conexión de Wompi sean válidas.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes bastaba `auth.getSession()` y
// cualquier sesión probaba (y marcaba en error) la conexión de otra
// organización con solo conocer su id. Ahora sesión validada + administración
// (`withOrg({ admin: true })`), organización ajena en body o query → 403 y
// registro, y la conexión tiene que ser de la organización y de Wompi (404).
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { wompiService } from '@/lib/services/integrations/wompi/wompiService';
import { CONECTORES, conexionDelProveedor, registrarError } from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/wompi/health-check';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    const conexion = await conexionDelProveedor(ctx, body.connectionId, CONECTORES.wompi, RUTA);
    const result = await wompiService.healthCheck(conexion.id, getServiceClient());
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}, { admin: true });
