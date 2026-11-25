/**
 * Categorías de la cabecera: reglas compartidas entre la tienda y el editor del ERP (Figma
 * «16 Sitio web», sección «Menú del celular — categorías con color e imagen», 3290:101848, aprobada
 * el 2026-11-25). Copia idéntica en los dos repos (scripts/verify-copias-erp.mjs).
 *
 * - `estiloCategoriasMovil`: «Categorías en el menú» del celular (icono = lo de hoy).
 * - `usaMenuArmado`: «Contenido del botón» (auto = lo de hoy: el menú armado solo con Mega).
 * - `menuArmadoSinUsar`: el aviso del editor cuando hay un menú guardado que no se ve.
 * - `colorCategoriaPropio`: el color por defecto de la base (#6366F1, nadie lo eligió) = sin color.
 * - `avatarCategoria`: qué pinta el círculo o la tarjeta (imagen → ícono sobre su color → inicial).
 *
 * Puro: sin React ni Supabase.
 */
import {
  ESTILOS_CATEGORIAS_MOVIL,
  FUENTES_BOTON_CATEGORIAS,
  estiloDeHeaderLayout,
  normalizarOpcionShell,
} from './mapeoAjustes';

type Ajustes = Record<string, unknown> | null | undefined;

export type EstiloCategoriasMovil = (typeof ESTILOS_CATEGORIAS_MOVIL)[number];
export type FuenteBotonCategorias = (typeof FUENTES_BOTON_CATEGORIAS)[number];

/**
 * Valor por defecto de `categories.color` en la base (`'#6366f1'::text`, verificado el 2026-11-25:
 * 1.304 de 1.449 categorías lo tienen). Nadie lo eligió: se trata como «sin color».
 */
export const COLOR_CATEGORIA_POR_DEFECTO = '#6366F1';

/** «Categorías en el menú» del celular; sin clave o con basura, `icono` (lo de hoy). */
export function estiloCategoriasMovil(ajustes: Ajustes): EstiloCategoriasMovil {
  const v = normalizarOpcionShell('mobile_categories_look', ajustes?.mobile_categories_look);
  return (ESTILOS_CATEGORIAS_MOVIL as readonly unknown[]).includes(v) ? (v as EstiloCategoriasMovil) : 'icono';
}

/** «Contenido del botón»; sin clave o con basura, `auto` (lo de hoy). */
export function fuenteBotonCategorias(ajustes: Ajustes): FuenteBotonCategorias {
  const v = normalizarOpcionShell('header_categories_source', ajustes?.header_categories_source);
  return (FUENTES_BOTON_CATEGORIAS as readonly unknown[]).includes(v) ? (v as FuenteBotonCategorias) : 'auto';
}

/** Composición que pinta la tienda (`header_layout` manda sobre `header_style`), como SiteHeader. */
export function composicionCabecera(ajustes: Ajustes): string {
  const estilo = estiloDeHeaderLayout(ajustes?.header_layout) || ajustes?.header_style;
  return typeof estilo === 'string' && estilo ? estilo : 'default';
}

/**
 * ¿El botón (y las categorías del celular) listan el menú armado en el editor? `menu`: sí, en todas
 * las composiciones; `inventory`: nunca; `auto`: solo con la composición Mega, como siempre.
 */
export function usaMenuArmado(ajustes: Ajustes): boolean {
  const fuente = fuenteBotonCategorias(ajustes);
  if (fuente === 'menu') return true;
  if (fuente === 'inventory') return false;
  return composicionCabecera(ajustes) === 'mega';
}

/**
 * Aviso del editor (Figma H1): hay un menú armado guardado (`hayMenu`) que no se ve en ninguna parte
 * porque el contenido está en «Automático» y la composición no es Mega.
 */
export function menuArmadoSinUsar(ajustes: Ajustes, hayMenu: boolean): boolean {
  return hayMenu && fuenteBotonCategorias(ajustes) === 'auto' && composicionCabecera(ajustes) !== 'mega';
}

function hexLargo(color: string): string | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
  return `#${h.toUpperCase()}`;
}

/**
 * El color que la tienda le puso a la categoría, o `null` si no tiene uno propio: vacío, con un
 * formato que no es #RGB/#RRGGBB, o el morado por defecto de la base (en cualquier caja).
 */
export function colorCategoriaPropio(color: unknown): string | null {
  if (typeof color !== 'string') return null;
  const largo = hexLargo(color);
  if (!largo || largo === COLOR_CATEGORIA_POR_DEFECTO) return null;
  return color.trim();
}

/** Texto blanco o casi negro sobre `fondo` (#RGB o #RRGGBB), el de mejor contraste; otro formato: blanco. */
export function colorTextoSobre(fondo: string | null | undefined): '#FFFFFF' | '#111827' {
  const largo = hexLargo(fondo || '');
  if (!largo) return '#FFFFFF';
  const canal = (i: number) => {
    const v = parseInt(largo.slice(1 + i, 3 + i), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
  // Contraste con blanco (1.05/(L+0.05)) frente a #111827 (L≈0.0123).
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0623 ? '#FFFFFF' : '#111827';
}

/** Lo que pinta el círculo (o la tarjeta) de una categoría. */
export interface AvatarCategoria {
  /** Imagen de la categoría; si no carga, se pasa al ícono y luego a la inicial. */
  imagen: string | null;
  icono: string | null;
  /** Color propio de la categoría, o `null`: círculo neutro (un tinte del color del texto del menú). */
  fondo: string | null;
  /** Glifo (ícono o inicial) sobre `fondo`; `null` = el color del texto del menú. */
  glifo: '#FFFFFF' | '#111827' | null;
  inicial: string;
}

const textoLimpio = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Imagen → ícono sobre su color → inicial (el orden lo resuelve el componente, que sabe si la imagen cargó). */
export function avatarCategoria(c: { nombre: string; imagen?: unknown; icono?: unknown; color?: unknown }): AvatarCategoria {
  const fondo = colorCategoriaPropio(c.color);
  const primera = Array.from((c.nombre || '').trim())[0];
  return {
    imagen: textoLimpio(c.imagen),
    icono: textoLimpio(c.icono),
    fondo,
    glifo: fondo ? colorTextoSobre(fondo) : null,
    inicial: primera ? primera.toLocaleUpperCase('es') : '·',
  };
}
