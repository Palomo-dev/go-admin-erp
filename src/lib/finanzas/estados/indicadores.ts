/**
 * Indicadores financieros. Las cifras base salen de
 * `fn_indicadores_financieros_base`; una razón sin denominador es «sin dato»,
 * nunca cero. Porta las fórmulas del PR 460 con las columnas del Figma.
 */
import type { BaseIndicadores } from './tipos';

export type ClaveIndicador =
  | 'razon_corriente'
  | 'endeudamiento'
  | 'margen_neto'
  | 'ciclo_caja'
  | 'rotacion_cartera'
  | 'dias_inventario'
  | 'dias_proveedores'
  | 'margen_operacional'
  | 'roe'
  | 'roa';

export type UnidadIndicador = 'razon' | 'porcentaje' | 'dias' | 'veces';

export interface ValorIndicador {
  clave: ClaveIndicador;
  unidad: UnidadIndicador;
  valor: number | null;
}

const promedio = (a: number, b: number) => (a + b) / 2;

function dividir(numerador: number, denominador: number, factor = 1): number | null {
  if (!Number.isFinite(numerador) || !Number.isFinite(denominador) || denominador === 0) return null;
  return (numerador / denominador) * factor;
}

/** Compras del periodo: costo de ventas más la variación del inventario. */
export function comprasDe(b: BaseIndicadores): number {
  return b.costo + b.inventario - b.inventario_inicial;
}

export function calcularIndicadores(b: BaseIndicadores): Record<ClaveIndicador, ValorIndicador> {
  const carteraPromedio = promedio(b.cartera, b.cartera_inicial);
  const diasCartera = dividir(carteraPromedio, b.ingresos, b.dias);
  const diasInventario = dividir(promedio(b.inventario, b.inventario_inicial), b.costo, b.dias);
  const diasProveedores = dividir(promedio(b.proveedores, b.proveedores_inicial), comprasDe(b), b.dias);
  const ciclo = diasCartera === null || diasInventario === null || diasProveedores === null
    ? null
    : diasCartera + diasInventario - diasProveedores;
  const fila = (clave: ClaveIndicador, unidad: UnidadIndicador, valor: number | null): ValorIndicador => ({ clave, unidad, valor });
  return {
    razon_corriente: fila('razon_corriente', 'razon', dividir(b.activo_corriente, b.pasivo_corriente)),
    endeudamiento: fila('endeudamiento', 'porcentaje', dividir(b.pasivo, b.activo, 100)),
    margen_neto: fila('margen_neto', 'porcentaje', dividir(b.resultado, b.ingresos, 100)),
    ciclo_caja: fila('ciclo_caja', 'dias', ciclo),
    rotacion_cartera: fila('rotacion_cartera', 'veces', dividir(b.ingresos, carteraPromedio)),
    dias_inventario: fila('dias_inventario', 'dias', diasInventario),
    dias_proveedores: fila('dias_proveedores', 'dias', diasProveedores),
    margen_operacional: fila('margen_operacional', 'porcentaje', dividir(b.resultado_operacional, b.ingresos, 100)),
    roe: fila('roe', 'porcentaje', dividir(b.resultado, promedio(b.patrimonio, b.patrimonio_inicial), 100)),
    roa: fila('roa', 'porcentaje', dividir(b.resultado, promedio(b.activo, b.activo_inicial), 100)),
  };
}

export const KPI_INDICADORES: readonly ClaveIndicador[] = ['razon_corriente', 'endeudamiento', 'margen_neto', 'ciclo_caja'];
export const TABLA_INDICADORES: readonly ClaveIndicador[] = ['rotacion_cartera', 'dias_inventario', 'dias_proveedores', 'margen_operacional', 'roe', 'roa'];
