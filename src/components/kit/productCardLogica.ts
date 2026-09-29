/**
 * `ProductCard` sin React: si se puede elegir (agotado, sin precio), qué
 * insignias lleva y dónde, el porcentaje de la comparación, la meta
 * («3 var. · 22 uds») y el color del stock. Solo presentación: el stock, el
 * precio y el «Top» llegan calculados por la RPC del catálogo
 * (`pos_product_ranking`); aquí no se decide nada del negocio.
 */

/** Por debajo o igual a esto el stock se pinta en ámbar (POS-UX-V2 D3c). */
export const UMBRAL_STOCK_BAJO = 5;

export type NivelStock = 'ok' | 'bajo' | 'agotado';

export type StockTarjeta =
  | 'sinSeguimiento'
  | {
      /** Nivel ya decidido por el servicio; si falta, se deduce de `cantidad`. */
      nivel?: NivelStock;
      cantidad?: number | null;
    };

export interface ProductoTarjeta {
  id: string | number;
  nombre: string;
  /** `null` = sin precio (B-14): se muestra «Sin precio» y no se puede elegir. */
  precio: number | null;
  /** Precio antes (`compare_price`): tachado y badge «-17 %» si es mayor que el precio. */
  precioComparacion?: number | null;
  sku?: string | null;
  stock?: StockTarjeta;
  /** Agotado según la RPC (`is_out_of_stock`); manda sobre el stock. */
  agotado?: boolean;
  /** Número de variantes («3 var.»). */
  variantes?: number;
  /** Número de modificadores: «1 modif.» con variantes, «Personalizable» sin ellas. */
  modificadores?: number;
  /** Personalizable sin conteo de modificadores. */
  personalizable?: boolean;
  /** Texto de meta extra que da la pantalla («Servicio»). */
  detalle?: string | null;
  /** Unidades vendidas en 90 días (`sales_count_90d`): «Top» si es > 0. */
  top?: number | null;
  favorito?: boolean;
  /** Tiene receta de producción: botón «Ver receta» si la pantalla da `onReceta`. */
  receta?: boolean;
  /**
   * Producto por peso o medida (PRODUCTOS-POR-PESO-BASCULA.md): símbolo de la
   * unidad de venta («kg»). La tarjeta dice «Por kg», el precio «/ kg» y el
   * stock «12,400 kg» con `decimalesCantidad`.
   */
  unidadVenta?: string | null;
  decimalesCantidad?: number | null;
}

export type VarianteTarjeta = 'pos' | 'movil-tarjeta' | 'movil-lista';
export type TamanoTarjeta = 'md' | 'sm';

export type NivelStockVista = NivelStock | 'sinSeguimiento';

/** Nivel del stock para el punto de color. `null` si no hay dato. */
export function nivelStock(stock: StockTarjeta | undefined, agotado?: boolean): NivelStockVista | null {
  if (agotado) return 'agotado';
  if (stock === 'sinSeguimiento') return 'sinSeguimiento';
  if (!stock) return null;
  if (stock.nivel) return stock.nivel;
  if (stock.cantidad === null || stock.cantidad === undefined) return null;
  if (stock.cantidad <= 0) return 'agotado';
  return stock.cantidad <= UMBRAL_STOCK_BAJO ? 'bajo' : 'ok';
}

/** Punto y texto del stock: verde · ámbar (≤ 5) · rojo. «Sin seguimiento» va en verde (Figma). */
export function clasesStock(nivel: NivelStockVista): { punto: string; texto: string } {
  switch (nivel) {
    case 'bajo':
      return { punto: 'bg-warning', texto: 'text-warning-text' };
    case 'agotado':
      return { punto: 'bg-danger', texto: 'text-danger-text' };
    default:
      return { punto: 'bg-success', texto: 'text-success-text' };
  }
}

export function esAgotado(producto: Pick<ProductoTarjeta, 'stock' | 'agotado'>): boolean {
  return nivelStock(producto.stock, producto.agotado) === 'agotado';
}

export function sinPrecio(producto: Pick<ProductoTarjeta, 'precio'>): boolean {
  return producto.precio === null || producto.precio === undefined || !Number.isFinite(Number(producto.precio));
}

export interface Eleccion {
  elegible: boolean;
  /** Por qué no: agotado primero (se ve sobre la imagen), luego sin precio. */
  motivo: 'agotado' | 'sinPrecio' | null;
}

export function eleccion(producto: Pick<ProductoTarjeta, 'precio' | 'stock' | 'agotado'>): Eleccion {
  if (esAgotado(producto)) return { elegible: false, motivo: 'agotado' };
  if (sinPrecio(producto)) return { elegible: false, motivo: 'sinPrecio' };
  return { elegible: true, motivo: null };
}

/** «-17 %»: como hoy (`ProductSearch`), redondeado y solo si la comparación es mayor que el precio. */
export function porcentajeDescuento(precio: number | null | undefined, comparacion: number | null | undefined): number | null {
  const p = Number(precio);
  const c = Number(comparacion);
  if (precio === null || precio === undefined || comparacion === null || comparacion === undefined) return null;
  if (!Number.isFinite(p) || !Number.isFinite(c) || c <= 0 || c <= p) return null;
  const pct = Math.round((1 - p / c) * 100);
  return pct > 0 ? pct : null;
}

export function esTop(top: number | null | undefined): boolean {
  return Number(top ?? 0) > 0;
}

export type Insignia = 'descuento' | 'favorito' | 'top' | 'agotado';
export type PosicionInsignia = 'arriba-izquierda' | 'arriba-derecha' | 'abajo-izquierda' | 'centro' | 'fila';

export interface InsigniaTarjeta {
  id: Insignia;
  posicion: PosicionInsignia;
}

/**
 * Insignias de la tarjeta, en orden de lectura (y de dibujo): descuento
 * arriba-izquierda, estrella arriba-derecha, «Top» abajo-izquierda (solo `md`
 * y la tarjeta móvil: la miniatura de `sm` no tiene alto; en la lista, una
 * llama en la miniatura), «Agotado» centrado sobre la imagen atenuada (en la
 * lista va en la meta). La estrella solo si la pantalla puede marcar
 * favoritos o el producto ya lo es.
 */
export function insigniasTarjeta(
  producto: Pick<ProductoTarjeta, 'precio' | 'precioComparacion' | 'top' | 'favorito' | 'stock' | 'agotado'>,
  { variante, tamano = 'md', conFavorito }: { variante: VarianteTarjeta; tamano?: TamanoTarjeta; conFavorito: boolean },
): InsigniaTarjeta[] {
  const lista = variante === 'movil-lista';
  const out: InsigniaTarjeta[] = [];
  if (!lista && porcentajeDescuento(producto.precio, producto.precioComparacion) !== null) {
    out.push({ id: 'descuento', posicion: 'arriba-izquierda' });
  }
  if (conFavorito || producto.favorito) out.push({ id: 'favorito', posicion: lista ? 'fila' : 'arriba-derecha' });
  const topVisible = variante !== 'pos' || tamano === 'md';
  if (esTop(producto.top) && topVisible) out.push({ id: 'top', posicion: 'abajo-izquierda' });
  if (!lista && esAgotado(producto)) out.push({ id: 'agotado', posicion: 'centro' });
  return out;
}

export type ParteMeta =
  | { clave: 'variantes'; n: number }
  | { clave: 'modificadores'; n: number }
  | { clave: 'personalizable' }
  | { clave: 'detalle'; texto: string };

/**
 * Meta del producto: «3 var.», «5 var. · 1 modif.», «Personalizable» (con
 * modificadores y sin variantes, como hoy), y el detalle de la pantalla.
 */
export function partesMeta(
  producto: Pick<ProductoTarjeta, 'variantes' | 'modificadores' | 'personalizable' | 'detalle'>,
): ParteMeta[] {
  const out: ParteMeta[] = [];
  const v = Number(producto.variantes ?? 0);
  const m = Number(producto.modificadores ?? 0);
  if (v > 0) out.push({ clave: 'variantes', n: v });
  if (m > 0 && v > 0) out.push({ clave: 'modificadores', n: m });
  else if (m > 0 || producto.personalizable) out.push({ clave: 'personalizable' });
  if (producto.detalle) out.push({ clave: 'detalle', texto: producto.detalle });
  return out;
}

export type ParteStock =
  | { clave: 'unidades'; n: number }
  | { clave: 'sinSeguimiento' }
  | { clave: 'sinStock' }
  | { clave: 'agotado'; n?: number };

/** Texto del stock: «22 uds», «Sin seguimiento», «Sin stock» (tarjeta) o «0 uds · Agotado» (lista). */
export function parteStock(
  producto: Pick<ProductoTarjeta, 'stock' | 'agotado'>,
  variante: VarianteTarjeta,
): ParteStock | null {
  const nivel = nivelStock(producto.stock, producto.agotado);
  if (nivel === null) return null;
  if (nivel === 'sinSeguimiento') return { clave: 'sinSeguimiento' };
  const cantidad = typeof producto.stock === 'object' ? producto.stock.cantidad : undefined;
  if (nivel === 'agotado') {
    if (variante === 'movil-lista') return { clave: 'agotado', n: cantidad ?? undefined };
    return { clave: 'sinStock' };
  }
  if (cantidad === null || cantidad === undefined) return null;
  return { clave: 'unidades', n: cantidad };
}

/** Inicial del marcador sin foto («Z» de «Zapatilla»); `?` si el nombre no tiene letras. */
export function inicialProducto(nombre: string): string {
  const m = /[\p{L}\p{N}]/u.exec(nombre ?? '');
  return m ? m[0].toLocaleUpperCase() : '?';
}
