import { supabase } from '@/lib/supabase/config';
import { textoVariante } from '@/lib/utils/etiquetasImpresion';

/**
 * Datos para imprimir etiquetas de producto: nombre, variante, SKU, código,
 * precio vigente (`product_prices` por `effective_from`/`effective_to`) y
 * stock de la sucursal (`stock_levels`). `products` no tiene precio.
 *
 * Un producto con variantes se imprime por variante (lo que lleva la
 * etiqueta es la talla o el color concreto); uno sin variantes, él mismo.
 * Lecturas con la sesión del usuario (RLS por organización) y filtro
 * explícito por `organization_id`.
 */

export interface ProductoEtiquetable {
  productId: number;
  padreId: number | null;
  nombre: string;
  variante: string | null;
  sku: string | null;
  codigo: string | null;
  precio: number | null;
  precioComparacion: number | null;
  /** Unidades en la sucursal (o en todas); null si no rastrea inventario. */
  stock: number | null;
  rastreaStock: boolean;
}

interface FilaProducto {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  parent_product_id: number | null;
  variant_data: unknown;
  status: string | null;
  track_stock: boolean | null;
}

interface FilaPrecio {
  product_id: number;
  price: number | string;
  compare_price: number | string | null;
  effective_from: string;
  effective_to: string | null;
}

const LOTE = 150;
const COLUMNAS = 'id, name, sku, barcode, parent_product_id, variant_data, status, track_stock';

async function porLotes<T>(ids: number[], consulta: (lote: number[]) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const salida: T[] = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await consulta(ids.slice(i, i + LOTE));
    if (error) throw error;
    salida.push(...(data ?? []));
  }
  return salida;
}

/** Precio vigente ahora: el de `effective_from` más reciente que no haya vencido. */
export function precioVigente(filas: readonly FilaPrecio[], ahora = Date.now()): { precio: number; comparacion: number | null } | null {
  let mejor: FilaPrecio | null = null;
  for (const f of filas) {
    const desde = Date.parse(f.effective_from);
    const hasta = f.effective_to ? Date.parse(f.effective_to) : Infinity;
    if (!(desde <= ahora && hasta > ahora)) continue;
    if (!mejor || desde > Date.parse(mejor.effective_from)) mejor = f;
  }
  if (!mejor) return null;
  const comparacion = mejor.compare_price === null ? null : Number(mejor.compare_price);
  return { precio: Number(mejor.price), comparacion: comparacion && comparacion > 0 ? comparacion : null };
}

const vivo = (p: FilaProducto) => (p.status ?? 'active') !== 'deleted';

export async function cargarProductosEtiquetables(
  organizationId: number,
  ids: number[],
  branchId: number | null,
): Promise<ProductoEtiquetable[]> {
  const unicos = Array.from(new Set(ids.filter((n) => Number.isFinite(n) && n > 0)));
  if (unicos.length === 0) return [];

  const seleccion = await porLotes<FilaProducto>(unicos, (lote) =>
    supabase.from('products').select(COLUMNAS).eq('organization_id', organizationId).in('id', lote),
  );
  const porId = new Map(seleccion.filter(vivo).map((p) => [p.id, p]));

  // Variantes de los seleccionados y padres de las variantes seleccionadas.
  const hijas = await porLotes<FilaProducto>(Array.from(porId.keys()), (lote) =>
    supabase.from('products').select(COLUMNAS).eq('organization_id', organizationId).in('parent_product_id', lote).order('id'),
  );
  const variantesDe = new Map<number, FilaProducto[]>();
  for (const h of hijas.filter(vivo)) {
    const lista = variantesDe.get(Number(h.parent_product_id)) ?? [];
    lista.push(h);
    variantesDe.set(Number(h.parent_product_id), lista);
  }
  const idsPadres = Array.from(
    new Set(Array.from(porId.values()).map((p) => p.parent_product_id).filter((x): x is number => !!x && !porId.has(x))),
  );
  const padres = await porLotes<FilaProducto>(idsPadres, (lote) =>
    supabase.from('products').select(COLUMNAS).eq('organization_id', organizationId).in('id', lote),
  );
  const nombrePadre = new Map<number, string>([...seleccion, ...padres].map((p) => [p.id, p.name]));

  // Lo que se imprime, en el orden en que llegaron los ids.
  const filas: FilaProducto[] = [];
  const vistos = new Set<number>();
  for (const id of unicos) {
    const p = porId.get(id);
    if (!p) continue;
    const variantes = variantesDe.get(p.id);
    for (const f of variantes && variantes.length ? variantes : [p]) {
      if (vistos.has(f.id)) continue;
      vistos.add(f.id);
      filas.push(f);
    }
  }
  if (filas.length === 0) return [];

  const idsPrecio = Array.from(new Set([...filas.map((f) => f.id), ...filas.map((f) => f.parent_product_id).filter((x): x is number => !!x)]));
  const precios = await porLotes<FilaPrecio>(idsPrecio, (lote) =>
    supabase.from('product_prices').select('product_id, price, compare_price, effective_from, effective_to').in('product_id', lote),
  );
  const preciosDe = new Map<number, FilaPrecio[]>();
  for (const pr of precios) {
    const lista = preciosDe.get(Number(pr.product_id)) ?? [];
    lista.push(pr);
    preciosDe.set(Number(pr.product_id), lista);
  }

  const niveles = await porLotes<{ product_id: number; qty_on_hand: number | string | null }>(
    filas.map((f) => f.id),
    (lote) => {
      let q = supabase.from('stock_levels').select('product_id, qty_on_hand').in('product_id', lote);
      if (branchId !== null) q = q.eq('branch_id', branchId);
      return q;
    },
  );
  const stockDe = new Map<number, number>();
  for (const n of niveles) {
    stockDe.set(Number(n.product_id), (stockDe.get(Number(n.product_id)) ?? 0) + (Number(n.qty_on_hand) || 0));
  }

  return filas.map((f) => {
    const propio = precioVigente(preciosDe.get(f.id) ?? []);
    const vigente = propio ?? (f.parent_product_id ? precioVigente(preciosDe.get(f.parent_product_id) ?? []) : null);
    const rastrea = f.track_stock !== false;
    return {
      productId: f.id,
      padreId: f.parent_product_id,
      nombre: f.parent_product_id ? nombrePadre.get(f.parent_product_id) ?? f.name : f.name,
      variante: f.parent_product_id ? textoVariante(f.variant_data) ?? f.name : null,
      sku: f.sku,
      codigo: f.barcode?.trim() || null,
      precio: vigente?.precio ?? null,
      precioComparacion: vigente?.comparacion ?? null,
      stock: rastrea ? stockDe.get(f.id) ?? 0 : null,
      rastreaStock: rastrea,
    };
  });
}
