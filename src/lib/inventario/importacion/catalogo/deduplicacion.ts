/**
 * Deduplicación del catálogo leído y resumen para la vista previa.
 *
 * Dentro de una lectura un mismo producto puede llegar dos veces (VTEX por dos
 * categorías, Shopify por el catálogo y por una colección): se fusiona por su
 * id en la plataforma, después por URL y por último por SKU.
 *
 * Entre importaciones la deduplicación la hace el SKU: el asistente pide al
 * servidor qué SKU existen y la RPC actualiza en vez de crear. Por eso el SKU
 * de cada fila sale de forma determinista (el de la tienda o uno generado del
 * nombre/opciones, `web.ts`), y un SKU de la tienda repetido entre dos
 * productos distintos se descarta en el segundo (se genera uno y se avisa).
 */

import { normalizarNombre } from '../texto';
import { cantidadVariantes, type ProductoWeb } from '../web';

function urlNormalizada(u?: string): string | undefined {
  if (!u) return undefined;
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return undefined;
  }
}

/** Claves por las que se reconoce el mismo producto, de la más a la menos fiable. */
export function clavesProducto(p: ProductoWeb): string[] {
  const claves: string[] = [];
  if (p.origen_id) claves.push(`id:${p.origen_id}`);
  const u = urlNormalizada(p.url);
  if (u) claves.push(`url:${u}`);
  if (p.sku?.trim()) claves.push(`sku:${p.sku.trim().toUpperCase()}`);
  return claves;
}

/** Completa lo que le falta a `a` con lo de `b` (sin pisar lo que ya trae). */
function completar(a: ProductoWeb, b: ProductoWeb): ProductoWeb {
  const imagenes = Array.from(new Set([...(a.images ?? []), ...(b.images ?? [])]));
  return {
    ...b,
    ...Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))),
    images: imagenes,
    variantes_detalle: (a.variantes_detalle?.length ?? 0) >= (b.variantes_detalle?.length ?? 0) ? a.variantes_detalle : b.variantes_detalle,
  } as ProductoWeb;
}

/**
 * Agrega una tanda al catálogo acumulado. Devuelve el catálogo nuevo (sin
 * mutar el anterior) y cuántos de la tanda ya estaban.
 */
export function fusionarCatalogo(acumulado: ProductoWeb[], tanda: ProductoWeb[]): { productos: ProductoWeb[]; repetidos: number } {
  const productos = acumulado.slice();
  const indice = new Map<string, number>();
  productos.forEach((p, i) => clavesProducto(p).forEach((k) => indice.has(k) || indice.set(k, i)));
  let repetidos = 0;
  for (const p of tanda) {
    if (!p?.name?.trim()) continue;
    const claves = clavesProducto(p);
    const existente = claves.map((k) => indice.get(k)).find((i) => i !== undefined);
    if (existente !== undefined) {
      productos[existente] = completar(productos[existente], p);
      claves.forEach((k) => indice.has(k) || indice.set(k, existente));
      repetidos++;
      continue;
    }
    const i = productos.push(p) - 1;
    claves.forEach((k) => indice.has(k) || indice.set(k, i));
  }
  return { productos, repetidos };
}

/**
 * SKU de la tienda repetido entre productos distintos (pasa en tiendas que
 * reusan el SKU o lo dejan como «0»): el primero lo conserva; a los demás se
 * les quita para que se genere uno, y queda marcado para avisar.
 */
export function resolverSkusRepetidos(productos: ProductoWeb[]): ProductoWeb[] {
  const vistos = new Set<string>();
  return productos.map((p) => {
    let actual = p;
    const k = p.sku?.trim().toUpperCase();
    if (k) {
      if (vistos.has(k)) actual = { ...actual, sku: undefined, sku_repetido: p.sku!.trim() };
      else vistos.add(k);
    }
    if (actual.variantes_detalle?.some((v) => v.sku)) {
      actual = {
        ...actual,
        variantes_detalle: actual.variantes_detalle.map((v) => {
          const kv = v.sku?.trim().toUpperCase();
          if (!kv) return v;
          if (vistos.has(kv)) return { ...v, sku: undefined };
          vistos.add(kv);
          return v;
        }),
      };
    }
    return actual;
  });
}

export interface ResumenCatalogo {
  productos: number;
  variantes: number;
  categorias: { nombre: string; cantidad: number }[];
  sinCategoria: number;
  conPrecio: number;
  conImagen: number;
  conExistencias: number;
}

export function resumenCatalogo(productos: ProductoWeb[]): ResumenCatalogo {
  const cats = new Map<string, { nombre: string; cantidad: number }>();
  let variantes = 0;
  let sinCategoria = 0;
  let conPrecio = 0;
  let conImagen = 0;
  let conExistencias = 0;
  for (const p of productos) {
    variantes += cantidadVariantes(p);
    if (p.price && p.price > 0) conPrecio++;
    if (p.images?.length) conImagen++;
    if (typeof p.existencias === 'number' || p.variantes_detalle?.some((v) => typeof v.existencias === 'number')) conExistencias++;
    const c = p.category?.trim();
    if (!c) {
      sinCategoria++;
      continue;
    }
    const k = normalizarNombre(c);
    const e = cats.get(k);
    if (e) e.cantidad++;
    else cats.set(k, { nombre: c, cantidad: 1 });
  }
  return {
    productos: productos.length,
    variantes,
    categorias: Array.from(cats.values()).sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre)),
    sinCategoria,
    conPrecio,
    conImagen,
    conExistencias,
  };
}

/** Clave de categoría para filtrar la selección (misma normalización que la RPC). */
export const claveCategoria = (c?: string) => normalizarNombre(c ?? '');
