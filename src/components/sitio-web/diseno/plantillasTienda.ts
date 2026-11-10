/**
 * Las 7 plantillas de tienda nuevas en la galería «Usar plantilla» (Figma «Sistema de diseño» ›
 * 16 Sitio web, láminas A0-A2; encargo del 2026-11-10): Panorama, Atelier, Radiante, Roble, Marea,
 * Contraste y Hogar. Sus datos (estilo, Inicio, encabezado y pie, ficha y categoría) viven en el
 * catálogo (`catalogoPlantillas.ts`) y en `shellPorPlantilla.ts`; aquí solo lo que la GALERÍA
 * necesita saber de ellas:
 * - cuáles son (la insignia «Nueva», «3 páginas» y el aviso de la decisión D4);
 * - para qué tipo de negocio sirve cada una (el filtro de la pestaña «Tienda»);
 * - los rasgos de su encabezado y su pie que la miniatura dibuja y que el modelo de dibujo aún no
 *   trae (pie como tarjeta, marca gigante, enlaces grandes, buscador en píldora).
 *
 * Sin bandera: el sitio publicado ya pinta todo lo de las 7, así que se ven directamente.
 * Puro, sin React: lo prueban los tests de Diseño.
 */
import { normalizarOpcionShell } from '@/lib/website/v2/mapeoAjustes';

/** Ids del catálogo de las 7 plantillas de tienda nuevas, en el orden de la galería (A1). */
export const IDS_PLANTILLAS_TIENDA_NUEVAS = [
  'retail_panorama',
  'retail_atelier',
  'retail_radiante',
  'retail_roble',
  'retail_marea',
  'retail_contraste',
  'retail_hogar',
] as const;
export type IdPlantillaTiendaNueva = (typeof IDS_PLANTILLAS_TIENDA_NUEVAS)[number];

const NUEVAS: ReadonlySet<string> = new Set(IDS_PLANTILLAS_TIENDA_NUEVAS);

/** ¿Es una de las 7 nuevas? Solo ellas llevan «Nueva» y el aviso D4. */
export function esPlantillaTiendaNueva(id: string): id is IdPlantillaTiendaNueva {
  return NUEVAS.has(id);
}

/**
 * Páginas que diseña cada una de las 7 (A1: «N secciones · 3 páginas»): Inicio, la ficha de
 * producto y la página de categoría. Con «Plantilla completa» las tres se rearman (D4).
 */
export const PAGINAS_PLANTILLA_TIENDA_NUEVA = 3;

/** Tipos de negocio del filtro de la pestaña «Tienda» (las descripciones de A1). */
export const NEGOCIOS_TIENDA = ['moda', 'belleza', 'hogar', 'deportes'] as const;
export type NegocioTienda = (typeof NEGOCIOS_TIENDA)[number];
export type FiltroNegocio = NegocioTienda | 'todos';
export const FILTROS_NEGOCIO: readonly FiltroNegocio[] = ['todos', ...NEGOCIOS_TIENDA];

/**
 * Para qué negocio sirve cada una (A1): Panorama, deportes, aire libre y tecnología; Atelier y
 * Marea, moda; Radiante, belleza y cosmética; Roble, Contraste y Hogar, muebles y decoración.
 */
export const NEGOCIOS_DE_PLANTILLA: Readonly<Record<IdPlantillaTiendaNueva, readonly NegocioTienda[]>> = {
  retail_panorama: ['deportes'],
  retail_atelier: ['moda'],
  retail_radiante: ['belleza'],
  retail_roble: ['hogar'],
  retail_marea: ['moda'],
  retail_contraste: ['hogar'],
  retail_hogar: ['hogar'],
};

/** Los negocios de una plantilla; las de antes no tienen (sirven a cualquier tienda). */
export function negociosDePlantilla(id: string): readonly NegocioTienda[] {
  return esPlantillaTiendaNueva(id) ? NEGOCIOS_DE_PLANTILLA[id] : [];
}

/** Las de la lista que sirven al negocio; `todos` no filtra. */
export function filtrarPorNegocio<P extends { id: string }>(lista: readonly P[], negocio: FiltroNegocio): P[] {
  if (negocio === 'todos') return [...lista];
  return lista.filter((p) => negociosDePlantilla(p.id).includes(negocio));
}

/** Negocios con al menos una plantilla en la lista, en el orden del filtro. */
export function negociosPresentes(lista: readonly { id: string }[]): NegocioTienda[] {
  const presentes = new Set(lista.flatMap((p) => negociosDePlantilla(p.id)));
  return NEGOCIOS_TIENDA.filter((n) => presentes.has(n));
}

// ─── Rasgos del encabezado y el pie de tienda que pinta la miniatura ──────────────────────────

/**
 * Lo que la miniatura y la vista previa dibujan de más para las plantillas de tienda (A1:
 * «EsquemaShell aprende 4 dibujos»; el menú en píldora ya lo traía el modelo). Todo `false` = el
 * dibujo de siempre, así que las demás plantillas y el borrador sin estas opciones no cambian.
 */
export interface ExtrasShellTienda {
  /** `search_style: 'pill_floating'`: buscador en píldora flotante (Hogar). */
  buscadorPildora: boolean;
  /** `footer_inset`: el pie como tarjeta con margen y el radio del tema. */
  pieTarjeta: boolean;
  /** `footer_brand_display: 'giant'`: el nombre de la tienda en grande a todo el ancho. */
  marcaGigante: boolean;
  /** `footer_links_style: 'display'`: enlaces del pie grandes, en la fuente de títulos. */
  enlacesGrandes: boolean;
}

export const SIN_EXTRAS_TIENDA: ExtrasShellTienda = { buscadorPildora: false, pieTarjeta: false, marcaGigante: false, enlacesGrandes: false };

/** Valor normalizado (ausente o inválido = el default de hoy), como lo lee el sitio público. */
const leer = (clave: string, opciones: Readonly<Record<string, unknown>>) => normalizarOpcionShell(clave, opciones[clave]);

/** Los rasgos de tienda de un shell (el de la plantilla o el del borrador del cliente). */
export function extrasShellTienda(
  opcionesEncabezado: Readonly<Record<string, unknown>>,
  opcionesPie: Readonly<Record<string, unknown>>,
): ExtrasShellTienda {
  return {
    buscadorPildora: leer('search_style', opcionesEncabezado) === 'pill_floating',
    pieTarjeta: leer('footer_inset', opcionesPie) === true,
    marcaGigante: leer('footer_brand_display', opcionesPie) === 'giant',
    enlacesGrandes: leer('footer_links_style', opcionesPie) === 'display',
  };
}

export function tieneExtrasTienda(e: ExtrasShellTienda): boolean {
  return e.buscadorPildora || e.pieTarjeta || e.marcaGigante || e.enlacesGrandes;
}
