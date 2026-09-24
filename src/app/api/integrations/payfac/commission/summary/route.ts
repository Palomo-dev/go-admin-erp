// ============================================================
// /api/integrations/payfac/commission/summary
// Resume comisiones por organizacion con totales recaudados — SOLO plataforma
// GET - lista organizaciones con comisiones y totales
//
// SEGURIDAD (GO-sec, 2026-09-23): admin de plataforma verificado con
// `fn_is_platform_admin()` (ver `@/lib/security/platformAdmin`).
// ============================================================

import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/security/platformAdmin';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { commissionService } from '@/lib/services/integrations/payfac';

export const GET = withPlatformAdmin(async () => {
  try {
    const summary = await commissionService.getSummary(null);
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    return routeErrorResponse('PayFac Commission Summary GET', error);
  }
});
