// ============================================================
// POST /api/integrations/tiktok/health-check
// Verifica que un access_token y advertiser_id de TikTok sean válidos.
//
// Body: { connection_id } — conexión guardada de la organización de la sesión.
// Body: { access_token, advertiser_id } — prueba de credenciales todavía SIN
//   guardar (asistente de nueva conexión). Solo se prueban contra TikTok: no
//   se guardan ni se usan para nada más.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes no tenía NINGUNA autenticación en el
// handler. Ahora sesión validada + administración (`withOrg({ admin: true })`),
// organización ajena en body o query → 403 y registro, y una conexión ajena →
// 404.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { tiktokMarketingService } from '@/lib/services/integrations/tiktok';
import { CONECTORES, conexionDelProveedor, registrarError, textoDe } from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/tiktok/health-check';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });

    let accessToken: string;
    let advertiserId: string;
    if (body.connection_id != null && body.connection_id !== '') {
      const db = getServiceClient();
      const conexion = await conexionDelProveedor(ctx, body.connection_id, CONECTORES.tiktok, RUTA, db);
      const credentials = await tiktokMarketingService.getCredentials(conexion.id, db);
      accessToken = credentials?.accessToken ?? '';
      advertiserId = credentials?.advertiserId ?? '';
      if (!accessToken || !advertiserId) {
        return NextResponse.json({ valid: false, message: 'La conexión no tiene access_token y advertiser_id' });
      }
    } else {
      accessToken = textoDe(body.access_token);
      advertiserId = textoDe(body.advertiser_id);
      if (!accessToken || !advertiserId) {
        return NextResponse.json({ error: 'Se requieren connection_id o (access_token y advertiser_id)' }, { status: 400 });
      }
    }

    const result = await tiktokMarketingService.healthCheck(accessToken, advertiserId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ valid: false, message: 'Error al verificar' }, { status: 500 });
  }
}, { admin: true });
