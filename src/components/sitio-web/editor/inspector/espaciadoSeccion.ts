import { sanitizarCarrusel } from '@/lib/website/v2/paginacionCarrusel';
/**
 * Espaciado y ancho de una sección: una sola opción por función (Figma v2,
 * pestaña Estilo › Espaciado y Ancho). Los campos sueltos de versiones
 * anteriores (relleno y margen por lado, «Ancho completo de pantalla», ancho del
 * contenido) ya no se pintan en Diseño; si la sección los tiene guardados, la
 * tienda los sigue aplicando y salen en «Ajustes de versiones anteriores».
 */
import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';
import type { EntradaAnterior } from './anterioresLogica';

/** Campos del catálogo que ya no se pintan: su función la cubre Estilo › Espaciado / Ancho. */
export function campoCubiertoPorEstilo(c: Pick<ContentFieldDef, 'key' | 'type'> & { group?: string }, tipoSeccion: string): boolean {
  if (c.type === 'spacing') return true;
  // PRODUC-37..40 / FEATUR-14..17: el panel «Carrusel» manda; lo guardado pasa a él al editarlo.
  if (c.group === 'carousel' && TIPOS_CARRUSEL_ANTERIOR.includes(tipoSeccion) && (CLAVES_CARRUSEL_ANTERIOR as readonly string[]).includes(c.key)) return true;
  if (c.key === 'full_bleed' || c.key === 'container_width') return true;
  // `categories_grid.full_width`: la tienda no lo lee (sin efecto); el ancho lo da Estilo › Ancho.
  // MAP-09: el mapa embebido siempre muestra el marcador; `show_marker` no tiene efecto.
  if (c.key === 'show_marker' && tipoSeccion === 'map') return true;
  return c.key === 'full_width' && tipoSeccion === 'categories_grid';
}

const TIPOS_CARRUSEL_ANTERIOR = ['products_grid', 'featured_products'];
const CLAVES_CARRUSEL_ANTERIOR = ['slides_per_view', 'autoplay', 'loop', 'enable_swipe'] as const;

function numeroEntre(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : undefined;
}

/**
 * Al dejar de usar el carrusel global en products_grid / featured_products, el carrusel propio
 * arranca con lo que la sección ya tenía (slides_per_view, autoplay, loop, enable_swipe y sus
 * valores por defecto de siempre), así la tienda se ve igual al cambiar de opción.
 */
export function carruselDesdeClavesAnteriores(contenido: Record<string, unknown>, tipoSeccion: string): Record<string, unknown> {
  if (!TIPOS_CARRUSEL_ANTERIOR.includes(tipoSeccion)) return {};
  const spv = contenido.slides_per_view;
  const o = spv && typeof spv === 'object' ? (spv as Record<string, unknown>) : null;
  const escritorio = numeroEntre(o ? o.desktop : spv, 1, 8) ?? 4;
  return {
    visiblesEscritorio: escritorio,
    visiblesTableta: numeroEntre(o?.tablet, 1, 8) ?? Math.min(3, escritorio),
    visiblesMovil: numeroEntre(o?.mobile, 1, 8) ?? Math.min(2, escritorio),
    autoplay: contenido.autoplay === true,
    loop: contenido.loop !== false,
    arrastre: contenido.enable_swipe !== false,
  };
}

const GRUPOS: ReadonlyArray<{ id: string; claves: readonly string[]; motivo?: EntradaAnterior['motivo']; solo?: string }> = [
  { id: 'seccion_padding_top', claves: ['padding_top', 'padding_top_px'], motivo: 'mandaEspaciado' },
  { id: 'seccion_padding_bottom', claves: ['padding_bottom', 'padding_bottom_px'], motivo: 'mandaEspaciado' },
  { id: 'seccion_padding_x', claves: ['padding_x'] },
  { id: 'seccion_margin_top', claves: ['margin_top'] },
  { id: 'seccion_margin_bottom', claves: ['margin_bottom'] },
  { id: 'seccion_full_bleed', claves: ['full_bleed'], motivo: 'mandaAncho' },
  { id: 'seccion_container_width', claves: ['container_width'], motivo: 'mandaAncho' },
  { id: 'seccion_full_width', claves: ['full_width'], motivo: 'sinEfecto', solo: 'categories_grid' },
  { id: 'seccion_show_marker', claves: ['show_marker'], motivo: 'sinEfecto', solo: 'map' },
  ...TIPOS_CARRUSEL_ANTERIOR.map((solo) => ({ id: 'seccion_carrusel', claves: CLAVES_CARRUSEL_ANTERIOR, motivo: 'mandaCarrusel' as const, solo })),
];

const presente = (v: unknown) => v !== undefined && v !== null && v !== '';

/** Entradas «Ajustes de versiones anteriores» de una sección (solo las que tienen valor guardado). */
export function entradasAnterioresSeccion(contenido: Record<string, unknown>, tipoSeccion: string): EntradaAnterior[] {
  const salida: EntradaAnterior[] = [];
  for (const g of GRUPOS) {
    if (g.solo && g.solo !== tipoSeccion) continue;
    if (!g.claves.some((k) => presente(contenido[k]))) continue;
    salida.push({ id: g.id, quitar: Object.fromEntries(g.claves.map((k) => [k, null])), ...(g.motivo ? { motivo: g.motivo } : {}) });
  }
  return salida;
}

/** Aplica un cambio de «Quitar»: `null` borra la clave del contenido. */
export function aplicarCambioContenido(contenido: Record<string, unknown>, cambio: Record<string, unknown>): Record<string, unknown> {
  const siguiente = { ...contenido };
  for (const [k, v] of Object.entries(cambio)) {
    if (v === null || v === undefined) delete siguiente[k];
    else siguiente[k] = v;
  }
  return siguiente;
}

const IMAGENES_PORTADA = ['image_url', 'image_url_mobile'];
const conImagen = (c: Record<string, unknown>) => IMAGENES_PORTADA.some((k) => typeof c[k] === 'string' && (c[k] as string).trim() !== '');

/**
 * Portada «Pantalla completa»: sin imagen la capa se ve al 100 (D4). Si quedó guardada en 100 y se
 * sube la primera imagen, baja sola a 70 (el default con imagen) para que la foto se vea.
 */
export function capaAlSubirPrimeraImagen(
  tipo: string,
  variante: string | null | undefined,
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
): Record<string, unknown> {
  if (tipo !== 'hero' || variante !== 'fullscreen') return despues;
  if (conImagen(antes) || !conImagen(despues)) return despues;
  if (Number(despues.overlay_opacity) !== 100) return despues;
  return { ...despues, overlay_opacity: 70 };
}

/**
 * CASCAR-02: un solo campo de título y uno de subtítulo/descripción. La tienda pinta
 * `section_header.title || title` y `section_header.description || descripción`; el campo de
 * Contenido muestra lo que se ve y, al editar, escribe la clave de Contenido y borra la copia
 * del encabezado (si no, el cambio no se vería).
 */
const CLAVE_ENCABEZADO_DE: Record<string, 'title' | 'description'> = { title: 'title', subtitle: 'description' };

export function valorTextoEncabezado(contenido: Record<string, unknown>, clave: string): unknown {
  const k = CLAVE_ENCABEZADO_DE[clave];
  const h = contenido.section_header;
  if (k && h && typeof h === 'object') {
    const v = (h as Record<string, unknown>)[k];
    if (typeof v === 'string' && v) return v;
  }
  return contenido[clave];
}

export function cambioTextoEncabezado(contenido: Record<string, unknown>, clave: string, valor: unknown): Record<string, unknown> {
  const siguiente: Record<string, unknown> = { ...contenido, [clave]: valor };
  const k = CLAVE_ENCABEZADO_DE[clave];
  const h = contenido.section_header;
  if (k && h && typeof h === 'object' && k in (h as Record<string, unknown>)) {
    const header = { ...(h as Record<string, unknown>) };
    delete header[k];
    if (Object.keys(header).length) siguiente.section_header = header;
    else delete siguiente.section_header;
  }
  return siguiente;
}

/** Igual que la tienda: el carrusel global cuenta si tiene algún ajuste además de `usar_global`. */
export function carruselGlobalActivo(global: unknown): boolean {
  const g = sanitizarCarrusel(global);
  if (!g) return false;
  return Object.keys(g).some((k) => k !== 'usar_global');
}

export const CLAVES_VER_TODO = ['view_all', 'view_all_label', 'view_all_url', 'view_all_style'] as const;

/** El botón «Ver todo» anterior, como lo pinta la tienda (`accionDesdeVerTodo` de goadmin-websites). */
export function accionDesdeVerTodo(e: Record<string, unknown>): Record<string, unknown> | undefined {
  if (e.view_all !== true || typeof e.view_all_url !== 'string' || !e.view_all_url) return undefined;
  const estilo = typeof e.view_all_style === 'string' && e.view_all_style ? e.view_all_style : undefined;
  return {
    text: typeof e.view_all_label === 'string' && e.view_all_label ? e.view_all_label : 'Ver todo',
    href: e.view_all_url,
    kind: estilo === 'ghost' ? 'link' : 'button',
    position: e.layout === 'inline' ? 'inline' : 'below',
    ...(estilo ? { style: estilo } : {}),
    ...(estilo === 'ghost' ? { icon: true } : {}),
  };
}

