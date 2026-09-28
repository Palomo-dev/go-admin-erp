// ============================================================
// POST /api/integrations/meta/health-check
// Verifica un Access Token de Meta Marketing.
//
// Body: { connection_id } — conexión guardada de la organización de la sesión.
// Body: { access_token, app_secret? } — prueba de un token todavía SIN guardar
//   (asistente de nueva conexión). Solo se prueba contra Meta: no se guarda ni
//   se usa para nada más.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes bastaba `auth.getSession()`. Ahora
// sesión validada + administración (`withOrg({ admin: true })`), organización
// ajena en body o query → 403 y registro, y una conexión ajena → 404.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { metaMarketingService } from '@/lib/services/integrations/meta';
import { CONECTORES, conexionDelProveedor, registrarError, textoDe } from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/meta/health-check';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });

    let accessToken: string;
    let appSecret: string;
    if (body.connection_id != null && body.connection_id !== '') {
      const db = getServiceClient();
      const conexion = await conexionDelProveedor(ctx, body.connection_id, CONECTORES.meta, RUTA, db);
      const credentials = await metaMarketingService.getCredentials(conexion.id, db);
      if (!credentials?.accessToken) {
        return NextResponse.json({ valid: false, message: 'La conexión no tiene Access Token activo' });
      }
      accessToken = credentials.accessToken;
      appSecret = credentials.appSecret || '';
    } else {
      accessToken = textoDe(body.access_token);
      appSecret = textoDe(body.app_secret);
    }

    if (!accessToken) {
      return NextResponse.json({ error: 'Se requiere connection_id o access_token' }, { status: 400 });
    }

    const result = await metaMarketingService.healthCheck(accessToken, appSecret);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ valid: false, message: 'Error al verificar' }, { status: 500 });
  }
}, { admin: true });
