// ============================================================
// GET /api/integrations/sendgrid/templates?connection_id=
// Dynamic Templates de la cuenta de SendGrid de la organización.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes bastaba `auth.getSession()` y las
// credenciales salían del `connection_id` o del `organization_id` de la query
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
import { sendgridService } from '@/lib/services/integrations/sendgrid/sendgridService';
import {
  CONECTORES,
  conexionDelProveedor,
  exigirPermiso,
  PERMISO_INTEGRACIONES_VER,
  registrarError,
} from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/sendgrid/templates';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await exigirPermiso(ctx, PERMISO_INTEGRACIONES_VER, RUTA);

    const connectionId = new URL(request.url).searchParams.get('connection_id');
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

    const templates = await sendgridService.getTemplates(credentials, 'dynamic', 50);
    return NextResponse.json({ success: true, templates, count: templates.length });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
});
