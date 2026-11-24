/**
 * GET/PUT /api/transporte/ajustes — Configuración › Transporte (`transporte.general`).
 *
 * - Organización de la sesión (`withOrg`); un body con otra organización → 403 (`readOrgBody`).
 * - Leer: cualquier miembro (la sección se ve en solo lectura sin permiso; los motivos de novedad
 *   los leen también el diálogo de reporte y Viajes › Novedades).
 * - Guardar: `transporte.manage` resuelto aquí. `organization_settings` solo exige ser miembro en
 *   su RLS: por eso la escritura pasa únicamente por esta ruta.
 * - `puedeAutorizar`: si quien mira tiene «Autorizar excepción de despacho» (solo informativo).
 */
import { NextResponse } from 'next/server';
import { readOrgBody, withOrg } from '@/lib/utils/orgContext';
import { puedeTransporte } from '@/lib/transporte/permisosTransporte.server';
import { CLAVE_AJUSTES_TRANSPORTE, normalizarAjustesTransporte, validarAjustesTransporte } from '@/lib/transporte/ajustesTransporte';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const GET = withOrg(async (ctx) => {
  const [{ data }, puedeEditar, puedeAutorizar] = await Promise.all([
    ctx.supabase.from('organization_settings').select('settings').eq('organization_id', ctx.organizationId).eq('key', CLAVE_AJUSTES_TRANSPORTE).maybeSingle(),
    puedeTransporte(ctx, 'transporte.manage'),
    puedeTransporte(ctx, 'transporte.despacho.excepcion'),
  ]);
  return NextResponse.json(
    { ajustes: normalizarAjustesTransporte((data as { settings?: unknown } | null)?.settings), puedeEditar, puedeAutorizar },
    { headers: SIN_CACHE },
  );
});

export const PUT = withOrg(async (ctx, request) => {
  const body = await readOrgBody<{ ajustes?: unknown }>(ctx, request, { route: 'transporte/ajustes' });
  if (!(await puedeTransporte(ctx, 'transporte.manage'))) {
    console.warn('[transporte/ajustes] guardar sin permiso', { organizationId: ctx.organizationId, userId: ctx.userId });
    return NextResponse.json({ error: 'Sin permiso', code: 'SIN_PERMISO' }, { status: 403 });
  }
  const v = validarAjustesTransporte(body?.ajustes);
  if (!v.ok) return NextResponse.json({ error: v.error, code: v.error }, { status: 400 });

  const { error } = await ctx.supabase.from('organization_settings').upsert(
    { organization_id: ctx.organizationId, key: CLAVE_AJUSTES_TRANSPORTE, settings: v.ajustes, updated_at: new Date().toISOString() },
    { onConflict: 'organization_id,key' },
  );
  if (error) {
    console.error('[transporte/ajustes] no se guardaron', { organizationId: ctx.organizationId, message: error.message });
    return NextResponse.json({ error: 'No se pudo guardar', code: 'ERROR' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ajustes: v.ajustes }, { headers: SIN_CACHE });
});
