// ============================================================
// /api/integrations/payfac/payouts/pending
// Payouts pendientes de dispersion
// GET - plataforma: todos (o ?organizationId=); organizacion: solo los suyos
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria §2.4): con `?organizationId=`
// cualquiera con sesion leia los pendientes de otra organizacion. Ver
// `payfac/alcance.ts`.
// ============================================================

import { NextResponse } from 'next/server';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { payoutService } from '@/lib/services/integrations/payfac';
import { organizacionDelAlcance, resolverAlcancePayfac } from '@/lib/services/integrations/payfac/alcance';

const RUTA = 'payfac/payouts/pending';

export async function GET(request: Request) {
  try {
    const alcance = await resolverAlcancePayfac(request, RUTA);
    const pending = await payoutService.listPending(null, organizacionDelAlcance(alcance));
    return NextResponse.json({ success: true, data: pending });
  } catch (error) {
    return routeErrorResponse('PayFac Payouts Pending GET', error);
  }
}
