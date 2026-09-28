// ============================================================
// /api/integrations/payfac/payouts/summary
// Totales de dispersion de una organizacion
// GET - organizacion: la de la sesion; plataforma: ?organizationId= obligatorio
//       totalCollected, totalCommission, totalDispersed, pendingDispersal
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria §2.4): con `?organizationId=`
// cualquiera con sesion leia el resumen de otra organizacion. Ver
// `payfac/alcance.ts`.
// ============================================================

import { NextResponse } from 'next/server';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { payoutService } from '@/lib/services/integrations/payfac';
import { organizacionDelAlcance, resolverAlcancePayfac } from '@/lib/services/integrations/payfac/alcance';

const RUTA = 'payfac/payouts/summary';

export async function GET(request: Request) {
  try {
    const alcance = await resolverAlcancePayfac(request, RUTA);
    const organizationId = organizacionDelAlcance(alcance);
    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId es requerido' }, { status: 400 });
    }

    const summary = await payoutService.getSummary(null, organizationId);
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    return routeErrorResponse('PayFac Payouts Summary GET', error);
  }
}
