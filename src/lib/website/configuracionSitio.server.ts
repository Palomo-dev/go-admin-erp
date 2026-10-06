/**
 * «Configuración del sitio» en el servidor (Figma B/12). Lectura con el cliente
 * de la SESIÓN y la organización del contexto; escritura por la RPC
 * transaccional `update_website_settings` (migración pendiente
 * 20261008150000), que exige `website.sites.edit` en la base.
 *
 * Mientras la migración no esté aplicada:
 * - La lectura degrada: lee las columnas que sí existen y marca como
 *   `pendientes` las funciones que aún no se pueden editar.
 * - La escritura de lo que YA existe (el interruptor del chat) va por
 *   `guardarAjustesServidor` (la misma ruta que usa SEO y redes); lo demás
 *   responde 409 `pendiente_migracion` en lugar de fallar en silencio.
 *
 * Reutiliza `permisosSitio` (fn_website_tiene_permiso) y `direccionDelSitio`
 * (la regla única de la dirección pública).
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { permisosSitio } from '@/lib/services/website/paginasSitioService';
import { direccionDelSitio, guardarAjustesServidor, ErrorSeo } from '@/components/sitio-web/seoanalitica/seo.server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';
import {
  IDIOMAS_SITIO,
  columnasDeCambios,
  funcionDeColumna,
  type CodigoMedida,
  type FuncionPendiente,
  type IdiomaSitio,
  type RespuestaConfiguracion,
  type esquemaCambiosConfiguracion,
} from './configuracionSitio';
import type { z } from 'zod';

export type CtxConfiguracion = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase'>;

export class ErrorConfiguracion extends Error {
  constructor(
    public readonly codigo: 'sin_permiso' | 'peticion_invalida' | 'pendiente_migracion' | 'sin_ajustes' | 'confirmacion_invalida',
    public readonly status: number,
    mensaje: string,
    public readonly detalle?: unknown,
  ) {
    super(mensaje);
    this.name = 'ErrorConfiguracion';
  }
}

const SIN_COLUMNA = new Set(['42703', 'PGRST204']);
const SIN_FUNCION = new Set(['42883', 'PGRST202']);
const esSinColumna = (e: unknown) => SIN_COLUMNA.has(((e as { code?: string } | null)?.code ?? '') as string);
const esSinFuncion = (e: unknown) => SIN_FUNCION.has(((e as { code?: string } | null)?.code ?? '') as string);

const COLUMNAS_BASE = 'chat_widget_enabled, custom_scripts, is_published, published_at';
const COLUMNAS_NUEVAS =
  'contact_email, contact_phone, whatsapp_number, whatsapp_greeting, site_locale, maintenance_mode, maintenance_message, custom_code';

interface FilaAjustes {
  chat_widget_enabled: boolean | null;
  custom_scripts: string | null;
  is_published: boolean | null;
  published_at: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  whatsapp_number?: string | null;
  whatsapp_greeting?: string | null;
  site_locale?: string | null;
  maintenance_mode?: boolean | null;
  maintenance_message?: string | null;
  custom_code?: unknown;
}

interface ItemCodigoBd {
  id?: string;
  nombre?: string;
  alcance?: string;
  posicion?: string;
  activo?: boolean;
  codigo?: string;
  creado_por?: string | null;
  creado_en?: string | null;
}

/** Nombre visible del autor de cada bloque (perfil de la persona), sin exponer correos. */
async function nombresDeAutores(ctx: CtxConfiguracion, ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (ids.length === 0) return mapa;
  const { data, error } = await ctx.supabase.from('profiles').select('id, first_name, last_name').in('id', ids);
  if (error) return mapa;
  for (const p of (data ?? []) as { id: string; first_name: string | null; last_name: string | null }[]) {
    const nombre = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    if (nombre) mapa.set(p.id, nombre);
  }
  return mapa;
}

/** `custom_code` (jsonb) → lista tipada; sin la columna, el texto libre anterior como un bloque de solo lectura. */
export function codigoDeFila(fila: Pick<FilaAjustes, 'custom_code' | 'custom_scripts'>, autores: Map<string, string>): CodigoMedida[] {
  const lista: CodigoMedida[] = Array.isArray(fila.custom_code)
    ? (fila.custom_code as ItemCodigoBd[]).map((c) => ({
        id: c.id ?? null,
        nombre: c.nombre ?? '',
        alcance: c.alcance ?? 'todas',
        posicion: c.posicion === 'head' ? 'head' : 'body',
        activo: c.activo !== false,
        codigo: c.codigo ?? '',
        autor: c.creado_por ? autores.get(c.creado_por) ?? null : null,
        creadoEn: c.creado_en ?? null,
      }))
    : [];
  const anterior = (fila.custom_scripts ?? '').trim();
  if (anterior) {
    lista.push({ id: null, nombre: 'Código anterior', alcance: 'todas', posicion: 'body', activo: true, codigo: anterior, autor: null, creadoEn: null, legado: true });
  }
  return lista;
}

async function leerAjustes(ctx: CtxConfiguracion): Promise<{ fila: FilaAjustes | null; pendiente: boolean }> {
  const consulta = (cols: string) =>
    ctx.supabase.from('website_settings').select(cols).eq('organization_id', ctx.organizationId).is('branch_id', null).maybeSingle();
  const completo = await consulta(`${COLUMNAS_BASE}, ${COLUMNAS_NUEVAS}`);
  if (!completo.error) return { fila: completo.data as unknown as FilaAjustes | null, pendiente: false };
  if (!esSinColumna(completo.error)) throw completo.error;
  const base = await consulta(COLUMNAS_BASE);
  if (base.error) throw base.error;
  return { fila: base.data as unknown as FilaAjustes | null, pendiente: true };
}

export async function leerConfiguracion(ctx: CtxConfiguracion): Promise<RespuestaConfiguracion> {
  const org = ctx.organizationId;
  const [permisos, direccion, ajustes, orgRes, chatRes, monedasRes, monedaBase, restaurante] = await Promise.all([
    permisosSitio(ctx),
    direccionDelSitio(ctx),
    leerAjustes(ctx),
    ctx.supabase.from('organizations').select('name, logo_url, email, phone, subdomain').eq('id', org).maybeSingle(),
    ctx.supabase.from('organization_modules').select('is_active').eq('organization_id', org).eq('module_code', 'chat').maybeSingle(),
    ctx.supabase.from('organization_currencies').select('currency_code, is_base').eq('organization_id', org),
    resolveOrgCurrency(ctx.supabase, org),
    // El mismo criterio de giro que la Carta: el enlace a Reservas web solo sale en restaurantes.
    // (import diferido: carta.server arrastra dependencias que esta ruta no necesita al cargar).
    import('@/lib/website/carta.server').then((m) => m.esRestaurante(ctx)).catch(() => false),
  ]);
  if (orgRes.error) throw orgRes.error;
  if (monedasRes.error) throw monedasRes.error;

  const fila = ajustes.fila;
  const ids = Array.isArray(fila?.custom_code)
    ? [...new Set((fila!.custom_code as ItemCodigoBd[]).map((c) => c.creado_por).filter((x): x is string => !!x))]
    : [];
  const autores = await nombresDeAutores(ctx, ids);
  const o = (orgRes.data ?? {}) as { name?: string; logo_url?: string | null; email?: string | null; phone?: string | null; subdomain?: string | null };
  const monedas = (monedasRes.data ?? []) as { currency_code: string; is_base: boolean | null }[];
  const idioma = (IDIOMAS_SITIO as readonly string[]).includes(fila?.site_locale ?? '') ? (fila!.site_locale as IdiomaSitio) : 'es-CO';

  // Columnas y RPC (update_website_settings, delete_website) llegan en la misma migración.
  const pendientes: FuncionPendiente[] = ajustes.pendiente ? ['contacto', 'idioma', 'mantenimiento', 'codigo', 'eliminar'] : [];

  return {
    permisos,
    host: direccion.host,
    subdominio: o.subdomain || null,
    organizacion: { nombre: o.name ?? '', logoUrl: o.logo_url ?? null, correo: o.email ?? null, telefono: o.phone ?? null },
    ajustes: {
      correo: fila?.contact_email ?? null,
      telefono: fila?.contact_phone ?? null,
      whatsapp: fila?.whatsapp_number ?? null,
      saludoWhatsapp: fila?.whatsapp_greeting ?? null,
      chatActivo: fila?.chat_widget_enabled === true,
      idioma,
      mantenimiento: fila?.maintenance_mode === true,
      mensajeMantenimiento: fila?.maintenance_message ?? null,
      codigo: fila ? codigoDeFila(fila, autores) : [],
      publicado: fila?.is_published === true,
      publicadoEn: fila?.published_at ?? null,
    },
    moduloChat: (chatRes.data as { is_active?: boolean } | null)?.is_active === true,
    esRestaurante: restaurante,
    monedas: { base: monedaBase.code, todas: monedas.map((m) => m.currency_code.trim()) },
    pendientes,
  };
}

/** Guarda el parche en un paso (RPC) o, sin la migración, solo lo que ya tiene columna. */
export async function guardarConfiguracion(ctx: CtxConfiguracion, cambios: z.output<typeof esquemaCambiosConfiguracion>): Promise<void> {
  const columnas = columnasDeCambios(cambios);
  if (Object.keys(columnas).length === 0) return;
  const { error } = await ctx.supabase.rpc('update_website_settings', { p_org: ctx.organizationId, p_patch: columnas });
  if (!error) return;
  if ((error as { code?: string }).code === '42501') throw new ErrorConfiguracion('sin_permiso', 403, 'No tienes permiso para editar el sitio web.');
  if ((error as { code?: string }).code === 'P0002') throw new ErrorConfiguracion('sin_ajustes', 404, 'El sitio aún no tiene ajustes. Créalo desde el Resumen.');
  if ((error as { code?: string }).code === '22023' || (error as { code?: string }).code === '23514') {
    throw new ErrorConfiguracion('peticion_invalida', 400, 'Revisa los datos del formulario.');
  }
  if (!esSinFuncion(error)) throw error;

  // Sin la RPC: solo el interruptor del chat tiene columna hoy.
  const sinColumna = Object.keys(columnas)
    .map(funcionDeColumna)
    .filter((f): f is FuncionPendiente => f !== null);
  if (sinColumna.length > 0) {
    throw new ErrorConfiguracion('pendiente_migracion', 409, 'Algunos ajustes se activan con una actualización pendiente.', [...new Set(sinColumna)]);
  }
  try {
    await guardarAjustesServidor(ctx, { chat_widget_enabled: columnas.chat_widget_enabled as boolean });
  } catch (e) {
    if (e instanceof ErrorSeo) throw new ErrorConfiguracion(e.codigo === 'pendiente_migracion' ? 'pendiente_migracion' : e.codigo === 'sin_ajustes' ? 'sin_ajustes' : 'sin_permiso', e.status, e.message);
    throw e;
  }
}

/**
 * Despublicar / volver a publicar (Zona de peligro, B/12-02b). Cambia lo que
 * HOY lee el sitio público (`website_settings.is_published`); el sitio V2 aún
 * no se adopta (ADR-002 D4). Exige `website.sites.publish` en la base; escribe
 * con service role acotado a la organización de la sesión porque la política
 * de `website_settings` decide por el nombre del rol (reportado).
 */
export async function cambiarPublicacion(ctx: CtxConfiguracion, publicado: boolean): Promise<void> {
  const permisos = await permisosSitio(ctx);
  if (!permisos.publicar) throw new ErrorConfiguracion('sin_permiso', 403, 'No tienes permiso para publicar el sitio web.');
  const { data, error } = await getServiceClient()
    .from('website_settings')
    .update({ is_published: publicado, published_at: publicado ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq('organization_id', ctx.organizationId)
    .is('branch_id', null)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new ErrorConfiguracion('sin_ajustes', 404, 'El sitio aún no tiene ajustes. Créalo desde el Resumen.');
}

/** Elimina el sitio con la RPC transaccional `delete_website` (exige el subdominio escrito). */
export async function eliminarSitio(ctx: CtxConfiguracion, confirmacion: string): Promise<void> {
  const { data, error: e1 } = await ctx.supabase.from('organizations').select('subdomain').eq('id', ctx.organizationId).maybeSingle();
  if (e1) throw e1;
  const subdominio = ((data as { subdomain?: string | null } | null)?.subdomain ?? '').trim();
  if (!subdominio || confirmacion.trim().toLowerCase() !== subdominio.toLowerCase()) {
    throw new ErrorConfiguracion('confirmacion_invalida', 400, 'Escribe el subdominio de tu sitio para confirmar.');
  }
  const { error } = await ctx.supabase.rpc('delete_website', { p_org: ctx.organizationId });
  if (!error) return;
  if ((error as { code?: string }).code === '42501') throw new ErrorConfiguracion('sin_permiso', 403, 'No tienes permiso para eliminar el sitio.');
  if (esSinFuncion(error)) throw new ErrorConfiguracion('pendiente_migracion', 409, 'Eliminar el sitio se activa con una actualización pendiente.', ['eliminar']);
  throw error;
}

export function respuestaErrorConfiguracion(error: unknown, ruta: string, organizationId: number): Response {
  const cabeceras = { 'Cache-Control': 'private, no-store' };
  if (error instanceof ErrorConfiguracion) {
    return Response.json({ error: error.message, codigo: error.codigo, detalle: error.detalle ?? null }, { status: error.status, headers: cabeceras });
  }
  if ((error as { code?: string } | null)?.code === '42501') {
    return Response.json({ error: 'No tienes acceso al sitio web.', codigo: 'sin_permiso' }, { status: 403, headers: cabeceras });
  }
  console.error(`[api/${ruta}]`, { organizationId, message: error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error) });
  return Response.json({ error: 'No pudimos completar la operación.', codigo: 'error_interno' }, { status: 500, headers: cabeceras });
}
