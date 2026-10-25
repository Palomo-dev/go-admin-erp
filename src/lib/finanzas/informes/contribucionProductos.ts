import type { FacturaActividad, MovimientoActividad } from './basesActividad';
import type { ProductoContribucion } from './indicadores';
import { movimientosContabilizados } from './estados';
import { normalizarCodigoMoneda } from '@/lib/utils/moneda';

export interface FacturaContribucion extends FacturaActividad { sale_id?: string | null }
export interface LineaContribucion {
  invoice_sales_id: string | null;
  product_id: number | null;
  qty: number | string | null;
  total_line: number | string | null;
  tax_rate: number | string | null;
  cost_center_id?: string | null;
}
export interface StockContribucion {
  product_id: number;
  source: string | null;
  source_id: string | number | null;
  direction: string;
  qty: number | string;
  unit_cost: number | string | null;
}
export interface ProductoActividad { id: number; name: string; linea?: string | null }
export interface EntradaContribucion {
  organizationId: number;
  desde: string;
  hasta: string;
  movimientos: MovimientoActividad[];
  ventas: FacturaContribucion[];
  lineas: LineaContribucion[];
  stock: StockContribucion[];
  productos: ProductoActividad[];
  centroCosto?: string | null;
  monedaBase: string | null;
  /** Clase 6 completa más los demás gastos marcados variables del período. */
  costoVariableTotal: number;
}

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Margen directo identificado: conserva el costo de la salida de inventario,
 * sin usar product_costs vigente ni repartir gastos comunes entre productos.
 * La misma salida no puede asignarse a dos facturas de una misma venta.
 */
export function calcularContribucionDirecta(entrada: EntradaContribucion): {
  productos: ProductoContribucion[];
  advertencias: string[];
  costoVariableNoDistribuido: number;
  unidadesVendidas?: number;
  unidadesHomogeneas: boolean;
} {
  const advertencias = new Set<string>();
  const monedaBase = normalizarCodigoMoneda(entrada.monedaBase);
  if (!monedaBase) return {
    productos: [], costoVariableNoDistribuido: entrada.costoVariableTotal, unidadesHomogeneas: false,
    advertencias: ['La moneda base no está verificada; no se mezcla el precio del producto con un costo histórico sin moneda confirmada.'],
  };
  const entradas = (movimientosContabilizados(entrada.movimientos, entrada.hasta) as MovimientoActividad[]).filter((m) => m.source === 'invoice_sales'
    && m.entry_date >= entrada.desde && m.entry_date <= entrada.hasta && m.account_code.startsWith('41'));
  const idsFacturas = new Set(entradas.map((m) => m.source_id).filter((id): id is string => !!id));
  const facturas = entrada.ventas.filter((f) => f.organization_id === entrada.organizationId
    && idsFacturas.has(f.id) && (['issued', 'paid', 'partial'].includes(f.status)
      || f.status === 'void' && entradas.some((m) => m.source_id === f.id && m.anulado_desde && m.anulado_desde > entrada.hasta)));
  const productos = new Map(entrada.productos.map((p) => [p.id, p]));
  const porProducto = new Map<number, ProductoContribucion>();
  const incompletos = new Set<number>();
  const facturasPorVenta = new Map<string, number>();
  facturas.filter((f) => f.sale_id && f.document_type !== 'credit_note').forEach((f) => {
    facturasPorVenta.set(f.sale_id!, (facturasPorVenta.get(f.sale_id!) ?? 0) + 1);
  });
  for (const factura of facturas) {
    if (normalizarCodigoMoneda(factura.currency) !== monedaBase) {
      entrada.lineas.filter((l) => l.invoice_sales_id === factura.id && l.product_id != null).forEach((l) => incompletos.add(l.product_id!));
      advertencias.add('Hay ventas en otra moneda o sin moneda confirmada, sin conversión histórica verificable por producto; no se mezclaron sus precios con costos en moneda base.');
      continue;
    }
    const esDevolucion = factura.document_type === 'credit_note';
    const signo = esDevolucion ? -1 : 1;
    const lineas = entrada.lineas.filter((l) => l.invoice_sales_id === factura.id
      && (!entrada.centroCosto || l.cost_center_id === entrada.centroCosto));
    if (entrada.centroCosto && entrada.lineas.some((l) => l.invoice_sales_id === factura.id && !l.cost_center_id)) {
      advertencias.add('Hay líneas de venta sin centro de costo; su contribución no se atribuyó a un centro por suposición.');
    }
    const grupos = new Map<number, { cantidad: number; ventas: number; valido: boolean }>();
    for (const linea of lineas) {
      if (linea.product_id == null) { advertencias.add('Hay ventas sin producto identificado; no se distribuyeron entre los demás productos.'); continue; }
      const g = grupos.get(linea.product_id) ?? { cantidad: 0, ventas: 0, valido: true };
      const cantidad = numero(linea.qty);
      const bruto = numero(linea.total_line);
      const tarifa = numero(linea.tax_rate);
      if (cantidad === null || bruto === null || tarifa === null || tarifa < 0) g.valido = false;
      else { g.cantidad += Math.abs(cantidad); g.ventas += Math.abs(bruto) / (1 + tarifa / 100); }
      grupos.set(linea.product_id, g);
    }
    for (const [productId, grupo] of grupos) {
      const metadatos = productos.get(productId);
      const stocks = entrada.stock.filter((s) => s.product_id === productId && (
        esDevolucion
          ? s.direction === 'in' && ['credit_note', 'return'].includes(s.source ?? '') && String(s.source_id) === factura.id
          : s.direction === 'out' && (
            s.source === 'invoice_sale' && (String(s.source_id) === factura.id || factura.sale_id && String(s.source_id) === factura.sale_id)
            || ['sale', 'web_sale', 'mesa_sale'].includes(s.source ?? '') && factura.sale_id && String(s.source_id) === factura.sale_id
          )
      ));
      const duplicada = factura.sale_id && (facturasPorVenta.get(factura.sale_id) ?? 0) > 1
        && stocks.some((s) => String(s.source_id) !== factura.id);
      let cantidadStock = 0;
      let costo = 0;
      let costoValido = stocks.length > 0;
      for (const stock of stocks) {
        const cantidad = numero(stock.qty);
        const unitario = numero(stock.unit_cost);
        if (cantidad === null || cantidad < 0 || unitario === null || unitario < 0) costoValido = false;
        else { cantidadStock += cantidad; costo += cantidad * unitario; }
      }
      if (!metadatos || !grupo.valido || !costoValido || duplicada || Math.abs(cantidadStock - grupo.cantidad) > 0.000001) {
        incompletos.add(productId);
        continue;
      }
      const fila = porProducto.get(productId) ?? {
        id: String(productId), nombre: metadatos.name, linea: metadatos.linea,
        ventas: 0, costoVariable: 0, unidades: 0,
      };
      fila.ventas += signo * grupo.ventas;
      fila.costoVariable += signo * costo;
      fila.unidades += signo * grupo.cantidad;
      if (![fila.ventas, fila.costoVariable, fila.unidades].every(Number.isFinite)) throw new Error('La contribución contiene un agregado no finito.');
      porProducto.set(productId, fila);
    }
  }
  for (const productId of incompletos) {
    porProducto.delete(productId);
    advertencias.add(`Producto ${productId}: no hay una salida o devolución de inventario con cantidad y costo histórico verificables para todas sus ventas del período.`);
  }
  const filas = [...porProducto.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const costoDistribuido = filas.reduce((total, p) => total + p.costoVariable, 0);
  const costoVariableNoDistribuido = entrada.costoVariableTotal - costoDistribuido;
  if (!Number.isFinite(costoVariableNoDistribuido)) throw new Error('La contribución contiene un costo variable no finito.');
  if (Math.abs(costoVariableNoDistribuido) > 0.5) advertencias.add('Se presenta contribución directa identificada. Hay costos de clase 6 u otros gastos variables sin distribuir o diferencias con el costo histórico de inventario; no se repartieron arbitrariamente.');
  if (!filas.length && idsFacturas.size > 0) advertencias.add('No hay productos con ventas y costos históricos completamente vinculados para estos filtros.');
  const unidadesHomogeneas = filas.length === 1 && incompletos.size === 0;
  return {
    productos: filas, advertencias: [...advertencias], costoVariableNoDistribuido,
    unidadesVendidas: unidadesHomogeneas ? filas[0].unidades : undefined, unidadesHomogeneas,
  };
}
