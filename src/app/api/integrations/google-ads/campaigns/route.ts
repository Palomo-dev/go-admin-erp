// ============================================================
// GET /api/integrations/google-ads/campaigns?connection_id=&date_from=&date_to=
// Métricas de campañas de la cuenta de Google Ads de la organización.
//
// SEGURIDAD (GO-sec, 2026-09-24): antes NO tenía autenticación en el handler
// y leía las métricas de cualquier `connection_id` con service role. Ahora
// sesión validada (`withOrg`), organización ajena en la query → 403 y
// registro, permiso `integrations.view` y la conexión tiene que ser
// `google_ads` de la organización (404 si no).
//
// Fechas: el rango por defecto (últimos 30 días) se calcula en la zona
// horaria de la organización, no con el día UTC de `toISOString()`.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { googleAdsService } from '@/lib/services/integrations/google-ads';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { toPlainDate } from '@/lib/utils/dateDisplay';
import {
  CONECTORES,
  conexionDelProveedor,
  exigirPermiso,
  PERMISO_INTEGRACIONES_VER,
  registrarError,
} from '@/lib/services/integrations/accesoIntegraciones';

const RUTA = '/api/integrations/google-ads/campaigns';
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const TREINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await exigirPermiso(ctx, PERMISO_INTEGRACIONES_VER, RUTA);

    const searchParams = new URL(request.url).searchParams;
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    if ((dateFrom && !FECHA_RE.test(dateFrom)) || (dateTo && !FECHA_RE.test(dateTo))) {
      return NextResponse.json({ error: 'date_from y date_to deben tener formato YYYY-MM-DD' }, { status: 400 });
    }

    const conexion = await conexionDelProveedor(ctx, searchParams.get('connection_id'), CONECTORES.googleAds, RUTA);

    // Fechas por defecto: últimos 30 días en la zona de la organización
    let from = dateFrom;
    let to = dateTo;
    if (!from || !to) {
      const tz = await getOrganizationTimezone(ctx.organizationId, ctx.supabase);
      from = from || toPlainDate(new Date(Date.now() - TREINTA_DIAS_MS), tz);
      to = to || toPlainDate(new Date(), tz);
    }

    const campaigns = await googleAdsService.getCampaignMetrics(conexion.id, from, to);
    return NextResponse.json({ campaigns, dateFrom: from, dateTo: to, count: campaigns.length });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    registrarError(RUTA, err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
});
