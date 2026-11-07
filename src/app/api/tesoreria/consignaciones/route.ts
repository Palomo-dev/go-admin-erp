/**
 * POST /api/tesoreria/consignaciones — consignar el efectivo de una caja
 * abierta en una cuenta bancaria (Tesorería v2, frame 1004:82448).
 *
 * Organización de la sesión (un `organization_id` ajeno en el cuerpo o la
 * query responde 403); permiso `finance.create`; cuerpo por lista blanca. Todo
 * lo demás (caja abierta y de la org, banco activo en la moneda base, fecha no
 * futura, idempotencia, asiento único 1110 D / 1105 C) lo hace la RPC
 * transaccional `fn_consignacion_caja_banco`, con el cliente de la sesión.
 * Migración 20261108010000 (aplicada el 2026-11-07).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { PERMISOS_FINANZAS, requireOrgPermission, routeErrorResponse } from '@/lib/security/orgGuards';
import {
  codigoErrorConsignacion,
  parametrosConsignacion,
  validarConsignacion,
} from '@/lib/finanzas/tesoreria/consignacion';

export const dynamic = 'force-dynamic';

const RUTA = 'POST /api/tesoreria/consignaciones';
const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const POST = withOrg(async (ctx, req) => {
  try {
    const body = (await readOrgBody<Record<string, unknown>>(ctx, req, { route: RUTA })) ?? {};
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.CREAR, RUTA);
    const v = validarConsignacion(body);
    if (!v.ok) return NextResponse.json({ error: v.error, codigo: v.error }, { status: 400, headers: SIN_CACHE });

    const { data, error } = await ctx.supabase.rpc('fn_consignacion_caja_banco', parametrosConsignacion(ctx.organizationId, v.datos));
    if (error) {
      const codigo = codigoErrorConsignacion(error);
      const status = codigo === 'sin_permiso' || codigo === 'sin_acceso_sucursal' ? 403 : codigo === 'desconocido' ? 500 : 400;
      if (status !== 400) console.warn('[tesoreria/consignaciones]', { organizationId: ctx.organizationId, codigo });
      return NextResponse.json({ error: codigo, codigo }, { status, headers: SIN_CACHE });
    }
    return NextResponse.json(data ?? {}, { headers: SIN_CACHE });
  } catch (err) {
    return routeErrorResponse(RUTA, err);
  }
});
