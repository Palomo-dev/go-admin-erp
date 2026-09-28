// ============================================================
// /api/integrations/payfac/payouts/[id]
// Un payout individual con sus items
// GET  - obtiene payout con items (plataforma: cualquiera; organizacion: el suyo)
// POST - procesa o cancela payout (body: { action, reason? }) — solo plataforma
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria §2.4): GET devolvia el payout de
// cualquier organizacion por id. Ahora una organizacion solo ve los suyos
// (404 si no) y el admin de plataforma se verifica con `fn_is_platform_admin()`.
// ============================================================

import { NextResponse } from 'next/server';
import { OrgContextError } from '@/lib/utils/orgContext';
import { withPlatformAdmin } from '@/lib/security/platformAdmin';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { payoutService } from '@/lib/services/integrations/payfac';
import { resolverAlcancePayfac } from '@/lib/services/integrations/payfac/alcance';

const RUTA = 'payfac/payouts/[id]';

type RouteParams = { params: Promise<Record<string, string | string[] | undefined>> };

async function idDeLaRuta(routeParams?: RouteParams): Promise<string> {
  const params = routeParams ? await routeParams.params : {};
  return typeof params.id === 'string' ? params.id : '';
}

// GET - obtiene payout con items
export async function GET(request: Request, routeParams: RouteParams) {
  try {
    const alcance = await resolverAlcancePayfac(request, RUTA);

    const id = await idDeLaRuta(routeParams);
    if (!id) {
      return NextResponse.json(
        { error: 'ID de payout requerido' },
        { status: 400 },
      );
    }

    const payout = await payoutService.getById(null, id);

    // Una organizacion no distingue «no existe» de «es de otra».
    if (!payout || (alcance.tipo === 'organizacion' && Number(payout.organization_id) !== alcance.ctx.organizationId)) {
      throw new OrgContextError('Payout no encontrado', 404, 'NOT_FOUND');
    }

    return NextResponse.json({ success: true, data: payout });
  } catch (error) {
    return routeErrorResponse('PayFac Payout GET', error);
  }
}

// POST - procesa o cancela un payout (solo plataforma)
export const POST = withPlatformAdmin(async (admin, request, routeParams) => {
  try {
    const id = await idDeLaRuta(routeParams);
    if (!id) {
      return NextResponse.json(
        { error: 'ID de payout requerido' },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { action?: string; reason?: string };
    const { action, reason } = body;

    if (action !== 'process' && action !== 'cancel') {
      return NextResponse.json(
        { error: "action debe ser 'process' o 'cancel'" },
        { status: 400 },
      );
    }

    console.info(`[${RUTA}] ${action} por la plataforma`, { adminUserId: admin.userId, payoutId: id });
    const result = await payoutService.process(null, id, action, reason);
    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'No se pudo completar la accion' }, { status: 409 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return routeErrorResponse('PayFac Payout POST', error);
  }
});
