/**
 * Productos extraídos de una web (Edge Function `product-scraper`) → filas del
 * mismo asistente de importación. Así el scraping deja de tener su propia
 * importación (antes la hacía la Edge Function con service role y la
 * organización del body) y pasa por la misma RPC transaccional que el archivo.
 *
 * Se conserva lo que hacía la importación anterior del scraping:
 *   - variantes (Color × Talla…) como productos hijos `SKU-V1…` con el mismo precio
 *     cuando solo se conocen las opciones (scraping con IA);
 *   - cuando la tienda da sus variantes reales (catálogo de Shopify, WooCommerce,
 *     VTEX, Magento, PrestaShop: `variantes_detalle`), cada hija lleva SU SKU,
 *     precio, precio anterior, código de barras e imagen;
 *   - la marca también como proveedor; el SKU de la tienda como referencia;
 *   - todas las etiquetas; hasta 10 imágenes por producto; las variantes heredan las del padre;
 *   - precio de comparación siempre el mayor.
 */

import { crearGeneradorSku } from './lector';
import { normalizarNombre, slugificar } from './texto';
import type { FilaImport, Mensaje } from './tipos';

export interface ProductoWeb {
  name: string;
  description?: string;
  price?: number;
  compare_price?: number;
  cost?: number;
  sku?: string;
  barcode?: string;
  brand?: string;
  category?: string;
  tags?: string[];
  images?: string[];
  stock?: number;
  url?: string;
  variants?: { name: string; values: string[] }[];
  /** Id estable del producto en la plataforma (deduplicación al releer y reimportar). */
  origen_id?: string;
  /** Variantes reales de la tienda (cada una con su SKU y precio). Mandan sobre `variants`. */
  variantes_detalle?: VarianteWeb[];
  /** La tienda lo muestra disponible. */
  disponible?: boolean;
  /**
   * Existencias que publica la tienda (VTEX, PrestaShop con clave). NO son el
   * stock inicial salvo que el usuario lo pida: entrar stock exige costo.
   */
  existencias?: number;
  /** El SKU de la tienda lo usaba otro producto del mismo catálogo: se generó uno. */
  sku_repetido?: string;
}

export interface VarianteWeb {
  /** Opción → valor (`{ Talla: 'M', Color: 'Rojo' }`). */
  opciones: Record<string, string>;
  origen_id?: string;
  sku?: string;
  barcode?: string;
  price?: number;
  compare_price?: number;
  disponible?: boolean;
  existencias?: number;
  imagen?: string;
}

export interface OpcionesFilasWeb {
  /** Usar las existencias de la tienda como stock inicial (exige costo para entrar). */
  existenciasComoStock?: boolean;
}

export const MAX_VARIANTES_POR_PRODUCTO = 50;
export const MAX_IMAGENES_WEB = 10;

/** El precio de comparación es el anterior (mayor). Si llegan invertidos se corrigen; si son iguales se quita. */
export function normalizarPrecios<T extends { price?: number; compare_price?: number }>(p: T): T {
  const venta = p.price;
  const comp = p.compare_price;
  if (venta && comp && venta > 0 && comp > 0) {
    if (comp < venta) return { ...p, price: comp, compare_price: venta };
    if (comp === venta) return { ...p, compare_price: undefined };
  }
  return p;
}

function palabras(s: string): Set<string> {
  return new Set(normalizarNombre(s).split(' ').filter((w) => w.length > 2));
}

/** ¿El detalle enriquecido corresponde al producto del listado? (≥ 30 % de palabras en común). */
export function nombresCorresponden(a: string, b: string): boolean {
  const A = palabras(a);
  const B = palabras(b);
  if (A.size === 0 || B.size === 0) return true;
  let comunes = 0;
  A.forEach((w) => {
    if (B.has(w)) comunes++;
  });
  return comunes / Math.min(A.size, B.size) >= 0.3;
}

/** Combina el listado con el detalle: el detalle manda en precio y códigos; lo más completo gana en lo demás. */
export function combinarDetalle(listado: ProductoWeb, detalle: ProductoWeb | null | undefined): ProductoWeb {
  if (!detalle || (detalle.name && !nombresCorresponden(listado.name, detalle.name))) return listado;
  const masLargo = <T>(x?: T[], y?: T[]) => ((y?.length ?? 0) > (x?.length ?? 0) ? y : x);
  return normalizarPrecios({
    ...listado,
    description: (detalle.description?.length ?? 0) > (listado.description?.length ?? 0) ? detalle.description : listado.description,
    images: masLargo(listado.images, detalle.images),
    variants: masLargo(listado.variants, detalle.variants),
    tags: masLargo(listado.tags, detalle.tags),
    brand: detalle.brand || listado.brand,
    sku: detalle.sku || listado.sku,
    barcode: detalle.barcode || listado.barcode,
    price: detalle.price && detalle.price > 0 ? detalle.price : listado.price,
    compare_price: detalle.compare_price && detalle.compare_price > 0 ? detalle.compare_price : listado.compare_price,
  });
}

/** ¿Le falta precio o imagen? (candidato a enriquecer con su página de detalle). */
export function incompleto(p: ProductoWeb): boolean {
  return !p.price || p.price <= 0 || !(p.images && p.images.length > 0);
}

/** Color × Talla × … (mismo producto cartesiano que la importación anterior). */
export function combinacionesVariantes(variantes: { name: string; values: string[] }[] = []): Record<string, string>[] {
  let combos: Record<string, string>[] = [{}];
  for (const tipo of variantes) {
    const valores = (tipo.values ?? []).map((v) => (v ?? '').trim()).filter(Boolean);
    if (!tipo.name?.trim() || valores.length === 0) continue;
    const siguiente: Record<string, string>[] = [];
    for (const c of combos) for (const v of valores) siguiente.push({ ...c, [tipo.name.trim()]: v });
    combos = siguiente;
  }
  return combos.length === 1 && Object.keys(combos[0]).length === 0 ? [] : combos;
}

/** Valores de la variante en orden («Rojo / M»). */
function valoresVariante(v: VarianteWeb): string[] {
  return Object.values(v.opciones ?? {}).map((x) => String(x ?? '').trim()).filter(Boolean);
}

/** Variantes reales utilizables: con al menos una opción y sin combinaciones repetidas. */
export function variantesReales(p: ProductoWeb): VarianteWeb[] {
  const vistas = new Set<string>();
  const out: VarianteWeb[] = [];
  for (const v of p.variantes_detalle ?? []) {
    const valores = valoresVariante(v);
    if (valores.length === 0) continue;
    const clave = normalizarNombre(valores.join(' '));
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    out.push(v);
  }
  return out.slice(0, MAX_VARIANTES_POR_PRODUCTO);
}

/** Cuántas hijas generará el producto (reales o cartesianas). */
export function cantidadVariantes(p: ProductoWeb): number {
  const reales = variantesReales(p).length;
  return reales > 0 ? reales : Math.min(combinacionesVariantes(p.variants).length, MAX_VARIANTES_POR_PRODUCTO);
}

const positivo = (n?: number) => (typeof n === 'number' && n > 0 ? n : undefined);

export function productosWebAFilas(productos: ProductoWeb[], opciones: OpcionesFilasWeb = {}): FilaImport[] {
  // SKU que ya traen los productos o sus variantes: el generador no los reutiliza.
  const ocupados = new Set<string>();
  for (const p of productos) {
    if (p.sku?.trim()) ocupados.add(p.sku.trim().toUpperCase());
    for (const v of p.variantes_detalle ?? []) if (v.sku?.trim()) ocupados.add(v.sku.trim().toUpperCase());
  }
  const generarSku = crearGeneradorSku('WEB', ocupados);
  const usados = new Set<string>();
  /** SKU único dentro de la importación: si ya salió, `-2`, `-3`… (determinista por orden). */
  const reservar = (base: string): string => {
    let sku = base;
    let n = 1;
    while (usados.has(sku.toUpperCase())) sku = `${base}-${++n}`;
    usados.add(sku.toUpperCase());
    return sku;
  };
  const stockDe = (existencias?: number, stock?: number) => (positivo(stock) ?? (opciones.existenciasComoStock ? positivo(existencias) : undefined));

  const filas: FilaImport[] = [];
  productos.forEach((bruto, i) => {
    const p = normalizarPrecios(bruto);
    const skuTienda = p.sku?.trim();
    const sku = reservar(skuTienda || generarSku(p.name, i + 1));
    const reales = variantesReales(p);
    const combos = reales.length > 0 ? [] : combinacionesVariantes(p.variants).slice(0, MAX_VARIANTES_POR_PRODUCTO);
    const comun: Partial<FilaImport> = {
      category: p.category?.trim() || undefined,
      brand: p.brand?.trim() || undefined,
      supplier: p.brand?.trim() || undefined,
      price: positivo(p.price),
      comparePrice: p.compare_price && p.price && p.compare_price > p.price ? p.compare_price : undefined,
      cost: positivo(p.cost),
      unit: 'UN',
    };
    const avisos: Mensaje[] = skuTienda ? [] : [{ codigo: 'skuGenerado' }];
    // Repetido en la tienda: `resolverSkusRepetidos` ya lo quitó, o `reservar` lo renombró aquí.
    const repetido = p.sku_repetido ?? (skuTienda && sku !== skuTienda ? skuTienda : undefined);
    if (repetido) avisos.push({ codigo: 'skuRepetidoTienda', params: { sku: repetido } });
    const tieneHijas = reales.length > 0 || combos.length > 0;
    filas.push({
      ...comun,
      fila: filas.length + 1,
      sku,
      skuGenerado: !skuTienda,
      name: p.name.trim().slice(0, 200),
      description: p.description?.trim() || undefined,
      barcode: p.barcode?.trim() || undefined,
      reference: skuTienda || p.sku_repetido,
      tags: (p.tags ?? []).map((t) => t.trim()).filter(Boolean).join(';') || undefined,
      imageUrls: (p.images ?? []).slice(0, MAX_IMAGENES_WEB).join(';') || undefined,
      // Un padre con hijas no lleva stock propio: lo llevan sus variantes.
      stock: tieneHijas ? undefined : stockDe(p.existencias, p.stock),
      isParent: tieneHijas ? true : undefined,
      avisosLectura: avisos,
    });
    reales.forEach((v) => {
      const valores = valoresVariante(v);
      const skuVariante = v.sku?.trim();
      const base = skuVariante || `${sku}-${slugificar(valores.join(' ')).toUpperCase().slice(0, 40) || v.origen_id || 'V'}`;
      const precio = positivo(v.price) ?? comun.price;
      const comparacion = v.compare_price && precio && v.compare_price > precio ? v.compare_price : undefined;
      filas.push({
        ...comun,
        fila: filas.length + 1,
        sku: reservar(base),
        skuGenerado: !skuVariante,
        name: `${p.name.trim()} - ${valores.join(' / ')}`.slice(0, 200),
        barcode: v.barcode?.trim() || undefined,
        reference: skuVariante,
        price: precio,
        comparePrice: comparacion,
        stock: stockDe(v.existencias),
        parentSku: sku,
        isParent: false,
        variantData: JSON.stringify(v.opciones),
        imageUrls: v.imagen || undefined,
        imagenesDelPadre: v.imagen ? undefined : true,
      });
    });
    combos.forEach((combo, j) => {
      filas.push({
        ...comun,
        fila: filas.length + 1,
        sku: reservar(`${sku}-V${j + 1}`),
        skuGenerado: true,
        name: `${p.name.trim()} - ${Object.values(combo).join(' / ')}`.slice(0, 200),
        parentSku: sku,
        isParent: false,
        variantData: JSON.stringify(combo),
        imagenesDelPadre: true,
      });
    });
  });
  return filas;
}
