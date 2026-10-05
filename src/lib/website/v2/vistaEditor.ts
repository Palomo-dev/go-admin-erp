/**
 * Adaptador entre el documento de sitio V2 y las formas que ya usa el editor de páginas
 * (`WebsitePageWithSections`, `WebsitePageSection`, `WebsiteSettings`).
 *
 * El editor legacy sigue editando esas formas en memoria; en modo V2 este módulo:
 * - arma la vista desde el borrador (`vistaDesdeDocumento`, `ajustesDesdeDocumento`);
 * - devuelve los cambios al documento (`aplicarPaginaAlDocumento`, `aplicarAjustesAlDocumento`);
 * - resuelve la herencia de una sede (D6) con `resolverCampoConOrigen` del contrato.
 *
 * Código puro: nada se escribe en `website_pages`, `website_page_sections` ni `website_settings`.
 */
import {
  resolverCampoConOrigen,
  serializarDeterminista,
  type CampoHeredable,
  type DocumentoSitio,
  type OrigenCampo,
  type PaginaSitio,
  type SeccionSitio,
} from '@/lib/website/contrato/documentoSitio';
import type { WebsitePageSection, WebsitePageWithSections } from '@/lib/services/websitePageBuilderService';
import type { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import {
  CAMPOS_HEREDABLES,
  COLUMNAS_SHELL_ESTRUCTURA,
  OPCIONES_SHELL,
  campoHeredableDeColumna,
  esVacio,
  igualesEstructural,
} from './mapeoAjustes';
import { fijarCampo, leerCampo, structuredCloneSeguro, valorPropioDe } from './rutasDocumento';

// ─── Páginas y secciones ──────────────────────────────────────────────────────────────────────

export interface ContextoVista {
  organizationId: number;
  /** `null` = sitio principal. */
  branchId: number | null;
}

function textoSeo(campo: CampoHeredable<string> | undefined): string | null {
  return campo && campo.mode === 'value' ? campo.value : null;
}

export function seccionAVista(seccion: SeccionSitio, pagina: PaginaSitio, indice: number, ctx: ContextoVista): WebsitePageSection {
  return {
    id: seccion.id,
    page_id: pagina.id,
    organization_id: ctx.organizationId,
    section_type: seccion.tipo,
    section_variant: seccion.variante ?? 'default',
    content: structuredCloneSeguro(seccion.contenido) as WebsitePageSection['content'],
    settings: structuredCloneSeguro(seccion.diseno ?? {}) as WebsitePageSection['settings'],
    sort_order: indice,
    is_visible: seccion.visibilidad?.escritorio !== false || seccion.visibilidad?.movil !== false,
    created_at: '',
    updated_at: '',
    branch_id: ctx.branchId,
  };
}

export function paginaAVista(pagina: PaginaSitio, ctx: ContextoVista): WebsitePageWithSections {
  return {
    id: pagina.id,
    organization_id: ctx.organizationId,
    slug: pagina.slug,
    title: pagina.titulo,
    description: null,
    page_type: pagina.tipo,
    show_in_header: false,
    show_in_footer: false,
    header_order: 0,
    footer_order: 0,
    is_published: pagina.publicada,
    meta_title: textoSeo(pagina.seo?.titulo),
    meta_description: textoSeo(pagina.seo?.descripcion),
    og_image_url: textoSeo(pagina.seo?.imagenOgUrl),
    created_at: '',
    updated_at: '',
    parent_page_id: null,
    linked_category_id: null,
    menu_icon: null,
    menu_badge: null,
    page_settings: {},
    branch_id: ctx.branchId,
    sections: pagina.secciones.map((s, i) => seccionAVista(s, pagina, i, ctx)),
  };
}

/** Páginas del documento en la forma del selector de páginas del editor. */
export function paginasDesdeDocumento(documento: DocumentoSitio, ctx: ContextoVista): WebsitePageWithSections[] {
  return documento.paginas.map((p) => paginaAVista(p, ctx));
}

/** Vuelve a convertir una sección del editor; conserva `version`, `fuente` y visibilidad fina. */
function seccionDesdeVista(vista: WebsitePageSection, original: SeccionSitio | undefined): SeccionSitio {
  const visibilidadOriginal = original?.visibilidad;
  const visibleOriginal = visibilidadOriginal ? visibilidadOriginal.escritorio || visibilidadOriginal.movil : true;
  const seccion: SeccionSitio = {
    id: vista.id,
    tipo: vista.section_type,
    // La vista muestra `null` como 'default'; si no cambió, se conserva `null` (ida y vuelta exacta).
    variante:
      original && original.variante === null && vista.section_variant === 'default' ? null : vista.section_variant ?? null,
    version: original?.version ?? 1,
    contenido: structuredCloneSeguro(vista.content ?? {}),
    diseno: structuredCloneSeguro(vista.settings ?? original?.diseno ?? {}),
    visibilidad:
      visibilidadOriginal && visibleOriginal === vista.is_visible
        ? { ...visibilidadOriginal }
        : { movil: vista.is_visible, escritorio: vista.is_visible },
  };
  if (original?.fuente) seccion.fuente = structuredCloneSeguro(original.fuente);
  return seccion;
}

/**
 * Devuelve un documento nuevo con la página editada (secciones, orden, visibilidad y SEO).
 * Si la página no existe en el documento, lo devuelve sin cambios.
 */
export function aplicarPaginaAlDocumento(documento: DocumentoSitio, vista: WebsitePageWithSections): DocumentoSitio {
  const copia = structuredCloneSeguro(documento);
  const pagina = copia.paginas.find((p) => p.id === vista.id);
  if (!pagina) return documento;
  const originales = new Map(pagina.secciones.map((s) => [s.id, s]));
  pagina.secciones = vista.sections.map((s) => seccionDesdeVista(s, originales.get(s.id)));

  const seo: NonNullable<PaginaSitio['seo']> = { ...(pagina.seo ?? {}) };
  const fijar = (clave: 'titulo' | 'descripcion' | 'imagenOgUrl', valor: string | null | undefined) => {
    if (esVacio(valor)) delete seo[clave];
    else seo[clave] = { mode: 'value', value: String(valor) };
  };
  fijar('titulo', vista.meta_title);
  fijar('descripcion', vista.meta_description);
  fijar('imagenOgUrl', vista.og_image_url);
  if (Object.keys(seo).length > 0) pagina.seo = seo;
  else delete pagina.seo;
  return copia;
}

/** Id nuevo para una sección creada en el borrador (cumple `idEstable` del contrato). */
export function nuevoIdSeccion(): string {
  const aleatorio =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `s-${aleatorio}`;
}

// ─── Ajustes (inspector, encabezado, pie) ─────────────────────────────────────────────────────

export interface AjustesVista {
  ajustes: WebsiteSettings;
  /** Origen de cada columna heredable: «principal» (hereda), «propio» o «vacio» (D6). */
  origenes: Record<string, OrigenCampo>;
}

/**
 * Ajustes que ve el editor para un sitio V2.
 * - Columnas con destino en el documento: salen del documento (resueltas contra el principal
 *   si es una sede).
 * - El resto (operación, integraciones, columnas sin efecto): de la fila legacy `base`, que
 *   sigue siendo su fuente (D12).
 */
export function ajustesDesdeDocumento(
  documento: DocumentoSitio,
  base: WebsiteSettings,
  principal: DocumentoSitio | null,
): AjustesVista {
  const ajustes = { ...base } as unknown as Record<string, unknown>;
  const origenes: Record<string, OrigenCampo> = {};

  for (const campo of CAMPOS_HEREDABLES) {
    const propio = leerCampo(documento, campo.ruta);
    let valor: unknown;
    if (principal) {
      const resuelto = resolverCampoConOrigen<unknown>(valorPropioDe(principal, campo.ruta), propio);
      valor = resuelto.valor;
      origenes[campo.columna] = resuelto.origen;
    } else {
      valor = propio && propio.mode === 'value' ? propio.value : null;
      origenes[campo.columna] = propio && propio.mode === 'value' ? 'propio' : 'vacio';
    }
    ajustes[campo.columna] = valor ?? campo.porDefecto ?? null;
  }

  const { header, footer } = documento.shell;
  ajustes.header_style = header.composicion || COLUMNAS_SHELL_ESTRUCTURA.header_style.porDefecto;
  ajustes.footer_style = footer.composicion || COLUMNAS_SHELL_ESTRUCTURA.footer_style.porDefecto;
  ajustes.header_menu_id = header.menuPrincipalId ?? null;
  ajustes.header_mega_menu_id = header.menuMegaId ?? null;
  for (const [columna, def] of Object.entries(OPCIONES_SHELL)) {
    const opciones = def.zona === 'header' ? header.opciones : footer.opciones;
    ajustes[columna] = columna in (opciones ?? {}) ? structuredCloneSeguro(opciones[columna]) : def.porDefecto;
  }

  return { ajustes: ajustes as unknown as WebsiteSettings, origenes };
}

export interface ResultadoAjustes {
  documento: DocumentoSitio;
  /** Columnas sin destino en el documento: operación, integraciones o sin efecto (D12). */
  noAplicadas: string[];
}

/**
 * Aplica al documento los cambios del inspector. Un valor vacío deja el campo «vaciado» (`clear`);
 * para volver a heredar se usa {@link fijarModoCampo}.
 */
export function aplicarAjustesAlDocumento(
  documento: DocumentoSitio,
  cambios: Partial<Record<string, unknown>>,
): ResultadoAjustes {
  let resultado = structuredCloneSeguro(documento);
  const noAplicadas: string[] = [];
  const menus = new Set(resultado.menus.map((m) => m.id));

  for (const [columna, valor] of Object.entries(cambios)) {
    const heredable = campoHeredableDeColumna(columna);
    if (heredable) {
      resultado = fijarCampo(
        resultado,
        heredable.ruta,
        esVacio(valor) ? { mode: 'clear' } : { mode: 'value', value: structuredCloneSeguro(valor) },
      );
      continue;
    }
    if (columna === 'header_style' || columna === 'footer_style') {
      const zona = columna === 'header_style' ? resultado.shell.header : resultado.shell.footer;
      zona.composicion = esVacio(valor) ? 'default' : String(valor).slice(0, 200);
      continue;
    }
    if (columna === 'header_menu_id' || columna === 'header_mega_menu_id') {
      const id = typeof valor === 'string' && menus.has(valor) ? valor : null;
      if (valor && !id) {
        noAplicadas.push(columna);
        continue;
      }
      if (columna === 'header_menu_id') resultado.shell.header.menuPrincipalId = id;
      else if (id) resultado.shell.header.menuMegaId = id;
      else delete resultado.shell.header.menuMegaId;
      continue;
    }
    const opcion = OPCIONES_SHELL[columna];
    if (opcion) {
      const zona = opcion.zona === 'header' ? resultado.shell.header : resultado.shell.footer;
      const opciones = { ...(zona.opciones ?? {}) };
      if (valor === undefined || igualesEstructural(valor, opcion.porDefecto)) delete opciones[columna];
      else opciones[columna] = structuredCloneSeguro(valor);
      zona.opciones = opciones;
      continue;
    }
    noAplicadas.push(columna);
  }
  return { documento: resultado, noAplicadas };
}

/** Vuelve a heredar o vacía a propósito un campo de la sede (D6). */
export function fijarModoCampo(documento: DocumentoSitio, columna: string, modo: 'inherit' | 'clear'): DocumentoSitio {
  const campo = campoHeredableDeColumna(columna);
  if (!campo) return documento;
  return fijarCampo(documento, campo.ruta, { mode: modo });
}

// ─── Herencia de secciones de una sede ────────────────────────────────────────────────────────

export type EstadoSeccion = 'hereda' | 'propia' | 'nueva';

/**
 * Estado de cada sección de la sede frente a la base del principal. Las secciones se copian al
 * crear la sede (F03-05: la herencia se congela y los cambios del padre se proponen); una copia
 * idéntica a la del principal cuenta como «hereda», una editada como «propia» y una que no
 * existe en el principal como «nueva».
 */
export function estadoSecciones(sede: DocumentoSitio, base: DocumentoSitio | null): Record<string, EstadoSeccion> {
  const estados: Record<string, EstadoSeccion> = {};
  const enBase = new Map<string, string>();
  for (const p of base?.paginas ?? []) {
    for (const s of p.secciones) enBase.set(`${p.id}/${s.id}`, serializarDeterminista(s));
  }
  for (const p of sede.paginas) {
    for (const s of p.secciones) {
      const original = enBase.get(`${p.id}/${s.id}`);
      estados[s.id] = original === undefined ? 'nueva' : original === serializarDeterminista(s) ? 'hereda' : 'propia';
    }
  }
  return estados;
}

/** Copia a la sede la sección del principal (botón «Restablecer»). */
export function restablecerSeccion(
  sede: DocumentoSitio,
  base: DocumentoSitio,
  paginaId: string,
  seccionId: string,
): DocumentoSitio {
  const original = base.paginas.find((p) => p.id === paginaId)?.secciones.find((s) => s.id === seccionId);
  if (!original) return sede;
  const copia = structuredCloneSeguro(sede);
  const pagina = copia.paginas.find((p) => p.id === paginaId);
  if (!pagina) return sede;
  const i = pagina.secciones.findIndex((s) => s.id === seccionId);
  if (i < 0) return sede;
  pagina.secciones[i] = structuredCloneSeguro(original);
  return copia;
}

/** Número de campos heredables personalizados en la sede (banda ámbar «Ver lo personalizado (n)»). */
export function contarPersonalizados(origenes: Record<string, OrigenCampo>): number {
  return Object.values(origenes).filter((o) => o !== 'principal').length;
}
