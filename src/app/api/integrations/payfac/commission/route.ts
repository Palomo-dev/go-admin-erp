// ============================================================
// /api/integrations/payfac/commission
// Comisiones de organizaciones por proveedor — SOLO plataforma
// GET  - lista comisiones (query: ?organizationId=xxx opcional)
// POST - crea o actualiza comision de una organizacion
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria §2.4): la verificacion de admin
// consultaba `platform_admins` con el cliente del usuario; con RLS activa y sin
// politicas nunca devolvia filas (403 para todos, incluso la plataforma).
// Ahora `withPlatformAdmin` → `fn_is_platform_admin()` (SECURITY DEFINER,
// `auth.uid()` de la sesion). La organizacion del body es la organizacion
// cliente a la que la plataforma le fija la tarifa, no la del usuario.
// ============================================================

import { NextResponse } from 'next/server';
import { withPlatformAdmin } from '@/lib/security/platformAdmin';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { commissionService } from '@/lib/services/integrations/payfac';

const TIPOS = ['percentage', 'fixed_amount'] as const;
type TipoComision = (typeof TIPOS)[number];

// GET - lista comisiones, opcionalmente filtradas por organizacion
export const GET = withPlatformAdmin(async (_admin, request) => {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');
    const orgIdNum = organizationId ? Number(organizationId) : undefined;

    const commissions = await commissionService.list(null, orgIdNum && orgIdNum > 0 ? orgIdNum : undefined);

    return NextResponse.json({ success: true, data: commissions });
  } catch (error) {
    return routeErrorResponse('PayFac Commission GET', error);
  }
});

// POST - crea o actualiza comision de una organizacion
export const POST = withPlatformAdmin(async (admin, request) => {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const {
      organizationId,
      providerCode,
      commissionType,
      commissionValue,
      minCommissionAmount,
    } = body;

    if (!organizationId || !providerCode || !commissionType || commissionValue === undefined) {
      return NextResponse.json(
        { error: 'organizationId, providerCode, commissionType y commissionValue son requeridos' },
        { status: 400 },
      );
    }

    const orgIdNum = Number(organizationId);
    const valor = Number(commissionValue);
    const minimo = minCommissionAmount === undefined || minCommissionAmount === null ? undefined : Number(minCommissionAmount);
    if (!Number.isInteger(orgIdNum) || orgIdNum <= 0
      || !TIPOS.includes(commissionType as TipoComision)
      || !Number.isFinite(valor) || valor < 0
      || (minimo !== undefined && (!Number.isFinite(minimo) || minimo < 0))) {
      return NextResponse.json({ error: 'Datos de comision no validos' }, { status: 400 });
    }

    console.info('[payfac/commission] tarifa fijada por la plataforma', { adminUserId: admin.userId, organizationId: orgIdNum });

    const commission = await commissionService.upsert(null, {
      organizationId: orgIdNum,
      providerCode: String(providerCode),
      commissionType: commissionType as TipoComision,
      commissionValue: valor,
      minCommissionAmount: minimo,
    });

    return NextResponse.json({ success: true, data: commission });
  } catch (error) {
    return routeErrorResponse('PayFac Commission POST', error);
  }
});
