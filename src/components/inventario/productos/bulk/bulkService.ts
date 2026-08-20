/**
 * Servicio para acciones masivas sobre productos
 */
import { supabase } from '@/lib/supabase/config';

export type TipoPrecio = 'venta' | 'compra' | 'comparacion';
export type ModoAjuste = 'fijo' | 'valor' | 'porcentaje';
export type ModoStock = 'set' | 'add';
export type ModoRedondeo = 'multiplo' | 'digitos';

export interface ResultadoMasivo {
  exitosos: number;
  fallidos: number;
  errores: string[];
}

/**
 * Calcula el nuevo valor según el modo de ajuste
 */
const calcularNuevoValor = (actual: number, modo: ModoAjuste, cantidad: number): number => {
  switch (modo) {
    case 'fijo':
      return cantidad;
    case 'valor':
      return Math.max(0, actual + cantidad);
    case 'porcentaje':
      return Math.max(0, actual * (1 + cantidad / 100));
    default:
      return actual;
  }
};

/**
 * Expande IDs de productos para incluir padres e hijos (variantes).
 * Consulta en lotes para evitar URLs demasiado largas en PostgREST.
 */
async function expandProductIds(productIds: number[]): Promise<number[]> {
  const EXPAND_BATCH = 300;
  const expandedIds = new Set<number>(productIds);
  const parentIdsToExpand: number[] = [];

  // Consultar productos seleccionados en lotes
  for (let i = 0; i < productIds.length; i += EXPAND_BATCH) {
    const batch = productIds.slice(i, i + EXPAND_BATCH);
    const { data, error } = await supabase
      .from('products')
      .select('id, is_parent, parent_product_id')
      .in('id', batch)
      .neq('status', 'deleted');

    if (error) console.error('[expandProductIds] Error querying products:', error);
    if (!data) continue;
    for (const p of data) {
      expandedIds.add(p.id);
      if (p.is_parent) parentIdsToExpand.push(p.id);
      if (p.parent_product_id && !productIds.includes(p.parent_product_id)) {
        parentIdsToExpand.push(p.parent_product_id);
      }
    }
  }

  console.log(`[expandProductIds] ${parentIdsToExpand.length} padres para expandir, ${expandedIds.size} IDs hasta ahora`);

  // Consultar hijos y padres adicionales en lotes
  if (parentIdsToExpand.length > 0) {
    const uniqueParentIds = [...new Set(parentIdsToExpand)];
    const childrenIds: number[] = [];
    const parentIdsNotInSelection = uniqueParentIds.filter((pid) => !productIds.includes(pid));

    for (let i = 0; i < uniqueParentIds.length; i += EXPAND_BATCH) {
      const batch = uniqueParentIds.slice(i, i + EXPAND_BATCH);
      const { data: children, error: childErr } = await supabase
        .from('products')
        .select('id')
        .in('parent_product_id', batch)
        .neq('status', 'deleted');
      if (childErr) console.error('[expandProductIds] Error querying children:', childErr);
      if (children) children.forEach((c) => childrenIds.push(c.id));
    }

    console.log(`[expandProductIds] ${childrenIds.length} hijos encontrados`);

    for (let i = 0; i < parentIdsNotInSelection.length; i += EXPAND_BATCH) {
      const batch = parentIdsNotInSelection.slice(i, i + EXPAND_BATCH);
      const { data: parents, error: parentErr } = await supabase
        .from('products')
        .select('id')
        .in('id', batch)
        .neq('status', 'deleted');
      if (parentErr) console.error('[expandProductIds] Error querying parents:', parentErr);
      if (parents) parents.forEach((p) => expandedIds.add(p.id));
    }

    childrenIds.forEach((id) => expandedIds.add(id));
  }

  console.log(`[expandProductIds] Total expandido: ${expandedIds.size} (original: ${productIds.length})`);
  return Array.from(expandedIds);
}

/**
 * Actualización masiva de precios (venta, compra o comparación)
 * Expande automáticamente padres → hijos y hijos → padres.
 * Optimizado con operaciones en lote (batch) para miles de productos.
 */
export async function bulkUpdatePrices(
  productIds: number[],
  tipo: TipoPrecio,
  modo: ModoAjuste,
  cantidad: number
): Promise<ResultadoMasivo> {
  const resultado: ResultadoMasivo = { exitosos: 0, fallidos: 0, errores: [] };
  const ahora = new Date().toISOString();
  const BATCH_SIZE = 200; // 200 por lote para evitar 500 errors en PostgREST
  const INSERT_CHUNK = 100; // inserts en sub-lotes más pequeños

  // 1. Expandir IDs: incluir hijos de padres y padres de hijos (en lotes)
  const allIds = await expandProductIds(productIds);
  if (allIds.length === 0) {
    resultado.fallidos = productIds.length;
    resultado.errores.push('No se encontraron los productos seleccionados');
    return resultado;
  }

  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batchIds = allIds.slice(i, i + BATCH_SIZE);

    try {
      if (tipo === 'compra') {
        // ── COSTOS ──
        const { data: costos, error: qErr } = await supabase
          .from('product_costs')
          .select('id, product_id, cost, supplier_id')
          .in('product_id', batchIds)
          .or('effective_to.is.null,effective_to.gt.' + ahora)
          .order('effective_from', { ascending: false });

        if (qErr) throw qErr;

        // Agrupar por product_id (el más reciente primero)
        const costoPorProducto = new Map<number, { id: number; cost: number; supplier_id: string | null }>();
        for (const c of costos || []) {
          const pid = c.product_id as number;
          if (!costoPorProducto.has(pid)) {
            costoPorProducto.set(pid, {
              id: c.id as number,
              cost: Number(c.cost) || 0,
              supplier_id: (c as any).supplier_id || null,
            });
          }
        }

        const idsACerrar: number[] = [];
        const nuevosCostos: Array<{ product_id: number; cost: number; supplier_id: string | null; effective_from: string }> = [];

        for (const productId of batchIds) {
          const costo = costoPorProducto.get(productId);
          const costoActual = costo?.cost || 0;
          const nuevoCosto = calcularNuevoValor(costoActual, modo, cantidad);

          if (costo?.id) idsACerrar.push(costo.id);

          nuevosCostos.push({
            product_id: productId,
            cost: Math.round(nuevoCosto * 100) / 100,
            supplier_id: costo?.supplier_id || null,
            effective_from: ahora,
          });
        }

        if (idsACerrar.length > 0) {
          const { error: closeErr } = await supabase
            .from('product_costs')
            .update({ effective_to: ahora })
            .in('product_id', batchIds)
            .is('effective_to', null);
          if (closeErr) {
            resultado.fallidos += nuevosCostos.length;
            resultado.errores.push(`Error al cerrar costos: ${closeErr.message}`);
            continue;
          }
        }

        if (nuevosCostos.length > 0) {
          // Insertar en sub-lotes para evitar 500 errors
          for (let j = 0; j < nuevosCostos.length; j += INSERT_CHUNK) {
            const chunk = nuevosCostos.slice(j, j + INSERT_CHUNK);
            const { error: insErr } = await supabase.from('product_costs').insert(chunk);
            if (insErr) {
              resultado.fallidos += chunk.length;
              resultado.errores.push(`Error al insertar costos: ${insErr.message}`);
            } else {
              resultado.exitosos += chunk.length;
            }
          }
        }
      } else {
        // ── PRECIOS (venta o comparación) ──
        const { data: precios, error: qErr } = await supabase
          .from('product_prices')
          .select('id, product_id, price, compare_price')
          .in('product_id', batchIds)
          .or('effective_to.is.null,effective_to.gt.' + ahora)
          .order('effective_from', { ascending: false });

        if (qErr) throw qErr;

        // Agrupar por product_id (el más reciente primero)
        const precioPorProducto = new Map<number, { id: number; price: number; compare_price: number }>();
        for (const p of precios || []) {
          const pid = p.product_id as number;
          if (!precioPorProducto.has(pid)) {
            precioPorProducto.set(pid, {
              id: p.id as number,
              price: Number(p.price) || 0,
              compare_price: Number(p.compare_price) || 0,
            });
          }
        }

        const idsACerrar: number[] = [];
        const nuevosPrecios: Array<{ product_id: number; price: number; compare_price: number | null; effective_from: string }> = [];

        for (const productId of batchIds) {
          const precio = precioPorProducto.get(productId);
          const precioActual = precio?.price || 0;
          const compareActual = precio?.compare_price || 0;

          let nuevoPrecio = precioActual;
          let nuevoCompare: number | null = compareActual || null;

          if (tipo === 'venta') {
            nuevoPrecio = calcularNuevoValor(precioActual, modo, cantidad);
          } else {
            nuevoCompare = calcularNuevoValor(compareActual, modo, cantidad);
          }

          if (precio?.id) idsACerrar.push(precio.id);

          nuevosPrecios.push({
            product_id: productId,
            price: Math.round(nuevoPrecio * 100) / 100,
            compare_price: nuevoCompare ? Math.round(nuevoCompare * 100) / 100 : null,
            effective_from: ahora,
          });
        }

        if (idsACerrar.length > 0) {
          const { error: closeErr } = await supabase
            .from('product_prices')
            .update({ effective_to: ahora })
            .in('product_id', batchIds)
            .is('effective_to', null);
          if (closeErr) {
            resultado.fallidos += nuevosPrecios.length;
            resultado.errores.push(`Error al cerrar precios: ${closeErr.message}`);
            continue;
          }
        }

        if (nuevosPrecios.length > 0) {
          // Insertar en sub-lotes para evitar 500 errors
          for (let j = 0; j < nuevosPrecios.length; j += INSERT_CHUNK) {
            const chunk = nuevosPrecios.slice(j, j + INSERT_CHUNK);
            const { error: insErr } = await supabase.from('product_prices').insert(chunk);
            if (insErr) {
              resultado.fallidos += chunk.length;
              resultado.errores.push(`Error al insertar precios: ${insErr.message}`);
            } else {
              resultado.exitosos += chunk.length;
            }
          }
        }
      }
    } catch (e: any) {
      resultado.fallidos += batchIds.length;
      resultado.errores.push(`Lote ${i}-${i + batchIds.length}: ${e.message || 'error'}`);
    }
  }
  return resultado;
}

/**
 * Actualización masiva de stock en una sucursal.
 * Expande automáticamente los IDs seleccionados para incluir:
 * - Hijos (variantes) de productos padre seleccionados
 * - Padre de productos hijo seleccionados (si el padre trackea stock)
 * Deduplica para evitar actualizar el mismo producto dos veces.
 * Respeta track_stock: solo actualiza productos que rastrean inventario.
 * Optimizado con operaciones en lote (batch) para miles de productos.
 */
export async function bulkUpdateStock(
  productIds: number[],
  branchId: number,
  cantidad: number,
  modo: ModoStock
): Promise<ResultadoMasivo> {
  const resultado: ResultadoMasivo = { exitosos: 0, fallidos: 0, errores: [] };
  const BATCH_SIZE = 300;

  // 1. Expandir IDs: incluir hijos de padres y padres de hijos (en lotes)
  const allIds = await expandProductIds(productIds);
  console.log(`[bulkUpdateStock] IDs expandidos: ${allIds.length} (originales: ${productIds.length})`);
  if (allIds.length === 0) {
    resultado.fallidos = productIds.length;
    resultado.errores.push('No se encontraron los productos seleccionados');
    return resultado;
  }

  // 2. Filtrar productos que rastrean stock (en lotes)
  const trackableIds: number[] = [];
  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batch = allIds.slice(i, i + BATCH_SIZE);
    const { data: prods, error: trackErr } = await supabase
      .from('products')
      .select('id, track_stock')
      .in('id', batch)
      .neq('status', 'deleted');
    if (trackErr) console.error('[bulkUpdateStock] Error filtering track_stock:', trackErr);
    if (prods) {
      for (const p of prods) {
        if (p.track_stock !== false) trackableIds.push(p.id);
      }
    }
  }
  console.log(`[bulkUpdateStock] Trackable IDs: ${trackableIds.length} de ${allIds.length}`);

  // 3. Procesar stock con upsert (mucho más rápido que update individual)
  const UPSERT_CHUNK = 100;
  const ahora = new Date().toISOString();

  for (let i = 0; i < trackableIds.length; i += UPSERT_CHUNK) {
    const batchIds = trackableIds.slice(i, i + UPSERT_CHUNK);

    try {
      // Consultar stock existente para el lote
      const { data: existentes, error: qErr } = await supabase
        .from('stock_levels')
        .select('id, product_id, qty_on_hand')
        .in('product_id', batchIds)
        .eq('branch_id', branchId)
        .is('lot_id', null);

      if (qErr) throw qErr;

      // Mapear stock existente
      const stockMap = new Map<number, { id: number; qty_on_hand: number }>();
      for (const s of existentes || []) {
        stockMap.set(s.product_id as number, {
          id: s.id as number,
          qty_on_hand: Number(s.qty_on_hand) || 0,
        });
      }

      // Separar updates e inserts
      const toUpdate: Array<{ id: number; qty: number }> = [];
      const toInsert: Array<{ product_id: number; branch_id: number; qty_on_hand: number; qty_reserved: number; updated_at: string }> = [];

      for (const productId of batchIds) {
        const existente = stockMap.get(productId);
        if (existente) {
          const nuevaQty = modo === 'set' ? cantidad : existente.qty_on_hand + cantidad;
          toUpdate.push({ id: existente.id, qty: Math.max(0, nuevaQty) });
        } else {
          toInsert.push({
            product_id: productId,
            branch_id: branchId,
            qty_on_hand: Math.max(0, cantidad),
            qty_reserved: 0,
            updated_at: ahora,
          });
        }
      }

      // Updates en lote usando RPC o update con in()
      // PostgREST permite update con .in() para múltiples IDs
      if (toUpdate.length > 0) {
        // Hacer updates agrupados por valor (qty) para reducir queries
        const updatesPorQty = new Map<number, number[]>();
        for (const u of toUpdate) {
          if (!updatesPorQty.has(u.qty)) updatesPorQty.set(u.qty, []);
          updatesPorQty.get(u.qty)!.push(u.id);
        }

        for (const [qty, ids] of updatesPorQty) {
          // Actualizar en sub-lotes de 100
          for (let j = 0; j < ids.length; j += 100) {
            const chunk = ids.slice(j, j + 100);
            const { error: updErr } = await supabase
              .from('stock_levels')
              .update({ qty_on_hand: qty, updated_at: ahora })
              .in('id', chunk);
            if (updErr) {
              resultado.fallidos += chunk.length;
              resultado.errores.push(`Error update stock: ${updErr.message}`);
            } else {
              resultado.exitosos += chunk.length;
            }
          }
        }
      }

      // Inserts en sub-lotes
      if (toInsert.length > 0) {
        for (let j = 0; j < toInsert.length; j += 100) {
          const chunk = toInsert.slice(j, j + 100);
          const { error: insErr } = await supabase.from('stock_levels').insert(chunk);
          if (insErr) {
            resultado.fallidos += chunk.length;
            resultado.errores.push(`Error insert stock: ${insErr.message}`);
            console.error(`[bulkUpdateStock] Error insert ${chunk.length}:`, insErr);
          } else {
            resultado.exitosos += chunk.length;
          }
        }
      }
    } catch (e: any) {
      resultado.fallidos += batchIds.length;
      resultado.errores.push(`Lote ${i}-${i + batchIds.length}: ${e.message || 'error'}`);
    }
  }
  return resultado;
}

/**
 * Cambio masivo de estado (activar/desactivar/descontinuar)
 */
export async function bulkUpdateStatus(
  productIds: number[],
  status: 'active' | 'inactive' | 'discontinued'
): Promise<ResultadoMasivo> {
  const resultado: ResultadoMasivo = { exitosos: 0, fallidos: 0, errores: [] };
  const BATCH_SIZE = 300;
  const ahora = new Date().toISOString();

  for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
    const batch = productIds.slice(i, i + BATCH_SIZE);
    const { error, count } = await supabase
      .from('products')
      .update({ status, updated_at: ahora })
      .in('id', batch);

    if (error) {
      resultado.fallidos += batch.length;
      resultado.errores.push(error.message);
    } else {
      resultado.exitosos += batch.length;
    }
  }
  return resultado;
}

/**
 * Eliminación masiva (soft delete via RPC existente)
 */
export async function bulkDelete(productIds: number[]): Promise<ResultadoMasivo> {
  const resultado: ResultadoMasivo = { exitosos: 0, fallidos: 0, errores: [] };

  for (const productId of productIds) {
    try {
      const { data, error } = await supabase.rpc('soft_delete_product', {
        p_product_id: productId,
      });
      if (error) throw error;
      if (!data) throw new Error('Sin permisos');
      resultado.exitosos++;
    } catch (e: any) {
      resultado.fallidos++;
      resultado.errores.push(`Producto ${productId}: ${e.message || 'error'}`);
    }
  }
  return resultado;
}

/**
 * Copia el precio de venta al precio de comparación de los productos
 * que NO tienen precio de comparación. Los que ya tienen, se dejan igual.
 * Expande automáticamente padres → hijos y hijos → padres (igual que bulkUpdateStock).
 * Optimizado con operaciones en lote (batch) para miles de productos.
 */
export async function bulkCopyPriceToCompare(
  productIds: number[],
  sobrescribir: boolean = false
): Promise<ResultadoMasivo> {
  const resultado: ResultadoMasivo = { exitosos: 0, fallidos: 0, errores: [] };
  const ahora = new Date().toISOString();
  const BATCH_SIZE = 200;
  const INSERT_CHUNK = 100;

  // 1. Expandir IDs: incluir hijos de padres y padres de hijos (en lotes)
  const allIds = await expandProductIds(productIds);
  if (allIds.length === 0) {
    resultado.fallidos = productIds.length;
    resultado.errores.push('No se encontraron los productos seleccionados');
    return resultado;
  }

  // 2. Particionar los IDs en lotes para evitar límites de URL de PostgREST
  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batchIds = allIds.slice(i, i + BATCH_SIZE);

    try {
      // Obtener todos los precios vigentes del lote en una sola query
      const { data: precios, error: queryError } = await supabase
        .from('product_prices')
        .select('id, product_id, price, compare_price')
        .in('product_id', batchIds)
        .or('effective_to.is.null,effective_to.gt.' + ahora)
        .order('effective_from', { ascending: false });

      if (queryError) throw queryError;

      // Agrupar por product_id y quedarse con el más reciente (ya ordenado desc)
      const precioPorProducto = new Map<number, { id: number; price: number; compare_price: number }>();
      for (const p of precios || []) {
        const pid = p.product_id as number;
        if (!precioPorProducto.has(pid)) {
          precioPorProducto.set(pid, {
            id: p.id as number,
            price: Number(p.price) || 0,
            compare_price: Number(p.compare_price) || 0,
          });
        }
      }

      // Filtrar productos que necesitan actualización
      const idsACerrar: number[] = [];
      const nuevosPrecios: Array<{ product_id: number; price: number; compare_price: number; effective_from: string }> = [];

      for (const productId of batchIds) {
        const precio = precioPorProducto.get(productId);
        if (!precio || precio.price <= 0) {
          resultado.fallidos++;
          resultado.errores.push(`Producto ${productId}: sin precio de venta`);
          continue;
        }

        // Si ya tiene compare_price y no se solicita sobrescribir, saltar
        if (precio.compare_price > 0 && !sobrescribir) {
          resultado.exitosos++;
          continue;
        }

        idsACerrar.push(precio.id);
        nuevosPrecios.push({
          product_id: productId,
          price: Math.round(precio.price * 100) / 100,
          compare_price: Math.round(precio.price * 100) / 100,
          effective_from: ahora,
        });
      }

      // Cerrar precios anteriores en lote
      if (idsACerrar.length > 0) {
        const { error: closeError } = await supabase
          .from('product_prices')
          .update({ effective_to: ahora })
          .in('product_id', batchIds)
          .is('effective_to', null);
        if (closeError) {
          resultado.fallidos += nuevosPrecios.length;
          resultado.errores.push(`Error al cerrar precios: ${closeError.message}`);
          continue;
        }
      }

      // Insertar nuevos precios en sub-lotes
      if (nuevosPrecios.length > 0) {
        for (let j = 0; j < nuevosPrecios.length; j += INSERT_CHUNK) {
          const chunk = nuevosPrecios.slice(j, j + INSERT_CHUNK);
          const { error: insertError } = await supabase
            .from('product_prices')
            .insert(chunk);
          if (insertError) {
            resultado.fallidos += chunk.length;
            resultado.errores.push(`Error al insertar: ${insertError.message}`);
          } else {
            resultado.exitosos += chunk.length;
          }
        }
      }
    } catch (e: any) {
      resultado.fallidos += batchIds.length;
      resultado.errores.push(`Lote ${i}-${i + batchIds.length}: ${e.message || 'error'}`);
    }
  }
  return resultado;
}

/**
 * Calcula el precio redondeado según el modo seleccionado
 * - multiplo: redondea al múltiplo más cercano de N (ej: múltiplo de 100 → 1234 → 1200)
 * - digitos: reemplaza los últimos N dígitos con un valor específico (ej: últimos 3 = "990" → 1234 → 1990)
 */
function calcularRedondeo(
  precio: number,
  modo: ModoRedondeo,
  multiplo: number,
  digitosCount: number,
  digitosValor: string
): number {
  if (precio <= 0) return precio;

  if (modo === 'multiplo') {
    if (multiplo <= 0) return precio;
    return Math.round(precio / multiplo) * multiplo;
  }

  // modo === 'digitos'
  if (digitosCount <= 0 || !digitosValor) return precio;
  const valorNum = parseInt(digitosValor, 10);
  if (isNaN(valorNum)) return precio;

  // Divisor = 10^digitosCount (ej: 3 dígitos → 1000)
  const divisor = Math.pow(10, digitosCount);
  // Parte alta del precio (sin los últimos N dígitos)
  const parteAlta = Math.floor(precio / divisor) * divisor;
  // Reemplazar los últimos N dígitos con el valor especificado
  return parteAlta + valorNum;
}

/**
 * Redondeo masivo de precios (venta, compra o comparación)
 * Expande automáticamente padres → hijos y padres de hijos.
 */
export async function bulkRoundPrices(
  productIds: number[],
  tipo: TipoPrecio,
  modo: ModoRedondeo,
  multiplo: number,
  digitosCount: number,
  digitosValor: string
): Promise<ResultadoMasivo> {
  const resultado: ResultadoMasivo = { exitosos: 0, fallidos: 0, errores: [] };
  const ahora = new Date().toISOString();
  const BATCH_SIZE = 200;
  const INSERT_CHUNK = 100;

  // 1. Expandir IDs: incluir hijos de padres y padres de hijos (en lotes)
  const allIds = await expandProductIds(productIds);
  if (allIds.length === 0) {
    resultado.fallidos = productIds.length;
    resultado.errores.push('No se encontraron los productos seleccionados');
    return resultado;
  }

  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batchIds = allIds.slice(i, i + BATCH_SIZE);

    try {
      if (tipo === 'compra') {
        // ── COSTOS ──
        const { data: costos, error: qErr } = await supabase
          .from('product_costs')
          .select('id, product_id, cost, supplier_id')
          .in('product_id', batchIds)
          .or('effective_to.is.null,effective_to.gt.' + ahora)
          .order('effective_from', { ascending: false });

        if (qErr) throw qErr;

        const costoPorProducto = new Map<number, { id: number; cost: number; supplier_id: string | null }>();
        for (const c of costos || []) {
          const pid = c.product_id as number;
          if (!costoPorProducto.has(pid)) {
            costoPorProducto.set(pid, {
              id: c.id as number,
              cost: Number(c.cost) || 0,
              supplier_id: (c as any).supplier_id || null,
            });
          }
        }

        const idsACerrar: number[] = [];
        const nuevosCostos: Array<{ product_id: number; cost: number; supplier_id: string | null; effective_from: string }> = [];

        for (const productId of batchIds) {
          const costo = costoPorProducto.get(productId);
          const costoActual = costo?.cost || 0;
          if (costoActual <= 0) {
            resultado.fallidos++;
            resultado.errores.push(`Producto ${productId}: sin costo`);
            continue;
          }
          const nuevoCosto = calcularRedondeo(costoActual, modo, multiplo, digitosCount, digitosValor);
          if (costo?.id) idsACerrar.push(costo.id);
          nuevosCostos.push({
            product_id: productId,
            cost: Math.round(nuevoCosto * 100) / 100,
            supplier_id: costo?.supplier_id || null,
            effective_from: ahora,
          });
        }

        if (idsACerrar.length > 0) {
          const { error: closeErr } = await supabase
            .from('product_costs')
            .update({ effective_to: ahora })
            .in('product_id', batchIds)
            .is('effective_to', null);
          if (closeErr) {
            resultado.fallidos += nuevosCostos.length;
            resultado.errores.push(`Error al cerrar costos: ${closeErr.message}`);
            continue;
          }
        }

        if (nuevosCostos.length > 0) {
          for (let j = 0; j < nuevosCostos.length; j += INSERT_CHUNK) {
            const chunk = nuevosCostos.slice(j, j + INSERT_CHUNK);
            const { error: insErr } = await supabase.from('product_costs').insert(chunk);
            if (insErr) {
              resultado.fallidos += chunk.length;
              resultado.errores.push(`Error al insertar costos: ${insErr.message}`);
            } else {
              resultado.exitosos += chunk.length;
            }
          }
        }
      } else {
        // ── PRECIOS (venta o comparación) ──
        const { data: precios, error: qErr } = await supabase
          .from('product_prices')
          .select('id, product_id, price, compare_price')
          .in('product_id', batchIds)
          .or('effective_to.is.null,effective_to.gt.' + ahora)
          .order('effective_from', { ascending: false });

        if (qErr) throw qErr;

        const precioPorProducto = new Map<number, { id: number; price: number; compare_price: number }>();
        for (const p of precios || []) {
          const pid = p.product_id as number;
          if (!precioPorProducto.has(pid)) {
            precioPorProducto.set(pid, {
              id: p.id as number,
              price: Number(p.price) || 0,
              compare_price: Number(p.compare_price) || 0,
            });
          }
        }

        const idsACerrar: number[] = [];
        const nuevosPrecios: Array<{ product_id: number; price: number; compare_price: number | null; effective_from: string }> = [];

        for (const productId of batchIds) {
          const precio = precioPorProducto.get(productId);
          const precioActual = precio?.price || 0;
          const compareActual = precio?.compare_price || 0;

          let nuevoPrecio = precioActual;
          let nuevoCompare: number | null = compareActual || null;

          if (tipo === 'venta') {
            if (precioActual <= 0) {
              resultado.fallidos++;
              resultado.errores.push(`Producto ${productId}: sin precio de venta`);
              continue;
            }
            nuevoPrecio = calcularRedondeo(precioActual, modo, multiplo, digitosCount, digitosValor);
          } else if (tipo === 'comparacion') {
            if (compareActual <= 0) {
              // No es error, simplemente no tiene precio de comparación - omitir
              continue;
            }
            nuevoCompare = calcularRedondeo(compareActual, modo, multiplo, digitosCount, digitosValor);
          }

          if (precio?.id) idsACerrar.push(precio.id);
          nuevosPrecios.push({
            product_id: productId,
            price: Math.round(nuevoPrecio * 100) / 100,
            compare_price: nuevoCompare ? Math.round(nuevoCompare * 100) / 100 : null,
            effective_from: ahora,
          });
        }

        if (idsACerrar.length > 0) {
          const { error: closeErr } = await supabase
            .from('product_prices')
            .update({ effective_to: ahora })
            .in('product_id', batchIds)
            .is('effective_to', null);
          if (closeErr) {
            resultado.fallidos += nuevosPrecios.length;
            resultado.errores.push(`Error al cerrar precios: ${closeErr.message}`);
            continue;
          }
        }

        if (nuevosPrecios.length > 0) {
          for (let j = 0; j < nuevosPrecios.length; j += INSERT_CHUNK) {
            const chunk = nuevosPrecios.slice(j, j + INSERT_CHUNK);
            const { error: insErr } = await supabase.from('product_prices').insert(chunk);
            if (insErr) {
              resultado.fallidos += chunk.length;
              resultado.errores.push(`Error al insertar precios: ${insErr.message}`);
            } else {
              resultado.exitosos += chunk.length;
            }
          }
        }
      }
    } catch (e: any) {
      resultado.fallidos += batchIds.length;
      resultado.errores.push(`Lote ${i}-${i + batchIds.length}: ${e.message || 'error'}`);
    }
  }
  return resultado;
}

/**
 * Asignación masiva de categoría
 */
export async function bulkAssignCategory(
  productIds: number[],
  categoryId: number
): Promise<ResultadoMasivo> {
  const resultado: ResultadoMasivo = { exitosos: 0, fallidos: 0, errores: [] };
  const BATCH_SIZE = 300;
  const ahora = new Date().toISOString();

  for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
    const batch = productIds.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('products')
      .update({ category_id: categoryId, updated_at: ahora })
      .in('id', batch);

    if (error) {
      resultado.fallidos += batch.length;
      resultado.errores.push(error.message);
    } else {
      resultado.exitosos += batch.length;
    }
  }
  return resultado;
}
