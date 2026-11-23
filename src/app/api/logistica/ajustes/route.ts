/**
 * GET/PUT /api/logistica/ajustes — Configuración › Logística (`logistica.general`).
 *
 * - Organización de la sesión (`withOrg`); un body con otra organización → 403 (`readOrgBody`).
 * - Leer: cualquier miembro (la sección se ve en solo lectura sin permiso).
 * - Guardar: `organization_settings` resuelto aquí (`puedeEditarCargoDomicilio`, el mismo permiso
 *   de zonas y tarifas). `organization_settings` (la tabla) solo exige ser miembro en su RLS: por
 *   eso la escritura pasa únicamente por esta ruta.
 * - También el peso y la caja por defecto de la organización (`shipping_settings`, cuya RLS ya
 *   exige administrador): último recurso de la cadena del peso.
 */
import { NextResponse } from 'next/server';
import { readOrgBody, withOrg } from '@/lib/utils/orgContext';
import { puedeEditarCargoDomicilio } from '@/lib/logistica/permisosLogistica.server';
import { CLAVE_AJUSTES_LOGISTICA, normalizarAjustesLogistica, validarAjustesLogistica } from '@/lib/logistica/ajustesLogistica';
import { guardarPesoOrganizacion, leerPesoOrganizacion, type PesoOrganizacion } from '@/lib/services/logistica/pesoMedidasService';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

function pesoValido(v: unknown): PesoOrganizacion | null {
  const f = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  if (!f) return null;
  const leer = (x: unknown): number | null | undefined => {
    if (x === null || x === undefined || x === '') return null;
    const n = Number(x);
    return Number.isFinite(n) && n > 0 && n < 100000 ? n : undefined;
  };
  const out = {
    default_weight_kg: leer(f.default_weight_kg),
    default_length_cm: leer(f.default_length_cm),
    default_width_cm: leer(f.default_width_cm),
    default_height_cm: leer(f.default_height_cm),
  };
  return Object.values(out).some((x) => x === undefined) ? null : (out as PesoOrganizacion);
}

export const GET = withOrg(async (ctx) => {
  const [{ data }, peso, puedeEditar] = await Promise.all([
    ctx.supabase.from('organization_settings').select('settings').eq('organization_id', ctx.organizationId).eq('key', CLAVE_AJUSTES_LOGISTICA).maybeSingle(),
    leerPesoOrganizacion(ctx.supabase, ctx.organizationId).catch(() => null),
    puedeEditarCargoDomicilio(ctx),
  ]);
  return NextResponse.json(
    { ajustes: normalizarAjustesLogistica((data as { settings?: unknown } | null)?.settings), peso, puedeEditar },
    { headers: SIN_CACHE },
  );
});

export const PUT = withOrg(async (ctx, request) => {
  const body = await readOrgBody<{ ajustes?: unknown; peso?: unknown }>(ctx, request, { route: 'logistica/ajustes' });
  if (!(await puedeEditarCargoDomicilio(ctx))) {
    console.warn('[logistica/ajustes] guardar sin permiso', { organizationId: ctx.organizationId, userId: ctx.userId });
    return NextResponse.json({ error: 'Sin permiso', code: 'SIN_PERMISO' }, { status: 403 });
  }
  const v = validarAjustesLogistica(body?.ajustes);
  if (!v.ok) return NextResponse.json({ error: v.error, code: v.error }, { status: 400 });
  const peso = body?.peso === undefined ? undefined : pesoValido(body.peso);
  if (peso === null) return NextResponse.json({ error: 'peso_invalido', code: 'peso_invalido' }, { status: 400 });

  const { error } = await ctx.supabase.from('organization_settings').upsert(
    { organization_id: ctx.organizationId, key: CLAVE_AJUSTES_LOGISTICA, settings: v.ajustes, updated_at: new Date().toISOString() },
    { onConflict: 'organization_id,key' },
  );
  if (error) {
    console.error('[logistica/ajustes] no se guardaron', { organizationId: ctx.organizationId, message: error.message });
    return NextResponse.json({ error: 'No se pudo guardar', code: 'ERROR' }, { status: 500 });
  }
  if (peso) {
    try {
      await guardarPesoOrganizacion(ctx.supabase, ctx.organizationId, peso);
    } catch (e) {
      console.error('[logistica/ajustes] no se guardó el peso de la organización', { organizationId: ctx.organizationId, message: e instanceof Error ? e.message : String(e) });
      return NextResponse.json({ error: 'No se pudo guardar el peso', code: 'ERROR_PESO' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, ajustes: v.ajustes }, { headers: SIN_CACHE });
});
