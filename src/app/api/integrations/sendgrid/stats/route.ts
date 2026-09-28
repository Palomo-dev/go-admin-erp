// ============================================================
// GET /api/integrations/sendgrid/stats?connectionId=&startDate=&endDate=
// Estadísticas de envío de la cuenta de SendGrid de la organización.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes bastaba `auth.getSession()` y las
// credenciales salían del `connectionId` o del `organizationId` de la query
// (cualquier organización). Ahora sesión validada (`withOrg`), organización
// ajena en la query → 403 y registro, permiso `integrations.view` y la
// conexión (si viene) tiene que ser de la organización (404); sin ella se usa
// la conexión SendGrid de la organización de la sesión.
//
// Fechas: el rango por defecto (últimos 7 días) se calcula en la zona horaria
// de la organización, no con el día UTC de `toISOString()`.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { sendgridService } from '@/lib/services/integrations/sendgrid';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { toPlainDate } from '@/lib/utils/dateDisplay';
import {
  CONECTORES,
  conexionDelProveedor,
  exigirPermiso,
  PERMISO_INTEGRACIONES_VER,
  registrarError,
} from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/sendgrid/stats';
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await exigirPermiso(ctx, PERMISO_INTEGRACIONES_VER, RUTA);

    const searchParams = new URL(request.url).searchParams;
    const connectionId = searchParams.get('connectionId');
    const startDate = searchParams.get('startDate'); // YYYY-MM-DD
    const endDate = searchParams.get('endDate'); // YYYY-MM-DD
    if ((startDate && !FECHA_RE.test(startDate)) || (endDate && !FECHA_RE.test(endDate))) {
      return NextResponse.json({ error: 'startDate y endDate deben tener formato YYYY-MM-DD' }, { status: 400 });
    }

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

    // Default: últimos 7 días en la zona de la organización
    let start = startDate;
    if (!start) {
      const tz = await getOrganizationTimezone(ctx.organizationId, ctx.supabase);
      start = toPlainDate(new Date(Date.now() - SIETE_DIAS_MS), tz);
    }

    const stats = await sendgridService.getStats(credentials, start, endDate || undefined);
    return NextResponse.json({ success: true, stats });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
});
