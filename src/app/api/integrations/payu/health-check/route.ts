// ============================================================
// POST /api/integrations/payu/health-check
// Verifica credenciales de PayU con el comando PING.
//
// Body: { connection_id } — conexión guardada de la organización de la sesión.
// Body: { api_key, api_login, merchant_id?, is_test? } — prueba de credenciales
//   todavía SIN guardar (asistente de nueva conexión). Solo se prueban contra
//   PayU: no se guardan ni se usan para nada más.
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
import { payuService } from '@/lib/services/integrations/payu';
import type { PayUCredentials } from '@/lib/services/integrations/payu';
import { detectEnvironment } from '@/lib/services/integrations/payu/payuConfig';
import { CONECTORES, conexionDelProveedor, registrarError, textoDe } from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/payu/health-check';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });

    let credentials: PayUCredentials;
    let isTest: boolean;
    if (body.connection_id != null && body.connection_id !== '') {
      const conexion = await conexionDelProveedor(ctx, body.connection_id, CONECTORES.payu, RUTA);
      const guardadas = await payuService.getCredentials(conexion.id, getServiceClient());
      if (!guardadas?.apiKey || !guardadas?.apiLogin) {
        return NextResponse.json({ valid: false, message: 'La conexión no tiene credenciales activas' });
      }
      credentials = guardadas;
      isTest = detectEnvironment(guardadas.merchantId) === 'sandbox';
    } else {
      const apiKey = textoDe(body.api_key);
      const apiLogin = textoDe(body.api_login);
      if (!apiKey || !apiLogin) {
        return NextResponse.json({ error: 'Se requiere connection_id o (api_key y api_login)' }, { status: 400 });
      }
      credentials = { apiKey, apiLogin, merchantId: textoDe(body.merchant_id), accountId: '' };
      isTest = body.is_test === true;
    }

    const result = await payuService.healthCheck(credentials, isTest);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ valid: false, message: 'Error al verificar' }, { status: 500 });
  }
}, { admin: true });
