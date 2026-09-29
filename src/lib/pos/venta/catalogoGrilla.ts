/**
 * Grilla del catálogo del POS (`src/components/pos/venta/GrillaProductos.tsx`,
 * paso 4 de docs/implementacion/POS-PLAN.md). Sin React: el tamaño de página
 * por vista, la preferencia de vista del dispositivo, la cantidad rápida
 * «3*», el foco itinerante con flechas, la fusión de páginas del scroll
 * infinito, el control de «un solo pedido en vuelo» y el paso de las filas
 * de `POSService` a las props de las piezas del kit (`ProductCard`,
 * `CategoryBar`).
 *
 * No decide nada del negocio: agotado, variantes, «Top», receta y
 * descuento salen de `insigniasDe` (catalogo.ts, L23) y el orden y color de
 * las categorías de `ordenarCategorias` / `colorDeCategoria` (categorias.ts).
 */
import type { CategoriaBarra, ValorCategoria } from '@/components/kit/categoryBarLogica';
import type { ProductoTarjeta } from '@/components/kit/productCardLogica';
import type { PosCategoryDisplayMode, PosCategoryOrderBy } from '@/components/pos/configuracion/configuracionService';
import { insigniasDe, type PosGridProduct } from './catalogo';
import { decimalesCantidad, esMedido, unidadVisible } from '@/lib/pos/peso/modoVenta';
import { colorDeCategoria, esCategoriaTop, ordenarCategorias, type CategoriaOrdenable } from './categorias';

// ---------------------------------------------------------------------------
// Vista y página
// ---------------------------------------------------------------------------

export type VistaCatalogo = 'tarjetas' | 'lista';

/** Productos por página del scroll infinito (POS-UX-V2 §7.5, decisión final). */
export const TAMANO_PAGINA: Record<VistaCatalogo, number> = { tarjetas: 16, lista: 20 };

/** Clave de `localStorage` con la vista preferida en este dispositivo. */
export const CLAVE_VISTA = 'pos_vista_productos';

export const VISTA_POR_DEFECTO: VistaCatalogo = 'tarjetas';

type Almacen = Pick<Storage, 'getItem' | 'setItem'>;

/** La vista guardada en el dispositivo; `tarjetas` si no hay, es otra cosa o el almacén falla. */
export function leerVista(almacen: Almacen | null | undefined): VistaCatalogo {
  try {
    const v = almacen?.getItem(CLAVE_VISTA);
    return v === 'lista' || v === 'tarjetas' ? v : VISTA_POR_DEFECTO;
  } catch {
    return VISTA_POR_DEFECTO;
  }
}

/** Guarda la vista; si el almacén no está (ventana privada, bloqueado) no pasa nada. */
export function guardarVista(almacen: Almacen | null | undefined, vista: VistaCatalogo): void {
  try {
    almacen?.setItem(CLAVE_VISTA, vista);
  } catch {
    // Sin almacenamiento la vista vale para esta sesión de la pantalla.
  }
}

// ---------------------------------------------------------------------------
// Cantidad rápida «3*»
// ---------------------------------------------------------------------------

/** Tope de la cantidad rápida: «1000*» ya no es una cantidad sino un término. */
export const CANTIDAD_RAPIDA_MAXIMA = 999;

export interface TextoBuscador {
  /** Cantidad pedida con «N*» (null si no hay). */
  cantidad: number | null;
  /** Lo que se busca en el catálogo (sin el «N*»). */
  termino: string;
}

/**
 * «3*» ⇒ cantidad 3 y nada que buscar; «3*coca» o «3* coca» ⇒ cantidad 3 y
 * se busca «coca». Solo cuenta al principio y con un entero de 1 a 999; lo
 * demás se busca tal cual (un SKU «A*1» no se toca).
 */
export function interpretarBuscador(texto: string): TextoBuscador {
  const m = /^\s*(\d{1,3})\s*\*\s*([\s\S]*)$/.exec(texto ?? '');
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= CANTIDAD_RAPIDA_MAXIMA) return { cantidad: n, termino: m[2] };
  }
  return { cantidad: null, termino: texto ?? '' };
}

// ---------------------------------------------------------------------------
// Foco itinerante de la grilla
// ---------------------------------------------------------------------------

/**
 * Siguiente tarjeta con el teclado: ← → de una en una, ↑ ↓ de fila en fila
 * (`columnas`), Inicio y Fin. Sin vuelta: en los bordes se queda. `null` si
 * la tecla no mueve.
 */
export function moverFocoGrilla(actual: number, tecla: string, total: number, columnas: number): number | null {
  if (total <= 0) return null;
  const cols = Math.max(1, Math.floor(columnas) || 1);
  const limitar = (i: number) => Math.min(total - 1, Math.max(0, i));
  switch (tecla) {
    case 'ArrowRight':
      return limitar(actual + 1);
    case 'ArrowLeft':
      return limitar(actual - 1);
    case 'ArrowDown':
      return actual + cols <= total - 1 ? actual + cols : actual;
    case 'ArrowUp':
      return actual - cols >= 0 ? actual - cols : actual;
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    default:
      return null;
  }
}

/** Columnas de una grilla CSS a partir de `grid-template-columns` calculado («248px 248px 248px» ⇒ 3). */
export function columnasDeGrilla(plantilla: string | null | undefined): number {
  const partes = (plantilla ?? '').trim().split(/\s+/).filter((p) => p && p !== 'none');
  return Math.max(1, partes.length);
}

// ---------------------------------------------------------------------------
// Scroll infinito
// ---------------------------------------------------------------------------

/**
 * Añade una página a lo ya cargado sin repetir productos: el ranking
 * (favoritos, ventas de 90 días) puede moverse entre una página y la
 * siguiente, y un producto repetido rompería la `key` de la grilla.
 */
export function fusionarPaginas<T extends { id: number | string }>(cargados: readonly T[], nuevos: readonly T[]): T[] {
  const vistos = new Set(cargados.map((p) => p.id));
  return [...cargados, ...nuevos.filter((p) => !vistos.has(p.id))];
}

/** ¿Queda otra página por pedir? */
export function hayMasPaginas(pagina: number, totalPaginas: number): boolean {
  return pagina >= 1 && pagina < totalPaginas;
}

/**
 * Un solo pedido en vuelo y descarte de respuestas viejas (POS-PLAN R6,
 * incidente de 2026-09-14). Cada búsqueda, categoría, sucursal o vista nueva
 * abre una «generación»; la respuesta de una generación anterior se tira.
 * El siguiente pedido del scroll no sale mientras otro espera.
 */
export interface ControlPedidos {
  /** Abre una generación nueva (lo anterior deja de valer) y devuelve su número. */
  reiniciar(): number;
  /** Pide turno para la siguiente página: la generación, o `null` si ya hay un pedido en vuelo. */
  turnoSiguiente(): number | null;
  /** Marca en vuelo el pedido de la página 1 de la generación actual. */
  turnoPrimera(): number;
  /** Termina un pedido: `true` si su respuesta todavía vale. */
  terminar(generacion: number): boolean;
  enVuelo(): boolean;
}

export function crearControlPedidos(): ControlPedidos {
  let generacion = 0;
  let ocupado = false;
  return {
    reiniciar() {
      generacion += 1;
      ocupado = false;
      return generacion;
    },
    turnoSiguiente() {
      if (ocupado) return null;
      ocupado = true;
      return generacion;
    },
    turnoPrimera() {
      ocupado = true;
      return generacion;
    },
    terminar(g) {
      if (g !== generacion) return false;
      ocupado = false;
      return true;
    },
    enVuelo() {
      return ocupado;
    },
  };
}

// ---------------------------------------------------------------------------
// Filas del servicio → piezas del kit
// ---------------------------------------------------------------------------

/**
 * La tarjeta del kit con lo que ya trae la fila de `getProductsPaginated`.
 * Precio 0 o nulo ⇒ sin precio (hoy el bloque de precio no se pinta:
 * `insigniasDe().sinPrecio`). Stock: sin seguimiento si `track_stock` es
 * `false`; si se sigue, las unidades en existencia (las mismas con que el
 * servicio decide «agotado»).
 */
export function aProductoTarjeta(p: PosGridProduct): ProductoTarjeta {
  const ins = insigniasDe(p);
  let stock: ProductoTarjeta['stock'];
  if (p.track_stock === false) stock = 'sinSeguimiento';
  else if (p.track_stock === true && p.stock_quantity !== undefined && p.stock_quantity !== null) {
    stock = { cantidad: Number(p.stock_quantity) };
  }
  return {
    id: p.id,
    nombre: p.name,
    precio: ins.sinPrecio ? null : Number(p.price),
    precioComparacion: p.compare_price ?? null,
    sku: p.sku,
    stock,
    agotado: ins.agotado,
    variantes: ins.variantes ?? undefined,
    personalizable: ins.personalizable,
    top: ins.top,
    favorito: !!p.is_favorite,
    receta: ins.receta,
    // Por peso o medida: «Por kg», «/ kg» y el stock en kg (PRODUCTOS-POR-PESO-BASCULA.md).
    unidadVenta: unidadVisible(p),
    decimalesCantidad: esMedido(p) ? decimalesCantidad(p) : null,
  };
}

/** Modo de la barra del kit según `pos_categories_display`. */
export function modoBarraCategorias(modo: PosCategoryDisplayMode | undefined): 'chips' | 'imagenes' | 'combobox' {
  if (modo === 'images') return 'imagenes';
  if (modo === 'searchselect') return 'combobox';
  return 'chips';
}

export interface CategoriaCatalogo extends CategoriaOrdenable {
  image_url?: string | null;
}

/**
 * Categorías para `CategoryBar`, en el orden configurado
 * (`pos_categories_display.orderBy`) y con el color de respaldo de siempre
 * cuando la categoría no tiene uno. «Top» con las unidades de 90 días.
 */
export function categoriasParaBarra(
  categorias: readonly CategoriaCatalogo[],
  orden: PosCategoryOrderBy = 'display_order',
  conteos?: Record<number, number>,
): CategoriaBarra[] {
  return ordenarCategorias([...categorias], orden).map((c) => ({
    id: c.id,
    nombre: c.name,
    color: colorDeCategoria(c),
    imagen: c.image_url ?? null,
    conteo: conteos?.[c.id] ?? null,
    favorita: !!c.is_favorite,
    top: esCategoriaTop(c) ? Number(c.sales_count_90d ?? 0) : null,
  }));
}

/** El valor de la barra (`null` = todas) como id numérico de categoría, o `null`. */
export function categoriaDeValor(valor: ValorCategoria): number | null {
  if (valor === null || valor === undefined || valor === 'favoritas') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}
