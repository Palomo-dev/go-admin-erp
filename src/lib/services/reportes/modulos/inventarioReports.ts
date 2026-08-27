// ============================================================
// Reportes de Inventario
// Llama a las RPCs: fn_reporte_stock_critico, fn_reporte_movimientos_inventario, fn_reporte_rotacion_inventario
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { getBranchFilter } from '@/lib/hooks/useOrganization';
import { getOrgDateRange } from '@/lib/utils/timezone';
import type { ReportDefinition, ReportData, PeriodoCierre } from '../types';

function buildReportData(
  id: string,
  titulo: string,
  modulo: string,
  periodo: PeriodoCierre,
  kpis: ReportData['kpis'],
  columnas: ReportData['columnas'],
  filas: Record<string, unknown>[],
  totales?: Record<string, unknown>,
): ReportData {
  return { id, titulo, modulo, kpis, columnas, filas, totales, generadoEn: new Date().toISOString(), periodo };
}

interface ProductCostRef {
  cost?: string | number | null;
  effective_from?: string | null;
  effective_to?: string | null;
}

/**
 * Devuelve el costo unitario efectivo de un producto.
 * Prioriza stock_levels.avg_cost; si es 0/NULL, usa el costo vigente
 * de product_costs (effective_to IS NULL, más reciente por effective_from).
 */
function getEffectiveCost(
  avgCost: number,
  productCosts?: ProductCostRef[] | ProductCostRef | null,
): number {
  if (avgCost > 0) return avgCost;
  if (!productCosts) return 0;
  const costs = Array.isArray(productCosts) ? productCosts : [productCosts];
  if (costs.length === 0) return 0;
  const vigentes = costs
    .filter((c) => c.effective_to === null || c.effective_to === undefined)
    .sort((a, b) => (String(b.effective_from ?? '').localeCompare(String(a.effective_from ?? ''))));
  return Number(vigentes[0]?.cost) || 0;
}

export const inventarioReports: ReportDefinition[] = [
  {
    id: 'stock-critico',
    modulo: 'inventory',
    titulo: 'Stock Crítico',
    descripcion: 'Productos bajo el mínimo de stock',
    categoria: 'operativo',
    periodosSugeridos: ['diario'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const branchFilter = getBranchFilter();

      let query = supabase
        .from('stock_levels')
        .select(`
          product_id,
          branch_id,
          qty_on_hand,
          qty_reserved,
          min_level,
          avg_cost,
          products!inner(id, sku, name, category_id, track_stock, status, is_parent, parent_product_id, organization_id, categories(name)),
          branches(id, name),
          product_costs(cost, effective_from, effective_to)
        `)
        .eq('products.organization_id', orgId)
        .eq('products.status', 'active')
        .eq('products.track_stock', true);

      if (branchFilter !== null) {
        query = query.eq('branch_id', branchFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Filtrar solo productos con stock agotado en al menos una sucursal o bajo el mínimo
      const allRows = ((data ?? []) as Record<string, unknown>[]).filter((sl) => {
        const stockActual = Number(sl.qty_on_hand ?? 0);
        const minimo = Number(sl.min_level ?? 0);
        return stockActual <= 0 || (minimo > 0 && stockActual <= minimo);
      });

      // Obtener productos padre para agrupar variantes
      const parentIds = new Set<number>();
      for (const sl of allRows) {
        const producto = sl.products as Record<string, unknown> | null;
        if (!producto) continue;
        const parentId = producto.parent_product_id as number | null;
        if (parentId && !parentIds.has(parentId)) {
          parentIds.add(parentId);
        }
      }

      const padresMap = new Map<number, { sku: string; name: string }>();
      if (parentIds.size > 0) {
        const { data: padresData } = await supabase
          .from('products')
          .select('id, sku, name')
          .in('id', Array.from(parentIds));
        for (const p of padresData ?? []) {
          padresMap.set(p.id, { sku: p.sku, name: p.name });
        }
      }

      // Agrupar por producto (o por padre si es variante)
      const porProducto = new Map<number, {
        sku: string;
        nombre: string;
        categoria: string;
        sucursalesStock: string[];
        sucursalesAgotadas: string[];
        stockTotal: number;
        minLevel: number;
        costo: number;
      }>();

      for (const sl of allRows) {
        const producto = sl.products as Record<string, unknown> | null;
        if (!producto) continue;
        const pid = Number(producto.id);
        const parentId = producto.parent_product_id as number | null;
        // Si es variante, agrupar bajo el padre; si no, usar el propio id
        const grupoId = parentId ?? pid;
        const stockActual = Number(sl.qty_on_hand ?? 0);
        const minimo = Number(sl.min_level ?? 0);
        const avgCost = Number(sl.avg_cost ?? 0);
        const costo = getEffectiveCost(avgCost, sl.product_costs as ProductCostRef[] | null);
        const sucursal = sl.branches as Record<string, unknown> | null;
        const categoria = producto.categories as Record<string, unknown> | null;
        const sucursalName = sucursal?.name ? String(sucursal.name) : '—';
        const padre = parentId ? padresMap.get(parentId) : null;
        const nombreProducto = padre
          ? `${padre.name} > ${String(producto.name ?? '—')}`
          : String(producto.name ?? '—');
        const skuProducto = padre
          ? String(padre.sku ?? '—')
          : String(producto.sku ?? '—');
        const existente = porProducto.get(grupoId);
        if (existente) {
          existente.stockTotal += stockActual;
          existente.minLevel = Math.max(existente.minLevel, minimo);
          if (stockActual > 0) {
            if (!existente.sucursalesStock.includes(sucursalName)) {
              existente.sucursalesStock.push(sucursalName);
            }
          } else {
            if (!existente.sucursalesAgotadas.includes(sucursalName)) {
              existente.sucursalesAgotadas.push(sucursalName);
            }
          }
        } else {
          porProducto.set(grupoId, {
            sku: skuProducto,
            nombre: nombreProducto,
            categoria: String(categoria?.name ?? 'Sin categoría'),
            sucursalesStock: stockActual > 0 ? [sucursalName] : [],
            sucursalesAgotadas: stockActual <= 0 ? [sucursalName] : [],
            stockTotal: stockActual,
            minLevel: minimo,
            costo,
          });
        }
      }

      const filas = Array.from(porProducto.values())
        .filter((p) => p.sucursalesAgotadas.length > 0 || (p.minLevel > 0 && p.stockTotal <= p.minLevel))
        .map((p) => {
          const faltante = Math.max(0, p.minLevel - p.stockTotal);
          const valorFaltante = faltante * p.costo;
          const estado = p.stockTotal === 0 ? 'Agotado' : (p.minLevel > 0 && p.stockTotal <= p.minLevel ? 'Bajo mínimo' : 'Sin stock en sucursal');
          const sucursalesDetalle = [
            ...p.sucursalesStock.map((s) => `${s} (✓)`),
            ...p.sucursalesAgotadas.map((s) => `${s} (0)`),
          ].join(', ') || '—';
          return {
            sku: p.sku,
            nombre: p.nombre,
            categoria: p.categoria,
            sucursales: sucursalesDetalle,
            stock_actual: p.stockTotal,
            stock_minimo: p.minLevel,
            faltante,
            valor_faltante: valorFaltante,
            estado,
          };
        })
        .sort((a, b) => b.faltante - a.faltante || a.nombre.localeCompare(b.nombre));

      const totalCriticos = filas.length;
      const agotados = filas.filter((f) => f.estado === 'Agotado').length;
      const sinStockSucursal = filas.filter((f) => f.estado === 'Sin stock en sucursal').length;
      const bajoMinimo = filas.filter((f) => f.estado === 'Bajo mínimo').length;
      const valorFaltanteTotal = filas.reduce((s, f) => s + Number(f.valor_faltante ?? 0), 0);

      // Total de productos con stock trackeado (para contexto global)
      const totalProductosTrackeado = (data ?? []).length;

      return buildReportData(
        'stock-critico', 'Stock Crítico', 'inventory', periodo,
        [
          { titulo: 'Total Productos', valor: totalProductosTrackeado, formato: 'numero' },
          { titulo: 'Productos Críticos', valor: totalCriticos, formato: 'numero' },
          { titulo: 'Agotados', valor: agotados, formato: 'numero' },
          { titulo: 'Sin stock en sucursal', valor: sinStockSucursal, formato: 'numero' },
          { titulo: 'Bajo Mínimo', valor: bajoMinimo, formato: 'numero' },
          { titulo: 'Valor Faltante', valor: valorFaltanteTotal, formato: 'moneda' },
        ],
        [
          { key: 'sku', titulo: 'SKU', tipo: 'texto' },
          { key: 'nombre', titulo: 'Producto', tipo: 'texto' },
          { key: 'categoria', titulo: 'Categoría', tipo: 'texto' },
          { key: 'sucursales', titulo: 'Sucursales', tipo: 'texto' },
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
          { key: 'stock_actual', titulo: 'Stock Total', tipo: 'numero', alinear: 'right' },
          { key: 'stock_minimo', titulo: 'Mínimo', tipo: 'numero', alinear: 'right' },
          { key: 'faltante', titulo: 'Faltante', tipo: 'numero', alinear: 'right' },
          { key: 'valor_faltante', titulo: 'Valor Faltante', tipo: 'moneda', alinear: 'right' },
        ],
        filas,
        { stock_actual: filas.reduce((s, f) => s + Number(f.stock_actual ?? 0), 0),
          faltante: filas.reduce((s, f) => s + Number(f.faltante ?? 0), 0),
          valor_faltante: valorFaltanteTotal },
      );
    },
  },
  {
    id: 'movimientos-inventario',
    modulo: 'inventory',
    titulo: 'Movimientos de Inventario',
    descripcion: 'Entradas, salidas y ajustes del período',
    categoria: 'operativo',
    periodosSugeridos: ['diario', 'semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { start, end } = await getOrgDateRange(orgId, periodo.fechaInicio, periodo.fechaFin);
      const { data, error } = await supabase.rpc('fn_reporte_movimientos_inventario', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
      });
      if (error) throw error;

      const d = data ?? {};
      const detalle: Record<string, unknown>[] = d.detalle ?? [];

      const productoIds = detalle
        .map((m) => String(m.producto_id ?? ''))
        .filter(Boolean);

      let productosMap: Record<string, { nombre: string; sku: string }> = {};
      if (productoIds.length) {
        const { data: productos } = await supabase
          .from('products')
          .select('id, name, sku')
          .in('id', [...new Set(productoIds)]);

        (productos ?? []).forEach((p: Record<string, unknown>) => {
          productosMap[String(p.id)] = { nombre: String(p.name ?? '—'), sku: String(p.sku ?? '—') };
        });
      }

      const dirLabel: Record<string, string> = { in: 'Entrada', out: 'Salida', adjustment: 'Ajuste' };
      const sourceLabel: Record<string, string> = {
        sale: 'Venta POS',
        invoice_sale: 'Factura',
        folio_item: 'Folio',
        room_consumption: 'Consumo Habitación',
        mesa_sale: 'Venta Mesa',
        purchase: 'Compra',
        transfer: 'Transferencia',
        adjustment: 'Ajuste',
        initial: 'Stock Inicial',
      };

      const filas = detalle.map((m) => {
        const prod = productosMap[String(m.producto_id ?? '')] ?? { nombre: '—', sku: '—' };
        const cantidad = Number(m.cantidad ?? 0);
        const costo = Number(m.costo_unitario ?? 0);
        return {
          fecha: m.fecha,
          producto: prod.nombre,
          sku: prod.sku,
          direccion: dirLabel[String(m.direccion ?? '')] ?? String(m.direccion ?? '—'),
          fuente: sourceLabel[String(m.fuente ?? '')] ?? String(m.fuente ?? '—'),
          cantidad,
          costo_unitario: costo,
          valor_total: cantidad * costo,
          nota: m.nota ?? '',
        };
      });

      const totalMovimientos = filas.length;
      const valorTotal = filas.reduce((s, f) => s + Number(f.valor_total ?? 0), 0);

      return buildReportData(
        'movimientos-inventario', 'Movimientos de Inventario', 'inventory', periodo,
        [
          { titulo: 'Total Entradas', valor: d.total_entradas ?? 0, formato: 'numero' },
          { titulo: 'Total Salidas', valor: d.total_salidas ?? 0, formato: 'numero' },
          { titulo: 'N° Movimientos', valor: totalMovimientos, formato: 'numero' },
          { titulo: 'Valor Total', valor: valorTotal, formato: 'moneda' },
        ],
        [
          { key: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
          { key: 'producto', titulo: 'Producto', tipo: 'texto' },
          { key: 'sku', titulo: 'SKU', tipo: 'texto' },
          { key: 'direccion', titulo: 'Tipo', tipo: 'texto' },
          { key: 'fuente', titulo: 'Origen', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
          { key: 'costo_unitario', titulo: 'Costo Unit.', tipo: 'moneda', alinear: 'right' },
          { key: 'valor_total', titulo: 'Valor Total', tipo: 'moneda', alinear: 'right' },
        ],
        filas,
        { cantidad: filas.reduce((s, f) => s + Number(f.cantidad ?? 0), 0),
          valor_total: valorTotal },
      );
    },
  },
  {
    id: 'rotacion-inventario',
    modulo: 'inventory',
    titulo: 'Rotación de Inventario',
    descripcion: 'Top vendidos, dead stock y días promedio de inventario',
    categoria: 'operativo',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { start, end } = await getOrgDateRange(orgId, periodo.fechaInicio, periodo.fechaFin);
      const { data, error } = await supabase.rpc('fn_reporte_rotacion_inventario', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'rotacion-inventario', 'Rotación de Inventario', 'inventory', periodo,
        [
          { titulo: 'Total Vendido', valor: d.total_vendido ?? 0, formato: 'moneda' },
          { titulo: 'Productos Vendidos', valor: d.num_productos_vendidos ?? 0, formato: 'numero' },
        ],
        [
          { key: 'nombre', titulo: 'Producto', tipo: 'texto' },
          { key: 'sku', titulo: 'SKU', tipo: 'texto' },
          { key: 'cantidad_vendida', titulo: 'Cant. Vendida', tipo: 'numero', alinear: 'right' },
          { key: 'total_ventas', titulo: 'Total Ventas', tipo: 'moneda', alinear: 'right' },
        ],
        d.top_vendidos ?? [],
      );
    },
  },
  {
    id: 'rentabilidad-producto-inv',
    modulo: 'inventory',
    titulo: 'Rentabilidad por Producto',
    descripcion: 'Margen de ganancia por producto',
    categoria: 'comercial',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { start, end } = await getOrgDateRange(orgId, periodo.fechaInicio, periodo.fechaFin);
      const { data: ventas, error: errVentas } = await supabase
        .from('sales')
        .select('id')
        .eq('organization_id', orgId)
        .gte('sale_date', start)
        .lte('sale_date', end)
        .not('status', 'in', '("cancelled","void")');

      if (errVentas) throw errVentas;

      const saleIds = (ventas ?? []).map((v: Record<string, unknown>) => v.id);
      if (!saleIds.length) {
        return buildReportData(
          'rentabilidad-producto-inv', 'Rentabilidad por Producto', 'inventory', periodo,
          [
            { titulo: 'Total Ingresos', valor: 0, formato: 'moneda' },
            { titulo: 'Productos', valor: 0, formato: 'numero' },
          ],
          [
            { key: 'nombre', titulo: 'Producto', tipo: 'texto' },
            { key: 'sku', titulo: 'SKU', tipo: 'texto' },
            { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
            { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
          ],
          [],
        );
      }

      const { data, error } = await supabase
        .from('sale_items')
        .select('product_id, quantity, unit_price, total, discount_amount, products(name, sku)')
        .in('sale_id', saleIds)
        .order('total', { ascending: false })
        .limit(50);

      if (error) throw error;

      const items = (data ?? []).map((item: Record<string, unknown>) => {
        const products = item.products as Record<string, unknown> | null;
        return {
          nombre: products?.name ?? '—',
          sku: products?.sku ?? '—',
          cantidad: item.quantity,
          precio_unitario: item.unit_price,
          total: item.total,
          descuento: item.discount_amount ?? 0,
        };
      });

      return buildReportData(
        'rentabilidad-producto-inv', 'Rentabilidad por Producto', 'inventory', periodo,
        [
          { titulo: 'Total Ingresos', valor: items.reduce((s: number, i: Record<string, unknown>) => s + Number(i.total ?? 0), 0), formato: 'moneda' },
          { titulo: 'Productos', valor: items.length, formato: 'numero' },
        ],
        [
          { key: 'nombre', titulo: 'Producto', tipo: 'texto' },
          { key: 'sku', titulo: 'SKU', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
          { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
        ],
        items,
        { total: items.reduce((s: number, i: Record<string, unknown>) => s + Number(i.total ?? 0), 0) },
      );
    },
  },
];
