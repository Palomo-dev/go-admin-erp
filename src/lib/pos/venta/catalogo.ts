/**
 * Catálogo del POS (`src/components/pos/ProductSearch.tsx`), L14-L21 y L23 del
 * plan. Extracción LITERAL de las decisiones que vivían en el componente: qué
 * pasa al tocar una tarjeta, cómo se arma la variante elegida, qué hace un
 * código escaneado, qué insignias lleva la tarjeta, la espera de la búsqueda y
 * el favorito optimista. La carga del catálogo sigue en el componente.
 */
import type { Category, Product } from '@/components/pos/types';
import { resolveVariantDisplayName } from '@/utils/variantUtils';
import { estacionEfectiva } from '@/lib/pos/estacionEfectiva';

/** Producto tal como lo devuelve `POSService.getProductsPaginated` para el grid. */
export type PosGridProduct = Product & {
  has_variants?: boolean;
  variant_count?: number;
  has_modifiers?: boolean;
  compare_price?: number | null;
  categories?: Category | null;
  station?: string | null;
  variant_data?: unknown;
};

/**
 * Variante elegida en `VariantSelectorDialog`: el diálogo la tipa con lo
 * mínimo (id, sku, nombre, precio, variant_data) pero la fila trae todos
 * los campos del producto, que se preservan al enviarla al carrito.
 */
export type SelectedVariant = {
  id: number;
  sku: string;
  name: string;
  price: number | null;
  variant_data: Record<string, string>;
  image?: string | null;
  categories?: Category | null;
  category?: Category | null;
  station?: string | null;
};

// ---------------------------------------------------------------------------
// L14: búsqueda con espera
// ---------------------------------------------------------------------------

/** Espera entre la última tecla (o cambio de categoría/sucursal) y la consulta. */
export const ESPERA_BUSQUEDA_MS = 300;

/**
 * Lo que hace el catálogo cuando cambia la búsqueda, la categoría o la
 * sucursal: vuelve a la página 1 (si no estaba en ella) y consulta la página 1
 * a los 300 ms. Devuelve la limpieza del efecto: un cambio antes de los 300 ms
 * cancela la consulta pendiente (solo sale la última).
 */
export function programarBusqueda(d: {
  paginaActual: number;
  volverAPaginaUno: () => void;
  cargarPaginaUno: () => void;
  esperaMs?: number;
}): () => void {
  // Reset page to 1 when search or filter changes
  if (d.paginaActual !== 1) {
    d.volverAPaginaUno();
  }

  const timeoutId = setTimeout(() => {
    d.cargarPaginaUno();
  }, d.esperaMs ?? ESPERA_BUSQUEDA_MS);

  return () => clearTimeout(timeoutId);
}

// ---------------------------------------------------------------------------
// L15-L16: tocar la tarjeta
// ---------------------------------------------------------------------------

export type AccionProducto = 'agotado' | 'dialogo' | 'agregar';

/**
 * Agotado ⇒ no se agrega (aviso). Con variantes (más de 0) o con
 * modificadores ⇒ abre el diálogo. Simple ⇒ va directo al carrito.
 */
export function decidirAccionProducto(product: PosGridProduct): AccionProducto {
  // Si el producto está agotado, no permitir agregarlo
  if (product.is_out_of_stock) return 'agotado';
  // Si el producto tiene variantes o modificadores configurados, abrir el selector
  if ((product.has_variants && (product.variant_count ?? 0) > 0) || product.has_modifiers) return 'dialogo';
  // Producto simple sin modificadores, agregar directamente
  return 'agregar';
}

// ---------------------------------------------------------------------------
// L17: variante elegida
// ---------------------------------------------------------------------------

/**
 * La variante hereda la categoría del padre si no trae la suya, toma la
 * estación efectiva (propia → del padre → de la categoría, igual que
 * `fn_estacion_efectiva`) y su nombre legible desde `variant_data`
 * (ej. «iPhone 16 Pro Max (256 GB)»). El resto de la fila se conserva.
 */
export function enriquecerVariante<V extends {
  name: string;
  variant_data?: unknown;
  categories?: Category | null;
  category?: Category | null;
  station?: string | null;
}>(
  variant: V,
  parent: PosGridProduct | null | undefined,
): V & { name: string; category: Category | undefined; categories: Category | null; station: string | null } {
  // Heredar categoría y datos de preparación del producto padre si la variante no los trae
  const inheritedCategory = variant.categories || variant.category || parent?.categories || parent?.category || null;
  // Propia de la variante → propia del padre → la de la categoría (fn_estacion_efectiva).
  const inheritedStation = estacionEfectiva({
    propia: variant.station,
    propiaPadre: parent?.station,
    categoria: inheritedCategory?.station,
  });
  // Construir nombre legible de la variante desde variant_data (ej: "iPhone 16 Pro Max (256 GB)")
  const displayName = resolveVariantDisplayName(
    variant.name,
    (variant.variant_data ?? null) as Record<string, string> | null,
    parent?.name,
  );
  return {
    ...variant,
    name: displayName,
    category: inheritedCategory ?? undefined,
    categories: inheritedCategory,
    station: inheritedStation,
  };
}

// ---------------------------------------------------------------------------
// L18: código escaneado con el lector físico
// ---------------------------------------------------------------------------

export type DecisionEscaneo =
  | { tipo: 'no_encontrado' }
  | { tipo: 'agotado'; producto: PosGridProduct }
  /**
   * Variante exacta pero el producto lleva modificadores: diálogo del PADRE,
   * que abre con esa variante elegida (`varianteId`; antes se perdía, B-06).
   */
  | { tipo: 'dialogo_padre'; padre: PosGridProduct; varianteId: number }
  /** Variante exacta sin modificadores: directo al carrito, ya enriquecida. */
  | { tipo: 'agregar_variante'; producto: Product }
  /** Padre o simple: la misma decisión que al tocar la tarjeta. */
  | { tipo: 'tarjeta'; producto: PosGridProduct };

/**
 * `row` es la fila exacta de `getProductByBarcode` (puede ser una variante);
 * `grid` es la página de `getProductsPaginated` buscada con el código, que
 * trae al padre/simple con stock, variantes y modificadores calculados.
 */
export function resolverCodigo(row: Product | null, grid: PosGridProduct[]): DecisionEscaneo {
  const parentId = row ? (row.parent_product_id ?? row.id) : null;
  const parent = parentId !== null ? grid.find((p) => p.id === parentId) : undefined;
  if (!row || !parent) return { tipo: 'no_encontrado' };
  if (parent.is_out_of_stock) return { tipo: 'agotado', producto: parent };
  if (row.parent_product_id) {
    // El código identifica una variante concreta: no hay nada que elegir,
    // salvo que el producto lleve modificadores.
    if (parent.has_modifiers) return { tipo: 'dialogo_padre', padre: parent, varianteId: row.id };
    const variant = row as PosGridProduct;
    return { tipo: 'agregar_variante', producto: enriquecerVariante(variant, parent) as Product };
  }
  // Simple: al carrito. Padre con variantes o modificadores: el diálogo.
  return { tipo: 'tarjeta', producto: parent };
}

// ---------------------------------------------------------------------------
// L23: insignias de la tarjeta
// ---------------------------------------------------------------------------

export interface InsigniasProducto {
  agotado: boolean;
  /** Porcentaje de descuento sobre `compare_price` (redondeado); null si no hay. */
  descuento: number | null;
  /** Nº de variantes («N var.»); null si no tiene. */
  variantes: number | null;
  /** Producto simple (sin variantes) con modificadores. */
  personalizable: boolean;
  /** Unidades vendidas en 90 días (redondeadas) para «Top» y su tooltip; null si no es top. */
  top: number | null;
  /** Tiene receta vinculada (botón «Ver receta»). */
  receta: boolean;
  /** Hoy el bloque de precio no se pinta si el precio es 0 o nulo. */
  sinPrecio: boolean;
  /** Botón «Elegir» (abre el diálogo) en vez de «Agregar». */
  elegir: boolean;
}

export function insigniasDe(product: PosGridProduct): InsigniasProducto {
  const tieneVariantes = !!product.has_variants && (product.variant_count ?? 0) > 0;
  const conDescuento = !!product.compare_price && Number(product.compare_price) > Number(product.price);
  return {
    agotado: !!product.is_out_of_stock,
    descuento: conDescuento ? Math.round((1 - Number(product.price) / Number(product.compare_price)) * 100) : null,
    variantes: tieneVariantes ? (product.variant_count ?? 0) : null,
    personalizable: (!product.has_variants || (product.variant_count ?? 0) === 0) && !!product.has_modifiers,
    top: Number(product.sales_count_90d) > 0 ? Math.round(Number(product.sales_count_90d)) : null,
    receta: !!(product.has_recipe && product.recipe_id),
    sinPrecio: !product.price,
    elegir: tieneVariantes || !!product.has_modifiers,
  };
}

// ---------------------------------------------------------------------------
// L21: favorito optimista
// ---------------------------------------------------------------------------

/** La lista con el favorito de un elemento cambiado (el resto, igual). */
export function conFavorito<T extends { id: number; is_favorite?: boolean }>(lista: T[], id: number, valor: boolean): T[] {
  return lista.map((p) => (p.id === id ? { ...p, is_favorite: valor } : p));
}

export type ResultadoFavorito = { ok: true; valor: boolean } | { ok: false; error: unknown };

/**
 * Favorito optimista (producto y categoría): se refleja al instante, se
 * sincroniza con lo que devuelve el servicio y, si la escritura falla, se
 * revierte al valor de antes.
 */
export async function alternarFavorito(d: {
  antes: boolean;
  aplicar: (valor: boolean) => void;
  alternar: () => Promise<boolean>;
}): Promise<ResultadoFavorito> {
  d.aplicar(!d.antes);
  try {
    const valor = await d.alternar();
    d.aplicar(valor);
    return { ok: true, valor };
  } catch (error) {
    d.aplicar(d.antes);
    return { ok: false, error };
  }
}
