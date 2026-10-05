// ============================================================
// Reportes de Inventario
// Llama a las RPCs: fn_reporte_stock_critico_detalle, fn_reporte_movimientos_inventario, fn_reporte_rotacion_inventario,
// fn_reporte_rentabilidad_producto, fn_reporte_movimiento_valorizado
// ============================================================

import { supabase as browserSupabase } from '@/lib/supabase/config';
import type { ReportesClient } from '../types';
// F0-SEC r3 (tester r2, fallo 3): `fetch` acepta el cliente de Supabase por
// parámetro. En el navegador (app/reportes) cae al cliente browser con la sesión
// del usuario; en el servidor (asistente de reportes) el route handler pasa el
// cliente de sesión de `getServerOrgContext()`, así que las RPC `fn_reporte_*`
// corren como `authenticated` miembro y nunca como `anon`.
import { normalizeBranchParam } from '@/lib/services/branchFilterHelper';
import type { DefinicionModulo, ReportData, PeriodoCierre } from '../types';
import { rangoDelPeriodo } from '../rangoPeriodo';
import { vistaRentabilidadProducto } from './rentabilidadProducto';

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

/** Fila crítica tal como la devuelve `fn_reporte_stock_critico_detalle`. */
export interface FilaStockCritico {
  producto_id: number;
  padre_id: number | null;
  sku: string | null;
  nombre: string | null;
  categoria: string | null;
  sucursal: string | null;
  stock: number | string | null;
  minimo: number | string | null;
  /** Costo efectivo: avg_cost si es > 0; si no, el costo vigente más reciente de product_costs. */
  costo: number | string | null;
  padre_sku: string | null;
  padre_nombre: string | null;
}

export interface FilaStockCriticoAgrupada extends Record<string, unknown> {
  sku: string;
  nombre: string;
  categoria: string;
  sucursales: string;
  stock_actual: number;
  stock_minimo: number;
  faltante: number;
  valor_faltante: number;
  estado: 'Agotado' | 'Bajo mínimo' | 'Sin stock en sucursal';
}

/**
 * Agrupa las filas críticas por producto (o por su padre, si es variante) y
 * calcula faltante, valor y estado. La base ya filtró las críticas
 * (existencia <= 0, o mínimo > 0 y existencia <= mínimo) y resolvió el costo.
 */
export function agruparStockCritico(filas: readonly FilaStockCritico[]): FilaStockCriticoAgrupada[] {
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

  for (const f of filas) {
    const pid = Number(f.producto_id);
    const parentId = f.padre_id ?? null;
    // Si es variante, agrupar bajo el padre; si no, usar el propio id
    const grupoId = parentId ?? pid;
    const stockActual = Number(f.stock ?? 0);
    const minimo = Number(f.minimo ?? 0);
    const costo = Number(f.costo ?? 0) || 0;
    const sucursalName = f.sucursal ? String(f.sucursal) : '—';
    const tienePadre = parentId !== null && f.padre_nombre !== null && f.padre_nombre !== undefined;
    const nombreProducto = tienePadre ? `${f.padre_nombre} > ${String(f.nombre ?? '—')}` : String(f.nombre ?? '—');
    const skuProducto = tienePadre ? String(f.padre_sku ?? '—') : String(f.sku ?? '—');
    const existente = porProducto.get(grupoId);
    if (existente) {
      existente.stockTotal += stockActual;
      existente.minLevel = Math.max(existente.minLevel, minimo);
      if (stockActual > 0) {
        if (!existente.sucursalesStock.includes(sucursalName)) existente.sucursalesStock.push(sucursalName);
      } else if (!existente.sucursalesAgotadas.includes(sucursalName)) {
        existente.sucursalesAgotadas.push(sucursalName);
      }
    } else {
      porProducto.set(grupoId, {
        sku: skuProducto,
        nombre: nombreProducto,
        categoria: String(f.categoria ?? 'Sin categoría'),
        sucursalesStock: stockActual > 0 ? [sucursalName] : [],
        sucursalesAgotadas: stockActual <= 0 ? [sucursalName] : [],
        stockTotal: stockActual,
        minLevel: minimo,
        costo,
      });
    }
  }

  return Array.from(porProducto.values())
    .filter((p) => p.sucursalesAgotadas.length > 0 || (p.minLevel > 0 && p.stockTotal <= p.minLevel))
    .map((p): FilaStockCriticoAgrupada => {
      const faltante = Math.max(0, p.minLevel - p.stockTotal);
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
        valor_faltante: faltante * p.costo,
        estado,
      };
    })
    .sort((a, b) => b.faltante - a.faltante || a.nombre.localeCompare(b.nombre));
}

export const inventarioReports: DefinicionModulo[] = [
  {
    id: 'stock-critico',
    modulo: 'inventory',
    titulo: 'Stock crítico',
    descripcion: 'Productos bajo el mínimo por sucursal · existencias al momento',
    categoria: 'operativo',
    alcance: 'sucursal',
    periodosSugeridos: ['diario'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      // Las críticas, su costo efectivo y el total se calculan en la base
      // (20261005121435 y 20261005122924): antes se bajaban todas las existencias de la
      // organización con sus costos incrustados para descartarlas aquí.
      const { data, error } = await db.rpc('fn_reporte_stock_critico_detalle', {
        p_organization_id: orgId,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;

      const d = (data ?? {}) as { total?: number | string | null; filas?: FilaStockCritico[] | null };
      const filas = agruparStockCritico(Array.isArray(d.filas) ? d.filas : []);

      const totalCriticos = filas.length;
      const agotados = filas.filter((f) => f.estado === 'Agotado').length;
      const sinStockSucursal = filas.filter((f) => f.estado === 'Sin stock en sucursal').length;
      const bajoMinimo = filas.filter((f) => f.estado === 'Bajo mínimo').length;
      const valorFaltanteTotal = filas.reduce((s, f) => s + Number(f.valor_faltante ?? 0), 0);

      // Total de existencias con stock trackeado (para contexto global)
      const totalProductosTrackeado = Number(d.total ?? 0) || 0;

      return buildReportData(
        'stock-critico', 'Stock crítico', 'inventory', periodo,
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
    titulo: 'Movimientos de inventario',
    descripcion: 'Entradas, salidas y ajustes del periodo',
    categoria: 'operativo',
    alcance: 'sucursal',
    periodosSugeridos: ['diario', 'semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_movimientos_inventario', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;

      const d = data ?? {};
      const detalle: Record<string, unknown>[] = d.detalle ?? [];

      const productoIds = detalle
        .map((m) => String(m.producto_id ?? ''))
        .filter(Boolean);

      const productosMap: Record<string, { nombre: string; sku: string }> = {};
      if (productoIds.length) {
        const { data: productos } = await db
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
        'movimientos-inventario', 'Movimientos de inventario', 'inventory', periodo,
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
    titulo: 'Rotación de inventario',
    descripcion: 'Productos más vendidos, sin movimiento y días de inventario',
    categoria: 'operativo',
    alcance: 'sucursal',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_rotacion_inventario', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'rotacion-inventario', 'Rotación de inventario', 'inventory', periodo,
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
    titulo: 'Rentabilidad por producto (inventario)',
    descripcion: 'Margen por producto y categoría con el costo real de las salidas de inventario',
    categoria: 'comercial',
    alcance: 'sucursal',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_rentabilidad_producto', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;

      const v = vistaRentabilidadProducto(data);
      return {
        ...buildReportData('rentabilidad-producto-inv', 'Rentabilidad por producto (inventario)', 'inventory', periodo, v.kpis, v.columnas, v.filas, v.totales),
        vistaPrincipal: 'Por producto',
        vistas: v.vistas,
        lectura: v.lectura,
      };
    },
  },
  {
    id: 'movimiento-valorizado',
    modulo: 'inventory',
    titulo: 'Movimiento de inventario valorizado',
    descripcion: 'Existencia inicial, entradas, salidas y existencia final de cada producto, en cantidad y al costo',
    categoria: 'operativo',
    alcance: 'sucursal',
    periodosSugeridos: ['mensual', 'trimestral', 'anual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_movimiento_valorizado', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
        p_branch_id: normalizeBranchParam(branchId),
      });
      if (error) throw error;

      const d = (data ?? {}) as Record<string, unknown>;
      const t = (d.totales ?? {}) as Record<string, unknown>;
      const n = (v: unknown) => Number(v ?? 0) || 0;
      const productos = (Array.isArray(d.productos) ? d.productos : []) as Array<Record<string, unknown>>;
      const sinCosto = n(t.movimientos_sin_costo);
      const negativos = productos.filter((p) => n(p.cant_final) < 0).length;

      const lectura: ReportData['lectura'] = [];
      if (sinCosto > 0) {
        lectura.push({ tono: 'aviso', texto: `${sinCosto} movimientos del periodo no tienen costo unitario: su valor cuenta como cero.`, href: '/app/inventario/movimientos', etiquetaAccion: 'Ver movimientos' });
      }
      if (negativos > 0) {
        lectura.push({ tono: 'alerta', texto: `${negativos} productos terminan el periodo con existencia negativa.`, href: '/app/inventario/kardex', etiquetaAccion: 'Ver kárdex' });
      }
      if (d.truncado) {
        lectura.push({ tono: 'aviso', texto: 'La tabla muestra los 2.000 productos de mayor valor; los totales cubren todos.' });
      }

      return {
        ...buildReportData(
          'movimiento-valorizado', 'Movimiento de inventario valorizado', 'inventory', periodo,
          [
            { titulo: 'Valor inicial', valor: n(t.valor_inicial), formato: 'moneda' },
            { titulo: 'Entradas', valor: n(t.valor_entradas), formato: 'moneda' },
            { titulo: 'Salidas', valor: n(t.valor_salidas), formato: 'moneda' },
            { titulo: 'Valor final', valor: n(t.valor_final), formato: 'moneda' },
            { titulo: 'Productos', valor: n(t.productos), formato: 'numero' },
          ],
          [
            { key: 'nombre', titulo: 'Producto', tipo: 'texto' },
            { key: 'sku', titulo: 'SKU', tipo: 'texto' },
            { key: 'cant_inicial', titulo: 'Inicial', tipo: 'numero', alinear: 'right' },
            { key: 'valor_inicial', titulo: 'Valor inicial', tipo: 'moneda', alinear: 'right' },
            { key: 'cant_entradas', titulo: 'Entradas', tipo: 'numero', alinear: 'right' },
            { key: 'valor_entradas', titulo: 'Valor entradas', tipo: 'moneda', alinear: 'right' },
            { key: 'cant_salidas', titulo: 'Salidas', tipo: 'numero', alinear: 'right' },
            { key: 'valor_salidas', titulo: 'Valor salidas', tipo: 'moneda', alinear: 'right' },
            { key: 'cant_final', titulo: 'Final', tipo: 'numero', alinear: 'right' },
            { key: 'valor_final', titulo: 'Valor final', tipo: 'moneda', alinear: 'right' },
          ],
          productos.map((p) => ({
            nombre: p.sin_costo ? `${p.nombre} (sin costo)` : p.nombre,
            sku: p.sku ?? '',
            cant_inicial: n(p.cant_inicial),
            valor_inicial: n(p.valor_inicial),
            cant_entradas: n(p.cant_entradas),
            valor_entradas: n(p.valor_entradas),
            cant_salidas: n(p.cant_salidas),
            valor_salidas: n(p.valor_salidas),
            cant_final: n(p.cant_final),
            valor_final: n(p.valor_final),
          })),
          {
            valor_inicial: n(t.valor_inicial),
            valor_entradas: n(t.valor_entradas),
            valor_salidas: n(t.valor_salidas),
            valor_final: n(t.valor_final),
          },
        ),
        lectura,
      };
    },
  },
];
