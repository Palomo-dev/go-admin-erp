/**
 * Lecturas y escrituras de servidor de «SEO y redes» y de los píxeles de
 * «Analítica» (Figma B/08, B/09). Todo con el cliente de la SESIÓN
 * (`ctx.supabase`, RLS) y la organización del contexto, nunca de la petición.
 *
 * Lo que vive en el documento V2 (título, descripción, imagen y redes) NO pasa
 * por aquí: se guarda con `useSitioV2` (borrador, compare-and-swap). Aquí solo
 * va lo que el documento no modela y sigue en `website_settings`:
 * verificación de Search Console, «Ocultar de los buscadores» y los píxeles.
 *
 * Reutiliza `permisosSitio` (fn_website_tiene_permiso, el criterio de la RLS)
 * y `direccionSitio` (la regla única de la dirección pública).
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { permisosSitio } from '@/lib/services/website/paginasSitioService';
import { direccionSitio, type DireccionSitio } from '@/lib/website/resumenSitio';
import type { DominioDelSitio } from '@/components/sitio-web/rutasSitioWeb';
import { giroDesdeTipo, type GiroSitio } from '@/lib/website/onboardingSitio';
import { getServiceClient } from '@/lib/supabase/server-service';

export type CtxSeo = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

/** Columna ausente (la migración pendiente aún no se aplica). */
const SIN_COLUMNA = new Set(['42703', 'PGRST204']);
export const esSinColumna = (error: unknown): boolean => SIN_COLUMNA.has(((error as { code?: string } | null)?.code ?? '') as string);

export class ErrorSeo extends Error {
  constructor(
    public readonly codigo: 'sin_permiso' | 'peticion_invalida' | 'pendiente_migracion' | 'sin_ajustes',
    public readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorSeo';
  }
}

export async function direccionDelSitio(ctx: CtxSeo): Promise<DireccionSitio> {
  const org = ctx.organizationId;
  const [orgRes, dominiosRes, estadoRes] = await Promise.all([
    ctx.supabase.from('organizations').select('subdomain').eq('id', org).maybeSingle(),
    ctx.supabase.from('organization_domains').select('id, host, domain_type, status, is_primary, is_active').eq('organization_id', org),
    ctx.supabase.from('website_site_states').select('primary_domain_id').eq('organization_id', org).is('branch_id', null).maybeSingle(),
  ]);
  if (orgRes.error) throw orgRes.error;
  if (dominiosRes.error) throw dominiosRes.error;
  // `primary_domain_id` es de una migración del área resumen: sin ella, la regla general.
  const primario = estadoRes.error ? null : ((estadoRes.data as { primary_domain_id?: string | null } | null)?.primary_domain_id ?? null);
  const subdominio = ((orgRes.data as { subdomain?: string | null } | null)?.subdomain ?? null) || null;
  return direccionSitio((dominiosRes.data ?? []) as (DominioDelSitio & { id: string })[], subdominio, primario);
}

export interface DatosSeoServidor {
  permisos: { editar: boolean; publicar: boolean };
  host: string | null;
  url: string | null;
  /** Código de `google_site_verification` (sin la etiqueta). */
  verificacionGoogle: string | null;
  /** `null` = la columna `search_noindex` aún no existe (migración pendiente). */
  ocultarBuscadores: boolean | null;
  productos: { total: number; conDescripcion: number };
  negocio: { nombre: string; giro: GiroSitio; logoUrl: string | null };
}

async function contar(consulta: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await consulta;
  if (error) throw error;
  return count ?? 0;
}

async function leerAjustesSeo(ctx: CtxSeo): Promise<{ verificacion: string | null; noindex: boolean | null }> {
  const base = () => ctx.supabase.from('website_settings').select('google_site_verification').eq('organization_id', ctx.organizationId).is('branch_id', null).maybeSingle();
  const completo = await ctx.supabase
    .from('website_settings')
    .select('google_site_verification, search_noindex')
    .eq('organization_id', ctx.organizationId)
    .is('branch_id', null)
    .maybeSingle();
  if (!completo.error) {
    const fila = completo.data as { google_site_verification: string | null; search_noindex: boolean | null } | null;
    return { verificacion: fila?.google_site_verification ?? null, noindex: fila ? fila.search_noindex === true : false };
  }
  if (!esSinColumna(completo.error)) throw completo.error;
  const { data, error } = await base();
  if (error) throw error;
  return { verificacion: (data as { google_site_verification: string | null } | null)?.google_site_verification ?? null, noindex: null };
}

export async function leerSeoServidor(ctx: CtxSeo): Promise<DatosSeoServidor> {
  const org = ctx.organizationId;
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorSeo('sin_permiso', 403, 'No tienes permiso para editar el SEO.');
  const [direccion, ajustes, orgRes, total, conDescripcion] = await Promise.all([
    direccionDelSitio(ctx),
    leerAjustesSeo(ctx),
    ctx.supabase.from('organizations').select('name, logo_url, type_id').eq('id', org).maybeSingle(),
    contar(ctx.supabase.from('products').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('status', 'active')),
    contar(
      ctx.supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org)
        .eq('status', 'active')
        .not('description', 'is', null)
        .neq('description', ''),
    ),
  ]);
  if (orgRes.error) throw orgRes.error;
  const o = orgRes.data as { name: string | null; logo_url: string | null; type_id: number | null } | null;
  return {
    permisos,
    host: direccion.host,
    url: direccion.url,
    verificacionGoogle: ajustes.verificacion,
    ocultarBuscadores: ajustes.noindex,
    productos: { total, conDescripcion },
    negocio: { nombre: o?.name ?? '', giro: giroDesdeTipo(o?.type_id ?? null), logoUrl: o?.logo_url ?? null },
  };
}

/**
 * Escribe en `website_settings` (fila del sitio principal) lo que el documento
 * V2 no modela. Exige `website.sites.edit` resuelto en la base
 * (`fn_website_tiene_permiso`) y escribe con service role acotado a la
 * organización de la sesión: la política de escritura de `website_settings`
 * decide por el NOMBRE del rol («Admins pueden modificar website»), que es
 * justo lo que CLAUDE.md prohíbe, y negaría la escritura a quien tiene el
 * permiso por cargo. Reportado para corregir la política.
 */
export async function guardarAjustesServidor(ctx: CtxSeo, cambios: Record<string, string | boolean | null>): Promise<void> {
  if (Object.keys(cambios).length === 0) return;
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorSeo('sin_permiso', 403, 'No tienes permiso para editar el sitio web.');
  const { data, error } = await getServiceClient()
    .from('website_settings')
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('organization_id', ctx.organizationId)
    .is('branch_id', null)
    .select('id');
  if (error) {
    if (esSinColumna(error)) throw new ErrorSeo('pendiente_migracion', 409, 'Esta opción se activa con una migración pendiente.');
    throw error;
  }
  if (!data || data.length === 0) throw new ErrorSeo('sin_ajustes', 404, 'El sitio aún no tiene ajustes. Crea el sitio desde el Resumen.');
}

/** Respuesta de error común de las rutas de esta área. */
export function respuestaErrorSeo(error: unknown, ruta: string, organizationId: number): Response {
  const cabeceras = { 'Cache-Control': 'private, no-store' };
  if (error instanceof ErrorSeo) {
    return Response.json({ error: error.message, codigo: error.codigo }, { status: error.status, headers: cabeceras });
  }
  if ((error as { code?: string } | null)?.code === '42501') {
    return Response.json({ error: 'No tienes acceso al sitio web.', codigo: 'sin_permiso' }, { status: 403, headers: cabeceras });
  }
  console.error(`[api/${ruta}]`, { organizationId, message: error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error) });
  return Response.json({ error: 'No pudimos completar la operación.', codigo: 'error_interno' }, { status: 500, headers: cabeceras });
}
