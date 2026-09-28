// ============================================================
// GET /api/integrations/sendgrid/bounces?connectionId=&limit=
// Lista de rebotes (emails rebotados) de la cuenta de SendGrid de la
// organización.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes bastaba `auth.getSession()` y las
// credenciales salían del `connectionId` o del `organizationId` de la query
// (cualquier organización). Ahora sesión validada (`withOrg`), organización
// ajena en la query → 403 y registro, permiso `integrations.view` y la
// conexión (si viene) tiene que ser de la organización (404); sin ella se usa
// la conexión SendGrid de la organización de la sesión.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { sendgridService } from '@/lib/services/integrations/sendgrid';
import {
  CONECTORES,
  conexionDelProveedor,
  exigirPermiso,
  PERMISO_INTEGRACIONES_VER,
  registrarError,
} from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/sendgrid/bounces';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await exigirPermiso(ctx, PERMISO_INTEGRACIONES_VER, RUTA);

    const searchParams = new URL(request.url).searchParams;
    const connectionId = searchParams.get('connectionId');
    const limite = Number(searchParams.get('limit') || '50');
    const limit = Number.isInteger(limite) && limite > 0 ? Math.min(limite, 500) : 50;

    const db = getServiceClient();
    const credentials = connectionId
      ? await sendgridService.getCredentials(
          (await conexionDelProveedor(ctx, connectionId, CONECTORES.sendgrid, RUTA, db)).id,
          db,
        )
      : (await sendgridService.getCredentialsByOrganization(ctx.organizationId, db)).credentials;

    if (!credentials) {
      return NextResponse.json({ error: 'No se encontraron credenciales de SendGrid' }, { status: 404 });
    }

    const bounces = await sendgridService.getBounces(credentials, limit);
    return NextResponse.json({ success: true, bounces });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
});
