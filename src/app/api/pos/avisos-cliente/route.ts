import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { ajustesAvisosSchema } from '@/lib/pos/pedidosWeb/avisosCliente';
import { guardarAjustesAvisos, leerAjustesAvisos } from '@/lib/services/avisosClienteService';

/**
 * /api/pos/avisos-cliente — Configuración › POS › Avisos al cliente (Figma
 * 464:241318). GET: los ajustes de la organización de la sesión (o los del
 * Figma por defecto). PUT: guardarlos; solo administración (permiso en el
 * servidor, nunca por el nombre del rol). La organización sale de la sesión.
 */
const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const GET = withOrg(async (ctx) => {
  const r = await leerAjustesAvisos(ctx.supabase, ctx.organizationId);
  const puedeEditar = await hasOrgAdminOrPermission(ctx);
  return NextResponse.json({ ...r, puedeEditar }, { headers: SIN_CACHE });
});

export const PUT = withOrg(async (ctx, request) => {
  const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: 'pos/avisos-cliente' });
  if (!(await hasOrgAdminOrPermission(ctx))) {
    return NextResponse.json({ error: 'Solo administración puede cambiar los avisos', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  const { organization_id: _o, organizationId: _p, ...resto } = (body ?? {}) as Record<string, unknown>;
  const parsed = ajustesAvisosSchema.safeParse(resto);
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos', codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  // Service role solo después de validar organización y permiso.
  const r = await guardarAjustesAvisos(getSupabaseAdmin(), ctx.organizationId, ctx.userId, parsed.data);
  if (!r.ok) {
    return NextResponse.json({ error: r.codigo, codigo: r.codigo }, { status: r.codigo === 'no_disponible' ? 501 : 500, headers: SIN_CACHE });
  }
  return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
});
