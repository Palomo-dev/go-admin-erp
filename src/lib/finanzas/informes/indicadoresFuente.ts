import { calcularBasesActividad, type FacturaActividad, type LineaCompraActividad, type MovimientoActividad } from './basesActividad';
import { calcularContribucionDirecta, type FacturaContribucion, type LineaContribucion, type ProductoActividad, type StockContribucion } from './contribucionProductos';
import type { ResultadoPeriodo } from './estados';
import { generarIndicadores, type CuentaIndicador } from './indicadores';

/** Reutiliza las colecciones del cargador; no ejecuta consultas independientes. */
export interface FuenteActividadIndicadores {
  cuentas: CuentaIndicador[];
  movimientos: MovimientoActividad[];
  productos: ProductoActividad[];
  stock?: StockContribucion[];
  stockCompleto?: boolean;
  advertenciasStock?: string[];
  actividad?: {
    ventas: FacturaContribucion[];
    originalesVentas?: FacturaActividad[];
    compras: FacturaActividad[];
    lineasVenta: LineaContribucion[];
    lineasCompra?: LineaCompraActividad[];
  };
}

export function generarIndicadoresDesdeFuente({ estados, fuente, organizationId, costCenterId, productId, monedaBase }: {
  estados: { actual: ResultadoPeriodo; anterior: ResultadoPeriodo };
  fuente: FuenteActividadIndicadores;
  organizationId: number;
  costCenterId?: string | null;
  productId?: number | null;
  monedaBase: string | null;
}) {
  const preliminar = generarIndicadores({ cuentas: fuente.cuentas, actual: estados.actual.baseIndicadores, anterior: estados.anterior.baseIndicadores });
  const completar = (periodo: ResultadoPeriodo, costoVariableTotal: number) => {
    const actividad = fuente.actividad;
    const base = actividad ? calcularBasesActividad({
      organizationId, desde: periodo.desde, hasta: periodo.hasta,
      movimientos: fuente.movimientos, ventas: actividad.ventas,
      originalesVentas: actividad.originalesVentas, compras: actividad.compras,
      lineasCompra: actividad.lineasCompra, centroCosto: costCenterId, monedaBase,
    }) : null;
    const contribucion = actividad && fuente.stock && fuente.stockCompleto !== false ? calcularContribucionDirecta({
      organizationId, desde: periodo.desde, hasta: periodo.hasta,
      movimientos: fuente.movimientos, ventas: actividad.ventas, lineas: actividad.lineasVenta,
      stock: fuente.stock, productos: fuente.productos,
      centroCosto: costCenterId, costoVariableTotal, monedaBase,
    }) : null;
    const productos = contribucion?.productos.filter((p) => !productId || p.id === String(productId));
    const ventasIdentificadas = contribucion?.productos.reduce((total, p) => total + p.ventas, 0);
    const ventasCompletas = ventasIdentificadas != null && Math.abs(ventasIdentificadas - periodo.ventasNetas) <= 0.5;
    return {
      base: {
        ...periodo.baseIndicadores,
        ...(base ? { basesActividad: { ...base.basesActividad,
          unidadesVendidas: contribucion?.unidadesVendidas,
          unidadesHomogeneas: contribucion?.unidadesHomogeneas === true && ventasCompletas } } : {}),
        ...(productos ? { productos } : {}),
      },
      contribucion,
      advertencias: [...(base?.advertencias ?? []), ...(contribucion?.advertencias ?? []), ...(fuente.stockCompleto === false ? fuente.advertenciasStock ?? ['No hay inventario histórico completo verificable; no se calcula contribución por producto.'] : [])],
    };
  };
  const actual = completar(estados.actual, preliminar.equilibrio.actual.costosVariables);
  const anterior = completar(estados.anterior, preliminar.equilibrio.anterior.costosVariables);
  const resultado = generarIndicadores({ cuentas: fuente.cuentas, actual: actual.base, anterior: anterior.base });
  const avisos = [...actual.advertencias, ...anterior.advertencias];
  for (const [clave, periodo] of [['actual', actual], ['anterior', anterior]] as const) {
    const equilibrio = resultado.equilibrio[clave];
    if (!periodo.contribucion || Math.abs(periodo.contribucion.costoVariableNoDistribuido) > 0.5) {
      equilibrio.unidades = null;
      equilibrio.motivoUnidades = 'No se calcula equilibrio en unidades mientras existan costos variables sin distribuir o no haya costos históricos verificables.';
      continue;
    }
    if (!productId) continue;
    const producto = periodo.base.productos?.find((p) => p.id === String(productId));
    if (!producto || producto.unidades <= 0 || producto.ventas <= producto.costoVariable || equilibrio.motivo) {
      equilibrio.unidades = null;
      equilibrio.motivoUnidades = 'El producto seleccionado requiere ventas, unidades y contribución directa positiva verificables.';
      continue;
    }
    equilibrio.unidades = Math.ceil(equilibrio.costosFijos / ((producto.ventas - producto.costoVariable) / producto.unidades));
    if (!Number.isFinite(equilibrio.unidades)) {
      equilibrio.unidades = null;
      equilibrio.motivoUnidades = 'El resultado de unidades supera el rango numérico admitido.';
      continue;
    }
    equilibrio.motivoUnidades = null;
    avisos.push('Las unidades del producto seleccionado cubren los costos fijos de toda la organización con su contribución directa. El equilibrio en pesos conserva la mezcla de ventas de la organización.');
  }
  return {
    ...resultado,
    costoVariableNoDistribuido: {
      actual: actual.contribucion?.costoVariableNoDistribuido ?? null,
      anterior: anterior.contribucion?.costoVariableNoDistribuido ?? null,
    },
    advertencias: [...new Set([...resultado.advertencias, ...avisos])],
  };
}
