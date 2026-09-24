// ============================================================
// /api/integrations/open-finance/sync-status
// Estado de sincronizacion de un link de la organizacion
// GET - (query: ?linkId=xxx)
//
// SEGURIDAD (GO-sec, 2026-09-23): el link tiene que ser de la organizacion
// de la sesion (404 si no); ver `openFinance/seguridadRutas.ts`.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { transactionSyncService } from '@/lib/services/integrations/openFinance/transactionSyncService';
import { linkDeLaOrganizacion } from '@/lib/services/integrations/openFinance/seguridadRutas';

const RUTA = 'open-finance/sync-status';

export const GET = withOrg(async (ctx, request) => {
  try {
    await readOrgBody(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.VER, RUTA);

    const linkId = new URL(request.url).searchParams.get('linkId');
    if (!linkId) {
      return NextResponse.json({ error: 'linkId es requerido' }, { status: 400 });
    }
    await linkDeLaOrganizacion(ctx, linkId);

    const status = await transactionSyncService.getSyncStatus(linkId);
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    return routeErrorResponse('Open Finance Sync Status GET', error);
  }
});
