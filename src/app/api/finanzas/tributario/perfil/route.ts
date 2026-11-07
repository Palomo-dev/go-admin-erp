/**
 * Perfil tributario de la empresa (Finanzas R4-A, Figma 2335:136222).
 *
 * GET  → vigencias, la vigente, lo que falta y el catálogo de responsabilidades
 *        del RUT. `activo: false` = la migración 20261108100000 aún no está
 *        aplicada (la pantalla dice «pendiente de activar»). Permiso `finance.view`.
 * POST → crea o corrige una vigencia por `fn_perfil_tributario_guardar`.
 *        Permiso `finance.approve` (o administrador) aquí y otra vez en la RPC.
 *
 * Organización de la sesión: una ajena en el cuerpo o la query responde 403 y
 * queda registrada (`readOrgBody`). Cuerpo por lista blanca.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { PERMISOS_FINANZAS, requireOrgPermission } from '@/lib/security/orgGuards';
import { validarSolicitudPerfil } from '@/lib/finanzas/tributario/perfil';
import { guardarPerfil, leerPerfil, respuestaErrorTributario, SIN_CACHE } from '@/lib/services/tributario/tributario.server';

export const dynamic = 'force-dynamic';

const RUTA_GET = 'GET /api/finanzas/tributario/perfil';
const RUTA_POST = 'POST /api/finanzas/tributario/perfil';

export const GET = withOrg(async (ctx, req) => {
  try {
    await readOrgBody(ctx, req, { route: RUTA_GET });
    if (!(await hasOrgAdminOrPermission(ctx, PERMISOS_FINANZAS.VER))) {
      return NextResponse.json({ error: 'sin_permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
    }
    const [perfil, puedeEditar] = await Promise.all([leerPerfil(ctx), hasOrgAdminOrPermission(ctx, PERMISOS_FINANZAS.APROBAR)]);
    return NextResponse.json({ ...perfil, puedeEditar }, { headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorTributario(RUTA_GET, err);
  }
});

export const POST = withOrg(async (ctx, req) => {
  try {
    const cuerpo = (await readOrgBody<Record<string, unknown>>(ctx, req, { route: RUTA_POST })) ?? {};
    await requireOrgPermission(ctx, PERMISOS_FINANZAS.APROBAR, RUTA_POST);
    const v = validarSolicitudPerfil(cuerpo);
    if (!v.ok) return NextResponse.json({ error: v.error, codigo: v.error }, { status: 400, headers: SIN_CACHE });
    const r = await guardarPerfil(ctx, v.datos);
    return NextResponse.json(r, { status: v.datos.id ? 200 : 201, headers: SIN_CACHE });
  } catch (err) {
    return respuestaErrorTributario(RUTA_POST, err);
  }
});
