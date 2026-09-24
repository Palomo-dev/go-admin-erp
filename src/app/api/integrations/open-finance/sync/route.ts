// ============================================================
// /api/integrations/open-finance/sync
// Sincronizacion manual de transacciones Open Finance de la organizacion
// POST - sincroniza un link de la organizacion o todos sus links activos
// Body: { linkId?: string; dateFrom?: string; dateTo?: string }
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria §1.4): sin `linkId` ni
// `organizationId` sincronizaba TODOS los tenants, y con `linkId` cualquier
// link. Ahora: organizacion de la sesion (`withOrg`), organizacion ajena en el
// body → 403 (`readOrgBody`), `finance.create`, el link tiene que ser de la
// organizacion (404) y «todos» significa todos los de ESTA organizacion. La
// sincronizacion de todos los tenants queda solo para el cron.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import { transactionSyncService } from '@/lib/services/integrations/openFinance/transactionSyncService';
import { linkDeLaOrganizacion } from '@/lib/services/integrations/openFinance/seguridadRutas';

const RUTA = 'open-finance/sync';

interface SyncRequestBody {
  linkId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<SyncRequestBody>(ctx, request, { route: RUTA });
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA);
    const { linkId, dateFrom, dateTo } = body;

    if (linkId) {
      await linkDeLaOrganizacion(ctx, linkId);
      const stats = await transactionSyncService.syncTransactions(linkId, undefined, dateFrom, dateTo);
      return NextResponse.json({ success: true, mode: 'single', linkId, stats });
    }

    // Todos los links activos de la organizacion de la sesion (nunca de todas).
    const stats = await transactionSyncService.syncAllLinks(ctx.organizationId);
    return NextResponse.json({ success: true, mode: 'all', stats });
  } catch (error) {
    return routeErrorResponse('Open Finance Sync POST', error);
  }
});
