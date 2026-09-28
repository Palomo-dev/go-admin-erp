/**
 * Productos extraídos de una web (Edge Function `product-scraper`) → filas del
 * mismo asistente de importación. Así el scraping deja de tener su propia
 * importación (antes la hacía la Edge Function con service role y la
 * organización del body) y pasa por la misma RPC transaccional que el archivo.
 *
 * Se conserva lo que hacía la importación anterior del scraping:
 *   - variantes (Color × Talla…) como productos hijos `SKU-V1…` con el mismo precio;
 *   - la marca también como proveedor; el SKU de la tienda como referencia;
 *   - todas las etiquetas; hasta 10 imágenes por producto; las variantes heredan las del padre;
 *   - precio de comparación siempre el mayor.
 */

import { crearGeneradorSku } from './lector';
import { normalizarNombre } from './texto';
import type { FilaImport } from './tipos';

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

export function productosWebAFilas(productos: ProductoWeb[]): FilaImport[] {
  const generarSku = crearGeneradorSku('WEB', productos.map((p) => p.sku ?? '').filter(Boolean));
  const filas: FilaImport[] = [];
  productos.forEach((bruto, i) => {
    const p = normalizarPrecios(bruto);
    const skuTienda = p.sku?.trim();
    const sku = skuTienda || generarSku(p.name, i + 1);
    const combos = combinacionesVariantes(p.variants).slice(0, MAX_VARIANTES_POR_PRODUCTO);
    const comun: Partial<FilaImport> = {
      category: p.category?.trim() || undefined,
      brand: p.brand?.trim() || undefined,
      supplier: p.brand?.trim() || undefined,
      price: p.price && p.price > 0 ? p.price : undefined,
      comparePrice: p.compare_price && p.price && p.compare_price > p.price ? p.compare_price : undefined,
      cost: p.cost && p.cost > 0 ? p.cost : undefined,
      unit: 'UN',
    };
    filas.push({
      ...comun,
      fila: filas.length + 1,
      sku,
      skuGenerado: !skuTienda,
      name: p.name.trim().slice(0, 200),
      description: p.description?.trim() || undefined,
      barcode: p.barcode?.trim() || undefined,
      reference: skuTienda,
      tags: (p.tags ?? []).map((t) => t.trim()).filter(Boolean).join(';') || undefined,
      imageUrls: (p.images ?? []).slice(0, MAX_IMAGENES_WEB).join(';') || undefined,
      stock: typeof p.stock === 'number' && p.stock > 0 ? p.stock : undefined,
      isParent: combos.length > 0 ? true : undefined,
      avisosLectura: skuTienda ? [] : [{ codigo: 'skuGenerado' }],
    });
    combos.forEach((combo, j) => {
      filas.push({
        ...comun,
        fila: filas.length + 1,
        sku: `${sku}-V${j + 1}`,
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
