/**
 * «Sedes en la web» (Figma B/11-01…11-05) en el servidor: qué sucursales salen
 * en el sitio, con qué dirección (`tumarca.com/<slug>`), de cuáles sale el
 * stock de la tienda y el modo («Un sitio con selector» o «Un sitio por sede»).
 *
 * Lectura con el cliente de la SESIÓN y la organización del contexto. La
 * dirección base sale de `direccionDelSitio` (la regla única del Resumen); el
 * horario es de la sucursal y solo se lee (B/11-04 nota 1), en la zona de la
 * sede (`branches.timezone`) o, si no tiene, la de la organización.
 *
 * Escritura: permiso `website.sites.edit` y cliente de servicio filtrado por
 * la organización de la sesión (la RLS de `branches` exige rol de
 * administrador). El guardado va por la RPC transaccional
 * `fn_sitio_web_guardar_sedes` (supabase/pendientes) y, mientras no se aplique,
 * por updates con compensación (ver `guardarSedesWeb`).
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { permisosSitio } from '@/lib/services/website/paginasSitioService';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { getServiceClient } from '@/lib/supabase/server-service';
import { direccionDelSitio } from '@/components/sitio-web/seoanalitica/seo.server';
import { resolverEstadoDominio } from '@/components/sitio-web/ui/estadoDominio';
import {
  estadoApertura,
  resumirHorario,
  slugDesdeNombre,
  type CambiosSedes,
  type ModoSedes,
  type RespuestaSedesWeb,
  type SedeWebFila,
} from '@/components/sitio-web/ventas/sedesWeb';
import { slugChocaConPagina } from '@/lib/organizacion/slugSede';
import { esSinColumna } from './ventasSitio.server';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase' | 'memberId'>;

export class ErrorSedesWeb extends Error {
  constructor(
    public readonly codigo: 'sin_permiso' | 'peticion_invalida' | 'slug_en_uso' | 'slug_es_pagina' | 'sede_no_encontrada' | 'sede_inactiva' | 'pendiente_migracion',
    public readonly status: number,
    mensaje: string,
    public readonly detalle?: unknown,
  ) {
    super(mensaje);
    this.name = 'ErrorSedesWeb';
  }
}

interface FilaSucursal {
  id: number;
  name: string;
  address: string | null;
  city: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  opening_hours: unknown;
  timezone: string | null;
  is_active: boolean | null;
  is_main: boolean | null;
  slug: string | null;
  custom_domain: string | null;
  is_web_published: boolean | null;
  is_web_stock_source: boolean | null;
}

function coordenada(v: number | string | null): number | null {
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function leerModo(ctx: Ctx): Promise<{ modo: ModoSedes; pendiente: boolean }> {
  const { data, error } = await ctx.supabase
    .from('website_settings')
    .select('multi_outlet_mode')
    .eq('organization_id', ctx.organizationId)
    .is('branch_id', null)
    .maybeSingle();
  if (error) {
    if (esSinColumna(error)) return { modo: 'selector', pendiente: true };
    throw error;
  }
  const v = (data as { multi_outlet_mode?: string | null } | null)?.multi_outlet_mode;
  return { modo: v === 'per_branch' ? 'per_branch' : 'selector', pendiente: false };
}

export async function leerSedesWeb(ctx: Ctx, ahora: Date = new Date()): Promise<RespuestaSedesWeb> {
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorSedesWeb('sin_permiso', 403, 'No tienes permiso para publicar sedes.');
  const [sucursales, dominios, modo, zonaOrg, direccion] = await Promise.all([
    ctx.supabase
      .from('branches')
      .select('id, name, address, city, latitude, longitude, opening_hours, timezone, is_active, is_main, slug, custom_domain, is_web_published, is_web_stock_source')
      .eq('organization_id', ctx.organizationId)
      .order('is_main', { ascending: false })
      .order('name', { ascending: true }),
    ctx.supabase.from('organization_domains').select('host, status, is_active').eq('organization_id', ctx.organizationId),
    leerModo(ctx),
    getOrganizationTimezone(ctx.organizationId, ctx.supabase),
    direccionDelSitio(ctx),
  ]);
  if (sucursales.error) throw sucursales.error;
  if (dominios.error) throw dominios.error;
  const estadoDominio = new Map(
    ((dominios.data ?? []) as { host: string; status: string; is_active: boolean | null }[]).map((d) => [d.host.toLowerCase(), d.is_active === false ? 'pendiente' : resolverEstadoDominio(d.status)]),
  );
  const activas = ((sucursales.data ?? []) as FilaSucursal[]).filter((s) => s.is_active !== false);
  const sedes: SedeWebFila[] = activas.map((s) => {
    const host = s.custom_domain?.trim().toLowerCase() || null;
    return {
      id: s.id,
      nombre: s.name,
      direccion: s.address,
      ciudad: s.city,
      principal: s.is_main === true,
      publicada: s.is_web_published === true,
      slug: s.slug || null,
      slugSugerido: slugDesdeNombre(s.name),
      fuenteStock: s.is_web_stock_source !== false,
      dominioPropio: host ? { host, estado: estadoDominio.get(host) ?? null } : null,
      horario: resumirHorario(s.opening_hours),
      apertura: estadoApertura(s.opening_hours, s.timezone || zonaOrg, ahora),
      latitud: coordenada(s.latitude),
      longitud: coordenada(s.longitude),
    };
  });
  const principal = sedes.find((s) => s.principal) ?? sedes[0] ?? null;
  return {
    estado: sedes.length > 1 ? 'listo' : 'una_sede',
    modo: modo.modo,
    modoPendienteMigracion: modo.pendiente,
    host: direccion.host,
    sedes,
    sedePrincipal: principal?.nombre ?? null,
    permisos,
  };
}

interface FilaOriginal {
  id: number;
  is_active: boolean | null;
  slug: string | null;
  is_web_published: boolean | null;
  is_web_stock_source: boolean | null;
}

/** Códigos de «la función no existe» (PostgREST y Postgres): la RPC sigue en supabase/pendientes. */
const SIN_FUNCION = new Set(['PGRST202', '42883']);

/**
 * Traduce el error de la RPC o de un update a un `ErrorSedesWeb` cuando tiene
 * significado para la persona; si no, lo devuelve tal cual.
 */
function errorDeEscritura(error: { code?: string; message?: string }, s?: { id: number; slug: string | null }): unknown {
  if (error.code === '23505') return new ErrorSedesWeb('slug_en_uso', 409, 'Esa dirección ya la usa otra sede.', s ? { id: s.id, slug: s.slug } : undefined);
  if (error.code === '42501') return new ErrorSedesWeb('sin_permiso', 403, 'No tienes permiso para publicar sedes.');
  if (error.code === 'P0002') return new ErrorSedesWeb('sede_no_encontrada', 404, 'Esa sede no existe.');
  return error;
}

/**
 * Guarda Sedes en la web en UNA transacción.
 *
 * 1. Si `fn_sitio_web_guardar_sedes` ya está aplicada (supabase/pendientes/
 *    20261008120000_sitio_web_ventas_sedes.sql), se llama con el cliente de la
 *    SESIÓN: la función valida `website.sites.edit` con `auth.uid()` y hace
 *    todo o nada.
 * 2. Mientras no exista, se escribe sede por sede con compensación: solo se
 *    liberan antes los slugs que OTRA sede del lote va a ocupar (un cruce),
 *    nunca los de todas las sedes que cambian, y si un update falla se
 *    restauran las filas ya tocadas a su valor original. Así una sede
 *    publicada no se queda sin dirección por un fallo a mitad del lote.
 */
export async function guardarSedesWeb(ctx: Ctx, cambios: CambiosSedes): Promise<void> {
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorSedesWeb('sin_permiso', 403, 'No tienes permiso para publicar sedes.');
  const db = getServiceClient();
  const { data, error } = await db
    .from('branches')
    .select('id, is_active, slug, is_web_published, is_web_stock_source')
    .eq('organization_id', ctx.organizationId);
  if (error) throw error;
  const propias = new Map(((data ?? []) as FilaOriginal[]).map((b) => [b.id, b]));
  const editadas = new Set(cambios.sedes.map((s) => s.id));
  for (const s of cambios.sedes) {
    const b = propias.get(s.id);
    // Una sede de otra organización se responde igual que una que no existe.
    if (!b) throw new ErrorSedesWeb('sede_no_encontrada', 404, 'Esa sede no existe.', { id: s.id });
    if (s.publicada && b.is_active === false) throw new ErrorSedesWeb('sede_inactiva', 409, 'No puedes publicar una sede inactiva.', { id: s.id });
  }
  // Unicidad del slug contra las sedes que NO vienen en el lote.
  const ocupados = new Map<string, number>();
  for (const b of propias.values()) if (!editadas.has(b.id) && b.slug) ocupados.set(b.slug, b.id);
  const enUso = cambios.sedes.find((s) => s.slug && ocupados.has(s.slug));
  if (enUso) throw new ErrorSedesWeb('slug_en_uso', 409, 'Esa dirección ya la usa otra sede.', { id: enUso.id, slug: enUso.slug });
  // La misma regla que Sucursales (`slugChocaConPagina`): una sede publicada con la dirección de
  // una página del sitio principal deja una de las dos inalcanzable. Solo las que cambian de slug
  // o pasan a publicarse: lo ya guardado no bloquea otros cambios del lote.
  for (const s of cambios.sedes) {
    const b = propias.get(s.id);
    if (!s.publicada || !s.slug || (b?.is_web_published && b.slug === s.slug)) continue;
    if (await slugChocaConPagina(ctx.supabase, ctx.organizationId, s.slug)) {
      throw new ErrorSedesWeb('slug_es_pagina', 409, `«${s.slug}» ya es la dirección de una página del sitio. Elige otra para la sede.`, { id: s.id, slug: s.slug });
    }
  }

  // 1. RPC transaccional, si ya está aplicada.
  const rpc = await ctx.supabase.rpc('fn_sitio_web_guardar_sedes', {
    p_org: ctx.organizationId,
    p_modo: cambios.modo ?? null,
    p_sedes: cambios.sedes.map((s) => ({ id: s.id, publicada: s.publicada, slug: s.slug ?? '', fuenteStock: s.fuenteStock })),
  });
  if (!rpc.error) return;
  const codigo = (rpc.error as { code?: string }).code ?? '';
  if (!SIN_FUNCION.has(codigo)) {
    if (codigo === '23514' || esSinColumna(rpc.error)) throw new ErrorSedesWeb('pendiente_migracion', 409, 'Elegir el modo se activa con una migración pendiente.');
    throw errorDeEscritura(rpc.error);
  }

  // 2. Sin la RPC: escritura con compensación.
  const ahoraIso = new Date().toISOString();
  const nuevosSlugs = new Set(cambios.sedes.map((s) => s.slug).filter((v): v is string => !!v));
  const cruces = cambios.sedes.filter((s) => {
    const actual = propias.get(s.id)?.slug ?? null;
    return actual !== null && actual !== s.slug && nuevosSlugs.has(actual);
  });
  const tocadas = new Set<number>();

  const restaurar = async () => {
    if (tocadas.size === 0) return;
    const ids = [...tocadas];
    // Primero sin slug (el índice único no admite un cruce a mitad), luego el valor original.
    const r0 = await db.from('branches').update({ slug: null }).eq('organization_id', ctx.organizationId).in('id', ids);
    if (r0.error) console.error('[sedesWeb] no se pudo deshacer el lote', { organizationId: ctx.organizationId, message: r0.error.message });
    for (const id of ids) {
      const o = propias.get(id)!;
      const r = await db
        .from('branches')
        .update({ slug: o.slug, is_web_published: o.is_web_published, is_web_stock_source: o.is_web_stock_source })
        .eq('organization_id', ctx.organizationId)
        .eq('id', id);
      if (r.error) console.error('[sedesWeb] no se pudo restaurar la sede', { organizationId: ctx.organizationId, id, message: r.error.message });
    }
  };

  try {
    for (const s of cruces) {
      tocadas.add(s.id);
      const r = await db.from('branches').update({ slug: null }).eq('organization_id', ctx.organizationId).eq('id', s.id);
      if (r.error) throw errorDeEscritura(r.error, s);
    }
    for (const s of cambios.sedes) {
      tocadas.add(s.id);
      const r = await db
        .from('branches')
        .update({ is_web_published: s.publicada, slug: s.slug, is_web_stock_source: s.fuenteStock, updated_at: ahoraIso })
        .eq('organization_id', ctx.organizationId)
        .eq('id', s.id);
      if (r.error) throw errorDeEscritura(r.error, s);
    }
    // El modo va al final: si falla, se deshacen las sedes y nada queda a medias.
    if (cambios.modo) {
      const r = await db
        .from('website_settings')
        .update({ multi_outlet_mode: cambios.modo, updated_at: ahoraIso })
        .eq('organization_id', ctx.organizationId)
        .is('branch_id', null);
      if (r.error) {
        if (esSinColumna(r.error)) throw new ErrorSedesWeb('pendiente_migracion', 409, 'Elegir el modo se activa con una migración pendiente.');
        throw r.error;
      }
    }
  } catch (e) {
    await restaurar();
    throw e;
  }
}

export function respuestaErrorSedes(error: unknown, ruta: string, organizationId: number): Response {
  const cabeceras = { 'Cache-Control': 'private, no-store' };
  if (error instanceof ErrorSedesWeb) {
    return Response.json({ error: error.message, codigo: error.codigo, detalle: error.detalle }, { status: error.status, headers: cabeceras });
  }
  if ((error as { code?: string } | null)?.code === '42501') {
    return Response.json({ error: 'No tienes acceso al sitio web.', codigo: 'sin_permiso' }, { status: 403, headers: cabeceras });
  }
  console.error(`[api/${ruta}]`, { organizationId, message: error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error) });
  return Response.json({ error: 'No pudimos completar la operación.', codigo: 'error_interno' }, { status: 500, headers: cabeceras });
}
