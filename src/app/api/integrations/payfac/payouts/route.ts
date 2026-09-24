// ============================================================
// /api/integrations/payfac/payouts
// Dispersiones de fondos a organizaciones
// GET  - lista payouts: la plataforma, todos (o ?organizationId=);
//        una organizacion, solo los suyos (query: ?status=xxx&limit=100)
// POST - crea payout: SOLO administradores de plataforma
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria de integraciones §2.4):
// - POST no verificaba NINGUN rol y tomaba la organizacion del body: cualquier
//   usuario con sesion creaba payouts de cualquier organizacion. Crear una
//   dispersion es una operacion de la plataforma (Modelo B): ahora exige admin
//   de plataforma verificado con `fn_is_platform_admin()` (antes se consultaba
//   `platform_admins` con el cliente del usuario, que por RLS sin politicas
//   nunca devolvia filas). La organizacion del body es la DESTINATARIA que
//   elige la plataforma, no la del usuario.
// - GET con `?organizationId=` leia payouts ajenos: ahora ver `alcance.ts`.
// ============================================================

import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/security/platformAdmin';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { payoutService } from '@/lib/services/integrations/payfac';
import type { PayoutStatus } from '@/lib/services/integrations/payfac';
import type { PayoutMethod } from '@/lib/services/integrations/payfac/payoutService';
import { organizacionDelAlcance, resolverAlcancePayfac } from '@/lib/services/integrations/payfac/alcance';

const RUTA = 'payfac/payouts';
const ESTADOS: PayoutStatus[] = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
const METODOS: PayoutMethod[] = ['breb', 'ach', 'manual', 'mono_turbo'];

// GET - lista payouts con filtros opcionales
export async function GET(request: Request) {
  try {
    const alcance = await resolverAlcancePayfac(request, RUTA);

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status') ?? undefined;
    const status = statusParam && ESTADOS.includes(statusParam as PayoutStatus) ? (statusParam as PayoutStatus) : undefined;
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') ?? '100', 10) || 100));

    const payouts = await payoutService.list(null, {
      organizationId: organizacionDelAlcance(alcance),
      status,
      limit,
    });

    return NextResponse.json({ success: true, data: payouts });
  } catch (error) {
    return routeErrorResponse('PayFac Payouts GET', error);
  }
}

// POST - crea un payout para una organizacion (solo plataforma)
export const POST = withPlatformAdmin(async (admin, request) => {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const {
      organizationId,
      providerCode,
      periodStart,
      periodEnd,
      payoutMethod,
      bankAccountId,
    } = body;

    if (!organizationId || !providerCode || !periodStart || !periodEnd) {
      return NextResponse.json(
        { error: 'organizationId, providerCode, periodStart y periodEnd son requeridos' },
        { status: 400 },
      );
    }

    const orgIdNum = Number(organizationId);
    if (!Number.isInteger(orgIdNum) || orgIdNum <= 0) {
      return NextResponse.json({ error: 'organizationId no valido' }, { status: 400 });
    }

    const metodo = typeof payoutMethod === 'string' && METODOS.includes(payoutMethod as PayoutMethod)
      ? (payoutMethod as PayoutMethod)
      : undefined;
    const cuenta = bankAccountId === undefined || bankAccountId === null || bankAccountId === ''
      ? undefined
      : Number(bankAccountId);
    if (cuenta !== undefined && (!Number.isInteger(cuenta) || cuenta <= 0)) {
      return NextResponse.json({ error: 'bankAccountId no valido' }, { status: 400 });
    }

    console.info(`[${RUTA}] payout solicitado por la plataforma`, { adminUserId: admin.userId, organizationId: orgIdNum });

    const payout = await payoutService.create(
      null,
      {
        organizationId: orgIdNum,
        providerCode: String(providerCode),
        periodStart: String(periodStart),
        periodEnd: String(periodEnd),
        payoutMethod: metodo,
        bankAccountId: cuenta,
      },
      admin.userId,
    );

    if (!payout.success) {
      return NextResponse.json({ error: payout.error ?? 'No se pudo crear el payout' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: payout }, { status: 201 });
  } catch (error) {
    return routeErrorResponse('PayFac Payouts POST', error);
  }
});
