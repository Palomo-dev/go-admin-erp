/**
 * Servicio para acciones masivas sobre productos
 */
import { supabase } from '@/lib/supabase/config';

export type TipoPrecio = 'venta' | 'compra' | 'comparacion';
export type ModoAjuste = 'fijo' | 'valor' | 'porcentaje';
export type ModoStock = 'set' | 'add';

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
 * Actualización masiva de precios (venta, compra o comparación)
 */
export async function bulkUpdatePrices(
  productIds: number[],
  tipo: TipoPrecio,
  modo: ModoAjuste,
  cantidad: number
): Promise<ResultadoMasivo> {
  const resultado: ResultadoMasivo = { exitosos: 0, fallidos: 0, errores: [] };
  const ahora = new Date().toISOString();

  for (const productId of productIds) {
    try {
      if (tipo === 'compra') {
        // Costo actual vigente
        const { data: costos } = await supabase
          .from('product_costs')
          .select('id, cost, supplier_id')
          .eq('product_id', productId)
          .or('effective_to.is.null,effective_to.gt.' + ahora)
          .order('effective_from', { ascending: false })
          .limit(1);

        const costoActual = costos?.[0]?.cost || 0;
        const nuevoCosto = calcularNuevoValor(Number(costoActual), modo, cantidad);

        // Cerrar costo anterior
        if (costos?.[0]?.id) {
          await supabase
            .from('product_costs')
            .update({ effective_to: ahora })
            .eq('id', costos[0].id);
        }

        // Insertar nuevo costo
        const { error } = await supabase.from('product_costs').insert({
          product_id: productId,
          cost: Math.round(nuevoCosto * 100) / 100,
          supplier_id: costos?.[0]?.supplier_id || null,
          effective_from: ahora,
        });
        if (error) throw error;
      } else {
        // Precio actual vigente (venta o comparación)
        const { data: precios } = await supabase
          .from('product_prices')
          .select('id, price, compare_price')
          .eq('product_id', productId)
          .or('effective_to.is.null,effective_to.gt.' + ahora)
          .order('effective_from', { ascending: false })
          .limit(1);

        const precioActual = Number(precios?.[0]?.price || 0);
        const compareActual = Number(precios?.[0]?.compare_price || 0);

        let nuevoPrecio = precioActual;
        let nuevoCompare: number | null = compareActual || null;

        if (tipo === 'venta') {
          nuevoPrecio = calcularNuevoValor(precioActual, modo, cantidad);
        } else {
          nuevoCompare = calcularNuevoValor(compareActual, modo, cantidad);
        }

        // Cerrar precio anterior
        if (precios?.[0]?.id) {
          await supabase
            .from('product_prices')
            .update({ effective_to: ahora })
            .eq('id', precios[0].id);
        }

        // Insertar nuevo precio
        const { error } = await supabase.from('product_prices').insert({
          product_id: productId,
          price: Math.round(nuevoPrecio * 100) / 100,
          compare_price: nuevoCompare ? Math.round(nuevoCompare * 100) / 100 : null,
          effective_from: ahora,
        });
        if (error) throw error;
      }
      resultado.exitosos++;
    } catch (e: any) {
      resultado.fallidos++;
      resultado.errores.push(`Producto ${productId}: ${e.message || 'error'}`);
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
 */
export async function bulkUpdateStock(
  productIds: number[],
  branchId: number,
  cantidad: number,
  modo: ModoStock
): Promise<ResultadoMasivo> {
  const resultado: ResultadoMasivo = { exitosos: 0, fallidos: 0, errores: [] };

  // 1. Consultar info de los productos seleccionados (is_parent, parent_product_id, track_stock)
  const { data: selectedProducts } = await supabase
    .from('products')
    .select('id, is_parent, parent_product_id, track_stock')
    .in('id', productIds);

  if (!selectedProducts || selectedProducts.length === 0) {
    resultado.fallidos = productIds.length;
    resultado.errores.push('No se encontraron los productos seleccionados');
    return resultado;
  }

  // 2. Construir conjunto expandido de IDs a actualizar
  const expandedIds = new Set<number>();
  const parentIdsToExpand: number[] = [];

  for (const p of selectedProducts) {
    // Si el producto rastrea stock, incluirlo
    if (p.track_stock !== false) {
      expandedIds.add(p.id);
    }
    // Si es producto padre, marcar para buscar hijos
    if (p.is_parent) {
      parentIdsToExpand.push(p.id);
    }
    // Si es producto hijo y el padre no estaba en la selección, incluir el padre
    // (solo si el padre trackea stock — se verificará al consultar)
    if (p.parent_product_id && !productIds.includes(p.parent_product_id)) {
      // El padre se agregará si trackea stock al consultar sus datos
      parentIdsToExpand.push(p.parent_product_id);
    }
  }

  // 3. Consultar hijos de los padres identificados
  if (parentIdsToExpand.length > 0) {
    const { data: children } = await supabase
      .from('products')
      .select('id, track_stock')
      .in('parent_product_id', parentIdsToExpand)
      .neq('status', 'deleted');

    if (children) {
      for (const child of children) {
        if (child.track_stock !== false) {
          expandedIds.add(child.id);
        }
      }
    }

    // También consultar los padres que no estaban en la selección original
    const newParentIds = parentIdsToExpand.filter(
      (pid) => !productIds.includes(pid)
    );
    if (newParentIds.length > 0) {
      const { data: parents } = await supabase
        .from('products')
        .select('id, track_stock')
        .in('id', newParentIds)
        .neq('status', 'deleted');

      if (parents) {
        for (const parent of parents) {
          if (parent.track_stock !== false) {
            expandedIds.add(parent.id);
          }
        }
      }
    }
  }

  // 4. Actualizar stock para cada producto del conjunto expandido
  for (const productId of expandedIds) {
    try {
      const { data: existente } = await supabase
        .from('stock_levels')
        .select('id, qty_on_hand')
        .eq('product_id', productId)
        .eq('branch_id', branchId)
        .is('lot_id', null)
        .limit(1)
        .maybeSingle();

      if (existente) {
        const nuevaQty = modo === 'set' ? cantidad : Number(existente.qty_on_hand || 0) + cantidad;
        const { error } = await supabase
          .from('stock_levels')
          .update({ qty_on_hand: Math.max(0, nuevaQty), updated_at: new Date().toISOString() })
          .eq('id', existente.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('stock_levels').insert({
          product_id: productId,
          branch_id: branchId,
          qty_on_hand: Math.max(0, cantidad),
          qty_reserved: 0,
        });
        if (error) throw error;
      }
      resultado.exitosos++;
    } catch (e: any) {
      resultado.fallidos++;
      resultado.errores.push(`Producto ${productId}: ${e.message || 'error'}`);
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
  const { error, count } = await supabase
    .from('products')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', productIds);

  if (error) {
    resultado.fallidos = productIds.length;
    resultado.errores.push(error.message);
  } else {
    resultado.exitosos = productIds.length;
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
 * Asignación masiva de categoría
 */
export async function bulkAssignCategory(
  productIds: number[],
  categoryId: number
): Promise<ResultadoMasivo> {
  const resultado: ResultadoMasivo = { exitosos: 0, fallidos: 0, errores: [] };
  const { error } = await supabase
    .from('products')
    .update({ category_id: categoryId, updated_at: new Date().toISOString() })
    .in('id', productIds);

  if (error) {
    resultado.fallidos = productIds.length;
    resultado.errores.push(error.message);
  } else {
    resultado.exitosos = productIds.length;
  }
  return resultado;
}
