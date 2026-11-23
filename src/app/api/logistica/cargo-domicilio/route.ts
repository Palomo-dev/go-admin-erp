/**
 * POST /api/logistica/cargo-domicilio — deja registrado que alguien cambió el cargo de domicilio
 * que había llenado la zona (POS o pedido manual de Pedidos online). Logística Fase 1.
 *
 * - Organización de la sesión (`withOrg` + `readOrgBody`: otra organización en el body → 403).
 * - Permiso resuelto aquí (`puedeEditarCargoDomicilio`); sin él → 403 y queda en el log del
 *   servidor. La pantalla ya bloquea el campo, esto es la barrera.
 * - La venta o el pedido se leen filtrados por la organización de la sesión (uno ajeno → 404).
 * - Registro en `ops_audit_log` (RLS por pertenencia, cliente de la sesión): quién, cuándo, el
 *   valor de la zona y el cobrado.
 *
 * Body: { tipo: 'sale' | 'web_order', id, cotizado, cobrado, zonaId?, zonaNombre? }
 */
import { NextResponse } from 'next/server';
import { readOrgBody, withOrg } from '@/lib/utils/orgContext';
import { puedeEditarCargoDomicilio } from '@/lib/logistica/permisosLogistica.server';
import { cargoEditado } from '@/lib/logistica/presentacionEnvio';

export const dynamic = 'force-dynamic';

interface CuerpoCargo {
  tipo?: unknown;
  id?: unknown;
  cotizado?: unknown;
  cobrado?: unknown;
  zonaId?: unknown;
  zonaNombre?: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const importe = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};

export const POST = withOrg(async (ctx, request) => {
  const body = await readOrgBody<CuerpoCargo>(ctx, request, { route: 'logistica/cargo-domicilio' });
  const tipo = body?.tipo === 'sale' || body?.tipo === 'web_order' ? body.tipo : null;
  const id = typeof body?.id === 'string' && UUID.test(body.id) ? body.id : null;
  const cotizado = importe(body?.cotizado);
  const cobrado = importe(body?.cobrado);
  if (!tipo || !id || cotizado === null || cobrado === null) {
    return NextResponse.json({ error: 'Datos inválidos', code: 'DATOS_INVALIDOS' }, { status: 400 });
  }
  if (!cargoEditado(cotizado, cobrado)) return NextResponse.json({ ok: true, registrado: false });

  if (!(await puedeEditarCargoDomicilio(ctx))) {
    console.warn('[logistica/cargo-domicilio] cambio de cargo sin permiso', { organizationId: ctx.organizationId, userId: ctx.userId, tipo, id, cotizado, cobrado });
    return NextResponse.json({ error: 'Sin permiso para cambiar el cargo de domicilio', code: 'SIN_PERMISO' }, { status: 403 });
  }

  const tabla = tipo === 'sale' ? 'sales' : 'web_orders';
  const { data: fila, error: errLectura } = await ctx.supabase
    .from(tabla)
    .select('id, branch_id')
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (errLectura) return NextResponse.json({ error: 'No se pudo leer el documento', code: 'ERROR' }, { status: 500 });
  if (!fila) return NextResponse.json({ error: 'No encontrado', code: 'NO_ENCONTRADO' }, { status: 404 });

  const zonaId = typeof body?.zonaId === 'string' && UUID.test(body.zonaId) ? body.zonaId : null;
  const zonaNombre = typeof body?.zonaNombre === 'string' ? body.zonaNombre.trim().slice(0, 120) || null : null;
  const { error } = await ctx.supabase.from('ops_audit_log').insert({
    organization_id: ctx.organizationId,
    branch_id: (fila as { branch_id: number | null }).branch_id ?? null,
    user_id: ctx.userId,
    entity_type: tipo === 'sale' ? 'sales' : 'web_orders',
    entity_id: id,
    action: 'cargo_domicilio_editado',
    previous_data: { cargo_domicilio: cotizado, zona_id: zonaId, zona: zonaNombre, fuente: 'zona' },
    new_data: { cargo_domicilio: cobrado },
    changed_fields: ['cargo_domicilio'],
    event_time: new Date().toISOString(),
    metadata: { modulo: 'logistica', permiso: 'organization_settings' },
  });
  if (error) {
    console.error('[logistica/cargo-domicilio] no se registró el cambio', { organizationId: ctx.organizationId, message: error.message });
    return NextResponse.json({ error: 'No se pudo registrar', code: 'ERROR' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, registrado: true });
});
