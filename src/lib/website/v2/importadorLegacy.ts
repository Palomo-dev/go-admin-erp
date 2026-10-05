/**
 * Importador legacy → documento de sitio V2 (ETAPA-1 §«Qué tiene que cambiar después», ERP 2).
 *
 * Lectura pura: recibe filas ya leídas de `website_settings`, `website_pages`,
 * `website_page_sections`, `website_menus` y `website_menu_items` y devuelve un documento que
 * pasa `validarDocumentoSitio`. Nunca escribe en legacy. Se usa una vez, al crear el sitio V2
 * (ADR-002 D3/D4), y para refrescar un menú concreto en el borrador.
 *
 * Reglas:
 * - D12: solo se importan las columnas con destino en el documento (`mapeoAjustes.ts`); las 15
 *   sin efecto, comercio, integraciones, metadatos y obsoletas se quedan en la fila legacy.
 * - D6: el sitio principal conserva sus valores actuales como explícitos (`campoExplicito`).
 * - D3: los menús se copian a `menus[]` con su uuid como id estable. Si el encabezado no tiene
 *   menú nombrado, las páginas con `show_in_header` se convierten en un menú (lo mismo para el pie).
 * - Shell: en `opciones` solo lo que difiere del default (D12, hallazgo 4).
 * - Slugs: el contrato no admite `_`. Las plantillas `__product_detail` (una por organización)
 *   pasan a `plantillas/product-detail`; el tipo de página (`page_type`) se conserva tal cual.
 * - `website_pages.page_settings` no tiene destino en el contrato actual: se informa en `avisos`.
 */
import {
  campoExplicito,
  heredar,
  validarDocumentoSitio,
  VERSION_ESQUEMA_DOCUMENTO,
  LIMITES_DOCUMENTO,
  type DocumentoSitio,
  type ItemMenu,
  type MenuSitio,
  type PaginaSitio,
  type SeccionSitio,
} from '@/lib/website/contrato/documentoSitio';
import {
  CAMPOS_HEREDABLES,
  COLUMNAS_SHELL_ESTRUCTURA,
  OPCIONES_SHELL,
  esVacio,
  igualesEstructural,
} from './mapeoAjustes';
import { fijarCampo, structuredCloneSeguro } from './rutasDocumento';

// ─── Filas legacy (columnas verificadas por MCP el 2026-10-05) ─────────────────────────────────

export type FilaAjustesLegacy = Record<string, unknown>;

export interface FilaPaginaLegacy {
  id: string;
  slug: string;
  title: string;
  page_type: string;
  is_published: boolean | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  show_in_header: boolean | null;
  show_in_footer: boolean | null;
  header_order: number | null;
  footer_order: number | null;
  parent_page_id: string | null;
  page_settings?: Record<string, unknown> | null;
}

export interface FilaSeccionLegacy {
  id: string;
  page_id: string;
  section_type: string;
  section_variant: string | null;
  content: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  sort_order: number | null;
  is_visible: boolean | null;
}

export interface FilaMenuLegacy {
  id: string;
  name: string;
  location: string;
  footer_column: number | null;
  footer_order: number | null;
  header_order: number | null;
  is_active: boolean;
  branch_id?: number | null;
}

export interface FilaItemMenuLegacy {
  id: string;
  menu_id: string;
  item_type: string;
  page_id: string | null;
  category_id: number | null;
  custom_label: string | null;
  custom_url: string | null;
  parent_item_id: string | null;
  display_order: number | null;
  is_active: boolean;
}

export interface EntradaImportacion {
  ajustes: FilaAjustesLegacy | null;
  paginas: FilaPaginaLegacy[];
  secciones: FilaSeccionLegacy[];
  menus: FilaMenuLegacy[];
  itemsMenu: FilaItemMenuLegacy[];
}

export type ResultadoImportacion =
  | { ok: true; documento: DocumentoSitio; avisos: string[] }
  | { ok: false; errores: { ruta: string; codigo: string }[]; avisos: string[] };

export const MENU_PAGINAS_ENCABEZADO = 'paginas-encabezado';
export const MENU_PAGINAS_PIE = 'paginas-pie';

const TEXTO_CORTO = LIMITES_DOCUMENTO.longitudTextoCorto;

// ─── Utilidades ───────────────────────────────────────────────────────────────────────────────

/** Convierte un slug legacy al formato del contrato. Exportado para pruebas. */
export function normalizarSlug(slug: string): string {
  const crudo = (slug ?? '').trim().toLowerCase();
  const esPlantilla = crudo.startsWith('__');
  const limpio = crudo
    .split('/')
    .map((parte) =>
      parte
        .replace(/_/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, ''),
    )
    .filter(Boolean)
    .join('/');
  const conPrefijo = esPlantilla && limpio ? `plantillas/${limpio}` : limpio;
  return conPrefijo.slice(0, LIMITES_DOCUMENTO.longitudSlug).replace(/[-/]+$/g, '');
}

function recortar(texto: string | null | undefined, max: number = TEXTO_CORTO): string {
  return (texto ?? '').slice(0, max);
}

function porOrden<T>(clave: (x: T) => number | null | undefined) {
  return (a: T, b: T) => (clave(a) ?? 0) - (clave(b) ?? 0);
}

function esPaginaDeMenu(p: FilaPaginaLegacy): boolean {
  return p.is_published !== false && !p.slug.startsWith('__');
}

// ─── Páginas y secciones ──────────────────────────────────────────────────────────────────────

function importarSeccion(s: FilaSeccionLegacy): SeccionSitio {
  const visible = s.is_visible !== false;
  return {
    id: s.id,
    tipo: recortar(s.section_type, 64) || 'desconocida',
    variante: s.section_variant ? recortar(s.section_variant, 64) : null,
    version: 1,
    contenido: (s.content && typeof s.content === 'object' ? s.content : {}) as Record<string, unknown>,
    diseno: (s.settings && typeof s.settings === 'object' ? s.settings : {}) as Record<string, unknown>,
    visibilidad: { movil: visible, escritorio: visible },
  };
}

function seoDePagina(p: FilaPaginaLegacy): PaginaSitio['seo'] {
  const seo: NonNullable<PaginaSitio['seo']> = {};
  if (!esVacio(p.meta_title)) seo.titulo = { mode: 'value', value: recortar(p.meta_title) };
  if (!esVacio(p.meta_description)) seo.descripcion = { mode: 'value', value: (p.meta_description ?? '').slice(0, 500) };
  if (!esVacio(p.og_image_url)) seo.imagenOgUrl = { mode: 'value', value: recortar(p.og_image_url, LIMITES_DOCUMENTO.longitudUrl) };
  return Object.keys(seo).length > 0 ? seo : undefined;
}

function importarPaginas(entrada: EntradaImportacion, avisos: string[]): PaginaSitio[] {
  const seccionesPorPagina = new Map<string, FilaSeccionLegacy[]>();
  for (const s of entrada.secciones) {
    const lista = seccionesPorPagina.get(s.page_id) ?? [];
    lista.push(s);
    seccionesPorPagina.set(s.page_id, lista);
  }

  const slugsUsados = new Set<string>();
  const paginas: PaginaSitio[] = [];
  const ordenadas = [...entrada.paginas].sort(porOrden((p) => p.header_order));
  for (const p of ordenadas.slice(0, LIMITES_DOCUMENTO.paginasMaximas)) {
    let slug = normalizarSlug(p.slug);
    if (slug !== p.slug) avisos.push(`slug_normalizado:${p.id}`);
    if (!slug) slug = `pagina-${paginas.length + 1}`;
    const base = slug;
    let n = 2;
    while (slugsUsados.has(slug)) slug = `${base}-${n++}`;
    slugsUsados.add(slug);

    const secciones = (seccionesPorPagina.get(p.id) ?? []).sort(porOrden((s) => s.sort_order));
    if (secciones.length > LIMITES_DOCUMENTO.seccionesPorPagina) avisos.push(`secciones_recortadas:${p.id}`);
    if (p.page_settings && Object.keys(p.page_settings).length > 0) avisos.push(`page_settings_sin_destino:${p.id}`);

    const pagina: PaginaSitio = {
      id: p.id,
      slug,
      tipo: recortar(p.page_type, 64) || 'custom',
      titulo: recortar(p.title),
      publicada: p.is_published !== false,
      secciones: secciones.slice(0, LIMITES_DOCUMENTO.seccionesPorPagina).map(importarSeccion),
    };
    const seo = seoDePagina(p);
    if (seo) pagina.seo = seo;
    paginas.push(pagina);
  }
  if (entrada.paginas.length > LIMITES_DOCUMENTO.paginasMaximas) avisos.push('paginas_recortadas');
  return paginas;
}

// ─── Menús ────────────────────────────────────────────────────────────────────────────────────

interface NodoArbol {
  id: string;
  padre: string | null;
  orden: number;
}

/** Arma un árbol de ítems a partir de una lista plana con padre, respetando la profundidad máxima. */
function armarArbol<T extends NodoArbol>(
  nodos: T[],
  convertir: (n: T) => ItemMenu | null,
  avisos: string[],
): ItemMenu[] {
  const ids = new Set(nodos.map((n) => n.id));
  const hijos = new Map<string | null, T[]>();
  for (const n of nodos) {
    const padre = n.padre && ids.has(n.padre) ? n.padre : null;
    const lista = hijos.get(padre) ?? [];
    lista.push(n);
    hijos.set(padre, lista);
  }
  const visitar = (padre: string | null, nivel: number): ItemMenu[] => {
    const lista = (hijos.get(padre) ?? []).sort((a, b) => a.orden - b.orden);
    const resultado: ItemMenu[] = [];
    for (const n of lista) {
      const item = convertir(n);
      if (!item) continue;
      if (nivel < LIMITES_DOCUMENTO.profundidadMenu) {
        const subitems = visitar(n.id, nivel + 1);
        if (subitems.length > 0) item.hijos = subitems.slice(0, 50);
      } else if ((hijos.get(n.id) ?? []).length > 0) {
        avisos.push(`menu_profundidad_recortada:${n.id}`);
      }
      resultado.push(item);
    }
    return resultado;
  };
  return visitar(null, 1);
}

function importarMenu(
  menu: FilaMenuLegacy,
  items: FilaItemMenuLegacy[],
  paginas: Map<string, PaginaSitio>,
  avisos: string[],
): MenuSitio {
  const activos = items.filter((i) => i.menu_id === menu.id && i.is_active);
  const convertir = (i: FilaItemMenuLegacy & NodoArbol): ItemMenu | null => {
    const etiquetaPropia = recortar(i.custom_label);
    if (i.item_type === 'page') {
      const pagina = i.page_id ? paginas.get(i.page_id) : undefined;
      if (!pagina) {
        avisos.push(`item_menu_sin_pagina:${i.id}`);
        return null;
      }
      return { id: i.id, etiqueta: etiquetaPropia || pagina.titulo || 'Página', tipo: 'page', paginaId: pagina.id };
    }
    if (i.item_type === 'category' && i.category_id !== null) {
      return { id: i.id, etiqueta: etiquetaPropia || 'Categoría', tipo: 'entity', entidad: 'category', entidadId: String(i.category_id) };
    }
    if (i.item_type === 'custom' && !esVacio(i.custom_url)) {
      return { id: i.id, etiqueta: etiquetaPropia || 'Enlace', tipo: 'custom', url: recortar(i.custom_url, LIMITES_DOCUMENTO.longitudUrl) };
    }
    avisos.push(`item_menu_no_importable:${i.id}`);
    return null;
  };
  const nodos = activos.map((i) => ({ ...i, padre: i.parent_item_id, orden: i.display_order ?? 0 }));
  const arbol = armarArbol(nodos, convertir, avisos);
  return {
    id: menu.id,
    nombre: recortar(menu.name) || 'Menú',
    items: arbol.slice(0, LIMITES_DOCUMENTO.itemsPorMenu),
  };
}

/** Menú derivado de `show_in_header` / `show_in_footer` cuando no hay menú nombrado (D3). */
function menuDePaginas(
  id: string,
  nombre: string,
  filas: FilaPaginaLegacy[],
  paginas: Map<string, PaginaSitio>,
  cual: 'header' | 'footer',
  avisos: string[],
): MenuSitio | null {
  const elegidas = filas.filter(
    (p) => esPaginaDeMenu(p) && paginas.has(p.id) && (cual === 'header' ? p.show_in_header : p.show_in_footer),
  );
  if (elegidas.length === 0) return null;
  const nodos = elegidas.map((p) => ({
    id: p.id,
    padre: cual === 'header' ? p.parent_page_id : null,
    orden: (cual === 'header' ? p.header_order : p.footer_order) ?? 0,
  }));
  const items = armarArbol(
    nodos,
    (n) => {
      const pagina = paginas.get(n.id)!;
      return { id: `p-${n.id}`, etiqueta: pagina.titulo || 'Página', tipo: 'page', paginaId: pagina.id };
    },
    avisos,
  );
  return { id, nombre, items };
}

// ─── Documento ────────────────────────────────────────────────────────────────────────────────

function opcionesDe(ajustes: FilaAjustesLegacy, zona: 'header' | 'footer'): Record<string, unknown> {
  const opciones: Record<string, unknown> = {};
  for (const [columna, def] of Object.entries(OPCIONES_SHELL)) {
    if (def.zona !== zona || !(columna in ajustes)) continue;
    const valor = ajustes[columna];
    if (valor === undefined || igualesEstructural(valor, def.porDefecto)) continue;
    opciones[columna] = valor;
  }
  return opciones;
}

/**
 * Importa el estado legacy de un sitio a un documento V2 y lo valida con el contrato.
 * Si el resultado no pasa el contrato devuelve `ok: false` con los errores: nunca un documento
 * a medias.
 */
export function importarSitioLegacy(entrada: EntradaImportacion): ResultadoImportacion {
  const avisos: string[] = [];
  const ajustes = entrada.ajustes ?? {};
  if (!entrada.ajustes) avisos.push('sin_website_settings');

  const paginas = importarPaginas(entrada, avisos);
  const paginasPorId = new Map(paginas.map((p) => [p.id, p]));

  const menus: MenuSitio[] = [];
  const menusLegacy = [...entrada.menus].sort(porOrden((m) => m.header_order));
  for (const m of menusLegacy.slice(0, LIMITES_DOCUMENTO.menusMaximos - 2)) {
    menus.push(importarMenu(m, entrada.itemsMenu, paginasPorId, avisos));
  }
  if (entrada.menus.length > LIMITES_DOCUMENTO.menusMaximos - 2) avisos.push('menus_recortados');
  const idsMenus = new Set(menus.map((m) => m.id));

  // Encabezado: menú nombrado si existe y se importó; si no, menú de páginas.
  const headerMenuId = typeof ajustes.header_menu_id === 'string' ? ajustes.header_menu_id : null;
  let menuPrincipalId: string | null = headerMenuId && idsMenus.has(headerMenuId) ? headerMenuId : null;
  if (headerMenuId && !menuPrincipalId) avisos.push('header_menu_no_importado');
  if (!menuPrincipalId) {
    const derivado = menuDePaginas(MENU_PAGINAS_ENCABEZADO, 'Páginas del encabezado', entrada.paginas, paginasPorId, 'header', avisos);
    if (derivado) {
      menus.push(derivado);
      menuPrincipalId = derivado.id;
    }
  }
  const megaId = typeof ajustes.header_mega_menu_id === 'string' && idsMenus.has(ajustes.header_mega_menu_id)
    ? ajustes.header_mega_menu_id
    : null;

  // Pie: menús con ubicación «footer» por columna y orden; si no hay, menú de páginas.
  let menuIdsPie = menusLegacy
    .filter((m) => m.location === 'footer' && idsMenus.has(m.id))
    .sort((a, b) => (a.footer_column ?? 0) - (b.footer_column ?? 0) || (a.footer_order ?? 0) - (b.footer_order ?? 0))
    .map((m) => m.id);
  if (menuIdsPie.length === 0) {
    const derivado = menuDePaginas(MENU_PAGINAS_PIE, 'Páginas del pie', entrada.paginas, paginasPorId, 'footer', avisos);
    if (derivado) {
      menus.push(derivado);
      menuIdsPie = [derivado.id];
    }
  }

  let documento: DocumentoSitio = {
    schemaVersion: VERSION_ESQUEMA_DOCUMENTO,
    identidad: {},
    tema: { colores: {}, tipografia: {} },
    seo: {},
    contenido: {},
    shell: {
      header: {
        composicion: recortar(String(ajustes.header_style ?? COLUMNAS_SHELL_ESTRUCTURA.header_style.porDefecto)) || 'default',
        menuPrincipalId,
        ...(megaId ? { menuMegaId: megaId } : {}),
        opciones: opcionesDe(ajustes, 'header'),
      },
      footer: {
        composicion: recortar(String(ajustes.footer_style ?? COLUMNAS_SHELL_ESTRUCTURA.footer_style.porDefecto)) || 'default',
        menuIds: menuIdsPie.slice(0, 10),
        opciones: opcionesDe(ajustes, 'footer'),
      },
    },
    menus,
    paginas,
  };

  // D6: el sitio principal conserva sus valores como explícitos.
  for (const campo of CAMPOS_HEREDABLES) {
    const valor = ajustes[campo.columna];
    documento = fijarCampo(documento, campo.ruta, campoExplicito(esVacio(valor) ? null : valor));
  }

  const validacion = validarDocumentoSitio(documento);
  if (!validacion.ok) return { ok: false, errores: validacion.errores, avisos };
  return { ok: true, documento: validacion.documento, avisos };
}

/**
 * Documento inicial de una sede (D6): identidad, tema, SEO y contenido heredan campo a campo
 * del sitio principal; shell, menús (D3: copia, nunca referencia) y páginas se copian de la base.
 * Las secciones copiadas cuentan como «heredadas» mientras sean iguales a las del principal
 * (`estadoSecciones` en `vistaEditor.ts`); al editarlas pasan a ser propias de la sede.
 */
export function documentoSedeDesdeBase(base: DocumentoSitio): DocumentoSitio {
  const copia = structuredCloneSeguro(base);
  let documento: DocumentoSitio = {
    ...copia,
    identidad: {},
    tema: { colores: {}, tipografia: {} },
    seo: {},
    contenido: {},
  };
  // Explícito para que el inspector lo muestre como «heredado» sin depender de la ausencia.
  for (const campo of CAMPOS_HEREDABLES) {
    documento = fijarCampo(documento, campo.ruta, heredar());
  }
  return documento;
}

/** Sustituye (o añade) un menú del documento por su versión importada. No muta la entrada. */
export function reemplazarMenu(documento: DocumentoSitio, menu: MenuSitio): DocumentoSitio {
  const copia = structuredCloneSeguro(documento);
  const i = copia.menus.findIndex((m) => m.id === menu.id);
  if (i >= 0) copia.menus[i] = menu;
  else copia.menus.push(menu);
  return copia;
}

/** Importa un solo menú legacy contra las páginas del documento (refresco o copia de sede). */
export function importarMenuSuelto(
  documento: DocumentoSitio,
  menu: FilaMenuLegacy,
  items: FilaItemMenuLegacy[],
): { menu: MenuSitio; avisos: string[] } {
  const avisos: string[] = [];
  const paginas = new Map(documento.paginas.map((p) => [p.id, p]));
  return { menu: importarMenu(menu, items, paginas, avisos), avisos };
}
