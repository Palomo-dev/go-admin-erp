// ============================================================
// POST /api/integrations/google-ads/health-check
// Verifica la conexión de Google Ads de la organización.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes NO tenía autenticación en el handler
// y probaba cualquier `connection_id` con service role. Ahora sesión validada
// + administración (`withOrg({ admin: true })`), organización ajena en body o
// query → 403 y registro, y la conexión tiene que ser `google_ads` de la
// organización (404 si no).
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { googleAdsService } from '@/lib/services/integrations/google-ads';
import { CONECTORES, conexionDelProveedor, registrarError } from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/google-ads/health-check';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    const conexion = await conexionDelProveedor(ctx, body.connection_id, CONECTORES.googleAds, RUTA);
    const result = await googleAdsService.healthCheck(conexion.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ valid: false, message: 'Error interno' }, { status: 500 });
  }
}, { admin: true });
