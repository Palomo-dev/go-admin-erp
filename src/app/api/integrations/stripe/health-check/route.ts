// ============================================================
// POST /api/integrations/stripe/health-check
// Verifica una llave secreta de Stripe (balance retrieve).
//
// Body: { connection_id } — conexión guardada de la organización de la sesión.
// Body: { secret_key } — prueba de una llave todavía SIN guardar (asistente de
//   nueva conexión). Solo se prueba contra Stripe: no se guarda ni se usa para
//   nada más.
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
import { stripeClientService } from '@/lib/services/integrations/stripe';
import { CONECTORES, conexionDelProveedor, registrarError, textoDe } from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/stripe/health-check';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });

    let secretKey = '';
    if (body.connection_id != null && body.connection_id !== '') {
      const conexion = await conexionDelProveedor(ctx, body.connection_id, CONECTORES.stripe, RUTA);
      const credentials = await stripeClientService.getCredentials(conexion.id, getServiceClient());
      if (!credentials?.secretKey) {
        return NextResponse.json({ valid: false, message: 'La conexión no tiene llave secreta activa' });
      }
      secretKey = credentials.secretKey;
    } else {
      secretKey = textoDe(body.secret_key);
    }

    if (!secretKey) {
      return NextResponse.json({ error: 'Se requiere connection_id o secret_key' }, { status: 400 });
    }

    const result = await stripeClientService.healthCheck(secretKey);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ valid: false, message: 'Error al verificar' }, { status: 500 });
  }
}, { admin: true });
