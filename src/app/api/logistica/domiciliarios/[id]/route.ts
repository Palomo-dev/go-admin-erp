/**
 * PATCH /api/logistica/domiciliarios/[id] — activar o desactivar un domiciliario (no se borra:
 * tiene envíos y cuadres). Body: `{ activo: boolean }`.
 *
 * Sesión + organización (`withOrg`), `readOrgBody` (403 ante otra organización) y el permiso del
 * alta. El id se filtra por la organización de la sesión: uno ajeno responde 404.
 */
import { NextResponse } from 'next/server';
import { readOrgBody, withOrg } from '@/lib/utils/orgContext';
import { puedeGestionarDomiciliarios } from '@/lib/logistica/permisosDomiciliarios.server';
import { AltaDomiciliarioError, cambiarActivo } from '@/lib/services/logistica/domiciliariosService';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PATCH = withOrg(async (ctx, request, routeParams) => {
  const body = await readOrgBody<{ activo?: unknown }>(ctx, request, { route: 'logistica/domiciliarios/[id]' });
  const params = (await routeParams?.params) ?? {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'Domiciliario no encontrado', code: 'NO_ENCONTRADO' }, { status: 404 });
  if (typeof body?.activo !== 'boolean') return NextResponse.json({ error: 'Datos inválidos', code: 'DATOS_INVALIDOS' }, { status: 400 });
  if (!(await puedeGestionarDomiciliarios(ctx))) {
    return NextResponse.json({ error: 'Sin permiso', code: 'SIN_PERMISO' }, { status: 403 });
  }
  try {
    await cambiarActivo(ctx.supabase, ctx.organizationId, id, body.activo);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AltaDomiciliarioError && err.message === 'NO_ENCONTRADO') {
      return NextResponse.json({ error: 'Domiciliario no encontrado', code: 'NO_ENCONTRADO' }, { status: 404 });
    }
    console.error('[logistica/domiciliarios/[id]] falló', { organizationId: ctx.organizationId, message: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Error interno', code: 'ERROR' }, { status: 500 });
  }
});
