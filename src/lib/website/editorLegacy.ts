/**
 * Contrato del guardado legacy del editor («Guardar y publicar», sitios sin borrador V2).
 *
 * En legacy guardar ES publicar: lo que se escribe en `website_pages`,
 * `website_page_sections` y `website_settings` sale en vivo. Por eso el lote
 * viaja en UNA petición a `POST /api/sitio-web/editor/guardar`, que resuelve la
 * organización en la sesión (`withOrg`), exige `website.sites.edit` y
 * `website.sites.publish` en el servidor y escribe en un solo paso (RPC
 * `fn_editor_guardar_legacy`, pendiente en `supabase/pendientes/`).
 *
 * Este archivo lo comparten el cliente (arma el lote) y el servidor (lo valida).
 */
import { z } from 'zod';

/** Columnas de `website_page_sections` que el editor puede cambiar. */
export const CAMPOS_SECCION = ['section_variant', 'content', 'settings', 'is_visible'] as const;

/** Columnas de `website_pages` que el editor puede cambiar (las de `updatePage`). */
export const CAMPOS_PAGINA = [
  'title',
  'slug',
  'show_in_header',
  'show_in_footer',
  'header_order',
  'footer_order',
  'is_published',
  'meta_title',
  'meta_description',
  'og_image_url',
  'parent_page_id',
  'linked_category_id',
  'menu_icon',
  'menu_badge',
  'page_settings',
] as const;

/** Columnas de menú de `website_pages` (las de `updatePageMenu`). */
export const CAMPOS_MENU = [
  'parent_page_id',
  'linked_category_id',
  'menu_icon',
  'menu_badge',
  'header_order',
  'footer_order',
  'show_in_header',
  'show_in_footer',
] as const;

/**
 * Columnas de `website_settings` que el editor NUNCA escribe: identidad de la fila,
 * estado de publicación (Configuración › Zona de peligro) y código a medida
 * (Configuración › Código y píxeles, con autor y alcance).
 */
export const AJUSTES_PROHIBIDOS = [
  'id',
  'organization_id',
  'branch_id',
  'created_at',
  'updated_at',
  'is_published',
  'published_at',
  'custom_code',
  'custom_css',
  'custom_scripts',
] as const;

const uuid = z.string().uuid();
const objeto = z.record(z.string(), z.unknown());

function soloCampos<T extends readonly string[]>(campos: T) {
  return objeto.refine((o) => Object.keys(o).every((k) => (campos as readonly string[]).includes(k)), {
    message: 'campo_no_permitido',
  });
}

export const esquemaLoteLegacy = z.object({
  paginaId: uuid,
  sedeId: z.number().int().positive().nullable(),
  secciones: z.array(z.object({ id: uuid, cambios: soloCampos(CAMPOS_SECCION) })).max(200),
  orden: z.array(uuid).max(200),
  pagina: soloCampos(CAMPOS_PAGINA),
  ajustes: objeto.refine((o) => Object.keys(o).every((k) => !(AJUSTES_PROHIBIDOS as readonly string[]).includes(k)), {
    message: 'ajuste_no_permitido',
  }),
  menus: z.array(z.object({ id: uuid, cambios: soloCampos(CAMPOS_MENU) })).max(200),
});

export type LoteLegacy = z.infer<typeof esquemaLoteLegacy>;

/** Respuesta del guardado: la fila de ajustes que quedó en vivo (o `null` si no se tocó). */
export interface RespuestaGuardadoLegacy {
  ajustes: Record<string, unknown> | null;
}

/** `true` si el lote no cambia nada (no se envía). */
export function loteVacio(lote: LoteLegacy): boolean {
  return (
    lote.secciones.length === 0 &&
    lote.orden.length === 0 &&
    Object.keys(lote.pagina).length === 0 &&
    Object.keys(lote.ajustes).length === 0 &&
    lote.menus.length === 0
  );
}
