/**
 * Lógica de dos controles del panel Encabezado (Figma «16 Sitio web», sección «Menú del celular —
 * categorías con color e imagen», 3290:101848, aprobada el 2026-11-25):
 *
 * - Celular › «Categorías en el menú» (`mobile_categories_look`): Lista con ícono (por defecto = hoy),
 *   Lista con imagen redonda o Tarjetas con imagen.
 * - Contenido › «Contenido del botón» (`header_categories_source`): Automático (por defecto = hoy),
 *   Categorías del inventario o Menú armado en el editor (el de `shell.header.menuMegaId`, la misma
 *   referencia que Páginas › Menús › «Megamenú»).
 *
 * Las reglas (qué es el valor de hoy, cuándo se usa el menú armado, cuándo avisar) salen de
 * `@/lib/website/v2/categoriasCabecera`, copia idéntica de la que usa la tienda. Sin columnas nuevas:
 * las dos opciones viven en `shell.header.opciones` del documento V2.
 */
import {
  composicionCabecera,
  estiloCategoriasMovil,
  fuenteBotonCategorias,
  menuArmadoSinUsar,
  type EstiloCategoriasMovil,
  type FuenteBotonCategorias,
} from '@/lib/website/v2/categoriasCabecera';
import { ESTILOS_CATEGORIAS_MOVIL, FUENTES_BOTON_CATEGORIAS } from '@/lib/website/v2/mapeoAjustes';
import { tarjetaMenu, type TarjetaMenu } from './celularLogica';

type Ajustes = Record<string, unknown>;

export { estiloCategoriasMovil, fuenteBotonCategorias };
export const ESTILOS_CATEGORIAS = ESTILOS_CATEGORIAS_MOVIL;
export const CONTENIDOS_BOTON = FUENTES_BOTON_CATEGORIAS;

/** Menús del celular donde las tarjetas se ven como tarjetas (en los demás, como lista redonda). */
const MENUS_CON_TARJETAS: readonly TarjetaMenu[] = ['fullscreen', 'tabs'];

export function cambioEstiloCategorias(v: EstiloCategoriasMovil): Ajustes {
  // `icono` es el valor por defecto: el documento no lo guarda (vistaEditor lo quita).
  return { mobile_categories_look: v };
}

/**
 * Figma A2: «Tarjetas» con un menú del celular que no las pinta (cajón, desplegable, hoja inferior):
 * el editor explica que ahí se ve como lista redonda.
 */
export function tarjetasComoLista(a: Ajustes): TarjetaMenu | null {
  if (estiloCategoriasMovil(a) !== 'tarjetas') return null;
  const menu = tarjetaMenu(a);
  return MENUS_CON_TARJETAS.includes(menu) ? null : menu;
}

/**
 * «Categorías del inventario» enciende además `show_categories_in_header` (la tienda solo lista el
 * árbol con ese ajuste, como siempre): elegir el inventario a propósito no puede dejar el botón vacío.
 */
export function cambioContenidoBoton(a: Ajustes, v: FuenteBotonCategorias): Ajustes {
  if (v === 'inventory' && a.show_categories_in_header !== true) {
    return { header_categories_source: v, show_categories_in_header: true };
  }
  return { header_categories_source: v };
}

/** Lo que hace hoy «Automático» con la composición elegida: el menú armado solo con Mega. */
export function automaticoUsa(a: Ajustes): 'menu' | 'inventory' {
  return composicionCabecera(a) === 'mega' ? 'menu' : 'inventory';
}

export interface MenuConNombre {
  id: string;
  name: string;
}

/** El menú armado del botón (`header_mega_menu_id` = `shell.header.menuMegaId`), si existe. */
export function menuDelBoton<M extends MenuConNombre>(a: Ajustes, menus: readonly M[]): M | null {
  const id = typeof a.header_mega_menu_id === 'string' ? a.header_mega_menu_id : null;
  return id ? (menus.find((m) => m.id === id) ?? null) : null;
}

/** Figma H1: el menú guardado que hoy no se ve (Automático y composición distinta de Mega). */
export function menuGuardadoSinUsar<M extends MenuConNombre>(a: Ajustes, menus: readonly M[]): M | null {
  const menu = menuDelBoton(a, menus);
  return menu && menuArmadoSinUsar(a, true) ? menu : null;
}
