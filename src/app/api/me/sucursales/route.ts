/**
 * /api/me/sucursales — paso «¿En qué sucursal trabajas hoy?» al entrar
 * (Figma `08 Acceso y organización` › 2728:69155 / 2728:69432).
 *
 * - GET: las sucursales que le corresponden a la persona en la organización de
 *   la sesión, con lo que pinta cada tarjeta (ciudad, dirección, abierta ahora o
 *   cuándo abre, caja abierta), su rol y si puede elegir «Todas».
 * - POST `{ sucursal: <id> | 'todas' }`: valida la elección contra la
 *   pertenencia del miembro ANTES de que el navegador la guarde. 403 si no le
 *   corresponde; el navegador nunca decide solo.
 *
 * La organización sale de la sesión (`withOrg`) y un body con otra
 * organización responde 403 (`readOrgBody`, regla dura 5).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, OrgContextError } from '@/lib/utils/orgContext';
import { sucursalesDeEntrada, validarEleccionSucursal } from '@/lib/auth/sucursalesEntrada.server';
import { leerEleccion } from '@/lib/auth/seleccionSucursal';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const GET = withOrg(async (ctx) => {
  try {
    return NextResponse.json(await sucursalesDeEntrada(ctx), { headers: SIN_CACHE });
  } catch (err) {
    console.error('[api/me/sucursales] GET', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'No se pudieron leer las sucursales' }, { status: 500, headers: SIN_CACHE });
  }
});

export const POST = withOrg(async (ctx, req) => {
  const body = (await readOrgBody(ctx, req, { route: 'api/me/sucursales' })) as { sucursal?: unknown } | null;
  const eleccion = leerEleccion(body?.sucursal);
  if (eleccion === null) {
    return NextResponse.json({ error: 'Sucursal inválida', code: 'INVALID_BRANCH' }, { status: 400, headers: SIN_CACHE });
  }
  // `validarEleccionSucursal` lanza OrgContextError 403 (BRANCH_FORBIDDEN /
  // BRANCH_SCOPE_REQUIRED): se registra y `withOrg` lo convierte en la respuesta.
  try {
    await validarEleccionSucursal(ctx, eleccion);
  } catch (err) {
    if (err instanceof OrgContextError) {
      console.warn('[api/me/sucursales] elección rechazada', {
        code: err.code,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        sucursal: eleccion,
      });
    }
    throw err;
  }
  return NextResponse.json({ ok: true, sucursal: eleccion }, { headers: SIN_CACHE });
});
