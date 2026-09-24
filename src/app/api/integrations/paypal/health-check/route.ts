// ============================================================
// POST /api/integrations/paypal/health-check
// Verifica credenciales de PayPal obteniendo un token OAuth.
//
// Body: { connection_id } — conexión guardada de la organización de la sesión
//   (el ambiente sale de la conexión).
// Body: { client_id, client_secret, is_sandbox? } — prueba de credenciales
//   todavía SIN guardar (asistente de nueva conexión). Solo se prueban contra
//   PayPal: no se guardan ni se usan para nada más.
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
import { paypalService } from '@/lib/services/integrations/paypal';
import { CONECTORES, conexionDelProveedor, registrarError, textoDe } from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/paypal/health-check';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });

    let clientId: string;
    let clientSecret: string;
    let isSandbox: boolean;
    if (body.connection_id != null && body.connection_id !== '') {
      const conexion = await conexionDelProveedor(ctx, body.connection_id, CONECTORES.paypal, RUTA);
      const credentials = await paypalService.getCredentials(conexion.id, getServiceClient());
      if (!credentials?.clientId || !credentials?.clientSecret) {
        return NextResponse.json({ valid: false, message: 'La conexión no tiene credenciales activas' });
      }
      clientId = credentials.clientId;
      clientSecret = credentials.clientSecret;
      isSandbox = conexion.environment !== 'production';
    } else {
      clientId = textoDe(body.client_id);
      clientSecret = textoDe(body.client_secret);
      isSandbox = body.is_sandbox !== false;
      if (!clientId || !clientSecret) {
        return NextResponse.json({ error: 'Se requiere connection_id o (client_id y client_secret)' }, { status: 400 });
      }
    }

    const result = await paypalService.healthCheck(clientId, clientSecret, isSandbox);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ valid: false, message: 'Error al verificar' }, { status: 500 });
  }
}, { admin: true });
