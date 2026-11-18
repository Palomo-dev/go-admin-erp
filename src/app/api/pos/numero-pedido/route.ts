import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { normalizarAjustesNumero } from '@/lib/pos/pedidosWeb/numeroPedido';
import { guardarAjustesNumero, leerAjustesNumero } from '@/lib/services/webOrders/numeroPedidoServer';

/**
 * /api/pos/numero-pedido — Configuración › POS › Número de pedido. GET: el formato del número de
 * los pedidos web de la organización de la sesión. PUT: guardarlo; solo administración (permiso
 * en el servidor, nunca por el nombre del rol). La organización sale de la sesión; un body con
 * otra organización lo rechaza `readOrgBody` (403 y registro).
 */
const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const GET = withOrg(async (ctx) => {
  const r = await leerAjustesNumero(ctx.supabase, ctx.organizationId);
  const puedeEditar = await hasOrgAdminOrPermission(ctx);
  return NextResponse.json({ ...r, organizationId: ctx.organizationId, puedeEditar }, { headers: SIN_CACHE });
});

export const PUT = withOrg(async (ctx, request) => {
  const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: 'pos/numero-pedido' });
  if (!(await hasOrgAdminOrPermission(ctx))) {
    return NextResponse.json({ error: 'Solo administración puede cambiar el número de pedido', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  const parsed = normalizarAjustesNumero({ formato: body?.formato, prefijo: body?.prefijo });
  if (!parsed.ok) {
    const codigo = parsed.error === 'reservado' ? 'prefijo_reservado' : parsed.error === 'formato_desconocido' ? 'datos_invalidos' : 'prefijo_invalido';
    return NextResponse.json({ error: codigo, codigo }, { status: 400, headers: SIN_CACHE });
  }
  // Service role solo después de validar organización y permiso.
  const r = await guardarAjustesNumero(getSupabaseAdmin(), ctx.organizationId, ctx.userId, parsed.ajustes);
  if (!r.ok) {
    const status = r.codigo === 'no_disponible' ? 501 : r.codigo === 'prefijo_en_uso' ? 409 : 500;
    return NextResponse.json({ error: r.codigo, codigo: r.codigo }, { status, headers: SIN_CACHE });
  }
  return NextResponse.json({ ok: true, ajustes: parsed.ajustes }, { headers: SIN_CACHE });
});
