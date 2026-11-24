import { NextResponse } from 'next/server';
import { withOrg, readOrgBody, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { normalizarAjustesTiempos } from '@/lib/pos/pedidosWeb/tiemposPedidos';
import { guardarAjustesTiempos, leerAjustesTiempos } from '@/lib/services/webOrders/tiemposPedidosServer';

/**
 * /api/pos/pedidos-online-tiempos — Configuración › Punto de venta › Pedidos online (tiempos por
 * tipo de entrega y por sede). `organization_settings`, clave `pedidos_online_tiempos`.
 *
 * - GET: cualquier miembro (la lista de pedidos online la lee para el diálogo de confirmar).
 *   Devuelve los ajustes (null si no hay fila: entonces todo sigue con los tiempos de siempre),
 *   las sedes activas, el tipo de organización (para los valores de fábrica) y si puede editar.
 * - PUT: solo administración (permiso resuelto aquí, nunca por el nombre del rol). La RLS de
 *   `organization_settings` solo pide ser miembro: por eso la escritura pasa por esta ruta.
 * La organización sale de la sesión; un body con otra organización lo rechaza `readOrgBody`.
 */
const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const dynamic = 'force-dynamic';

interface Sede {
  id: number;
  nombre: string;
}

export const GET = withOrg(async (ctx) => {
  const [ajustes, sedesR, orgR, puedeEditar] = await Promise.all([
    leerAjustesTiempos(ctx.supabase, ctx.organizationId),
    ctx.supabase.from('branches').select('id, name, is_active, is_main').eq('organization_id', ctx.organizationId).order('is_main', { ascending: false }).order('name', { ascending: true }),
    ctx.supabase.from('organizations').select('type_id').eq('id', ctx.organizationId).maybeSingle(),
    hasOrgAdminOrPermission(ctx),
  ]);
  const sedes: Sede[] = ((sedesR.data ?? []) as { id: number; name: string | null; is_active: boolean | null }[])
    .filter((s) => s.is_active !== false)
    .map((s) => ({ id: s.id, nombre: s.name ?? `#${s.id}` }));
  const tipoOrganizacion = (orgR.data as { type_id?: number | null } | null)?.type_id ?? null;
  return NextResponse.json({ ajustes, sedes, tipoOrganizacion, puedeEditar }, { headers: SIN_CACHE });
});

export const PUT = withOrg(async (ctx, request) => {
  const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: 'pos/pedidos-online-tiempos' });
  if (!(await hasOrgAdminOrPermission(ctx))) {
    console.warn('[pos/pedidos-online-tiempos] guardar sin permiso', { organizationId: ctx.organizationId, userId: ctx.userId });
    return NextResponse.json({ error: 'Solo administración puede cambiar los tiempos', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  const ajustes = normalizarAjustesTiempos(body?.ajustes ?? body);

  // Solo sedes de la organización de la sesión: una clave ajena no se guarda.
  const { data: sedes, error: errorSedes } = await ctx.supabase.from('branches').select('id').eq('organization_id', ctx.organizationId);
  if (errorSedes) return NextResponse.json({ error: 'error', codigo: 'error' }, { status: 500, headers: SIN_CACHE });
  const propias = new Set(((sedes ?? []) as { id: number }[]).map((s) => String(s.id)));
  for (const clave of Object.keys(ajustes.por_sede)) {
    if (!propias.has(clave)) delete ajustes.por_sede[clave];
  }

  const r = await guardarAjustesTiempos(ctx.supabase, ctx.organizationId, ajustes);
  if (!r.ok) return NextResponse.json({ error: 'error', codigo: 'error' }, { status: 500, headers: SIN_CACHE });
  return NextResponse.json({ ok: true, ajustes }, { headers: SIN_CACHE });
});
