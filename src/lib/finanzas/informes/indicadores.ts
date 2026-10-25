/**
 * Indicadores calculados sobre saldos propios (sin sumar de nuevo los títulos
 * del árbol PUC) y los resultados del mismo motor de estados financieros.
 * Las bases comerciales son opcionales: su ausencia se informa, nunca se
 * sustituye ventas a crédito o compras por el movimiento de una cuenta.
 */
export interface CuentaIndicador {
  account_code: string;
  name: string;
  clasificacion_corriente?: 'corriente' | 'no_corriente' | null;
  costo_comportamiento?: 'fijo' | 'variable' | null;
}

export interface BaseActividadIndicadores {
  ventasCredito: number | null;
  compras: number | null;
  fuente: string;
  motivoVentasCredito?: string;
  motivoCompras?: string;
  unidadesVendidas?: number;
  /** Solo permite un equilibrio global en unidades cuando son comparables. */
  unidadesHomogeneas?: boolean;
}

export interface ProductoContribucion {
  id: string;
  nombre: string;
  linea?: string | null;
  ventas: number;
  costoVariable: number;
  unidades: number;
}

export interface PeriodoBaseIndicadores {
  saldosIniciales: Record<string, number>;
  saldosFinales: Record<string, number>;
  /** Movimiento neto débito del período, excluyendo asientos de cierre. */
  gastosPeriodo: Record<string, number>;
  activoTotalInicial: number;
  activoTotalFinal: number;
  patrimonioInicial: number;
  patrimonioFinal: number;
  ventasNetas: number;
  costoVentas: number;
  utilidadOperacional: number;
  utilidadNeta: number;
  /** Créditos del período en 1592, 1598, 1399 y 1499; incluye costo. */
  depreciacionAmortizacionDeterioro: number;
  basesActividad?: BaseActividadIndicadores;
  productos?: ProductoContribucion[];
}

export interface EntradaIndicadores {
  cuentas: CuentaIndicador[];
  actual: PeriodoBaseIndicadores;
  anterior: PeriodoBaseIndicadores;
}

export type ClaveIndicador = 'razon_corriente' | 'prueba_acida' | 'capital_trabajo'
  | 'endeudamiento' | 'apalancamiento' | 'margen_bruto' | 'margen_operacional'
  | 'margen_neto' | 'roa' | 'roe' | 'ebitda' | 'dias_cartera'
  | 'dias_inventario' | 'dias_proveedores';

export interface FilaIndicador {
  clave: ClaveIndicador;
  nombre: string;
  unidad: 'razon' | 'porcentaje' | 'pesos' | 'dias';
  formula: string;
  actual: number | null;
  anterior: number | null;
  variacion: number | null;
  variacionPorcentaje: number | null;
  motivoActual: string | null;
  motivoAnterior: string | null;
}

interface ValorExplicado {
  valor: number | null;
  motivo: string | null;
}

export interface ResultadoEquilibrio {
  ventas: number;
  costosFijos: number;
  costosVariables: number;
  gastosSinClasificar: number;
  cuentasSinClasificar: string[];
  margenContribucion: number;
  tasaContribucion: number | null;
  pesos: number | null;
  unidades: number | null;
  motivo: string | null;
  motivoUnidades: string | null;
}

export interface FilaContribucion extends ProductoContribucion {
  margenContribucion: number;
  porcentajeContribucion: number | null;
  contribucionUnitaria: number | null;
}

export type FilaContribucionLinea = Omit<FilaContribucion, 'unidades'> & { unidades: null };

const DEFINICIONES: Array<Pick<FilaIndicador, 'clave' | 'nombre' | 'unidad' | 'formula'>> = [
  { clave: 'razon_corriente', nombre: 'Razón corriente', unidad: 'razon', formula: 'Activo corriente / pasivo corriente' },
  { clave: 'prueba_acida', nombre: 'Prueba ácida', unidad: 'razon', formula: '(Activo corriente − inventarios netos) / pasivo corriente' },
  { clave: 'capital_trabajo', nombre: 'Capital de trabajo', unidad: 'pesos', formula: 'Activo corriente − pasivo corriente' },
  { clave: 'endeudamiento', nombre: 'Endeudamiento', unidad: 'porcentaje', formula: 'Pasivo total / activo total × 100' },
  { clave: 'apalancamiento', nombre: 'Apalancamiento', unidad: 'razon', formula: 'Pasivo total / patrimonio' },
  { clave: 'margen_bruto', nombre: 'Margen bruto', unidad: 'porcentaje', formula: '(Ventas netas − costo de ventas) / ventas netas × 100' },
  { clave: 'margen_operacional', nombre: 'Margen operacional', unidad: 'porcentaje', formula: 'Utilidad operacional / ventas netas × 100' },
  { clave: 'margen_neto', nombre: 'Margen neto', unidad: 'porcentaje', formula: 'Utilidad después de impuestos / ventas netas × 100' },
  { clave: 'roa', nombre: 'ROA', unidad: 'porcentaje', formula: 'Utilidad neta / activo total promedio × 100' },
  { clave: 'roe', nombre: 'ROE', unidad: 'porcentaje', formula: 'Utilidad neta / patrimonio promedio × 100' },
  { clave: 'ebitda', nombre: 'EBITDA', unidad: 'pesos', formula: 'Utilidad operacional + créditos en 1592, 1598, 1399 y 1499' },
  { clave: 'dias_cartera', nombre: 'Días de cartera', unidad: 'dias', formula: 'Promedio de 1305 / ventas a crédito × 365' },
  { clave: 'dias_inventario', nombre: 'Días de inventario', unidad: 'dias', formula: 'Inventario neto promedio / costo de ventas × 365' },
  { clave: 'dias_proveedores', nombre: 'Días de proveedores', unidad: 'dias', formula: 'Promedio de 2205 / compras × 365' },
];

const explicado = (valor: number): ValorExplicado => {
  validarNumero(valor, 'resultado del indicador');
  return { valor, motivo: null };
};
const sinValor = (motivo: string): ValorExplicado => ({ valor: null, motivo });

function dividir(numerador: number, denominador: number, motivo: string, factor = 1): ValorExplicado {
  validarNumero(numerador, 'numerador');
  validarNumero(denominador, 'denominador');
  return denominador === 0 ? sinValor(motivo) : explicado(numerador / denominador * factor);
}

function validarNumero(valor: number, campo: string): void {
  if (!Number.isFinite(valor)) throw new Error(`El valor de ${campo} debe ser un número finito.`);
}

function validarPeriodo(periodo: PeriodoBaseIndicadores): void {
  const escalares = ['activoTotalInicial', 'activoTotalFinal', 'patrimonioInicial', 'patrimonioFinal',
    'ventasNetas', 'costoVentas', 'utilidadOperacional', 'utilidadNeta', 'depreciacionAmortizacionDeterioro'] as const;
  escalares.forEach((campo) => validarNumero(periodo[campo], campo));
  [periodo.saldosIniciales, periodo.saldosFinales, periodo.gastosPeriodo].forEach((saldos) => {
    Object.entries(saldos).forEach(([codigo, valor]) => validarNumero(valor, codigo));
  });
  if (periodo.basesActividad) {
    if (periodo.basesActividad.ventasCredito !== null) validarNumero(periodo.basesActividad.ventasCredito, 'ventas a crédito');
    if (periodo.basesActividad.compras !== null) validarNumero(periodo.basesActividad.compras, 'compras');
    if (periodo.basesActividad.unidadesVendidas != null) validarNumero(periodo.basesActividad.unidadesVendidas, 'unidades vendidas');
  }
  periodo.productos?.forEach((producto) => {
    validarNumero(producto.ventas, 'ventas por producto');
    validarNumero(producto.costoVariable, 'costo variable por producto');
    validarNumero(producto.unidades, 'unidades por producto');
  });
}

function sumar(saldos: Record<string, number>, prefijo: string): number {
  const total = Object.entries(saldos).reduce((acumulado, [codigo, valor]) => acumulado + (codigo.startsWith(prefijo) ? valor : 0), 0);
  validarNumero(total, `saldo de ${prefijo}`);
  return total;
}

/** La marca del auxiliar prevalece sobre la de su cuenta o grupo. */
function marcaHeredada<K extends 'clasificacion_corriente' | 'costo_comportamiento'>(
  cuentas: CuentaIndicador[], codigo: string, campo: K,
): CuentaIndicador[K] | undefined {
  return cuentas.filter((cuenta) => codigo.startsWith(cuenta.account_code) && cuenta[campo] != null)
    .sort((a, b) => b.account_code.length - a.account_code.length)[0]?.[campo];
}

export function comportamientoCosto(cuentas: CuentaIndicador[], codigo: string): 'fijo' | 'variable' | null {
  // La clase 6 completa es variable, sea comercio, servicios o manufactura.
  if (codigo.startsWith('6')) return 'variable';
  const marca = marcaHeredada(cuentas, codigo, 'costo_comportamiento');
  if (marca) return marca;
  if (codigo.startsWith('51')) return 'fijo';
  if (codigo.startsWith('529505')) return 'variable';
  const cuenta = cuentas.find((fila) => fila.account_code === codigo);
  if (codigo.startsWith('52') && cuenta && /comisi[oó]n/i.test(cuenta.name)) return 'variable';
  return null;
}

function corriente(cuentas: CuentaIndicador[], codigo: string): boolean | null {
  const marca = marcaHeredada(cuentas, codigo, 'clasificacion_corriente');
  if (marca) return marca === 'corriente';
  // Mantiene la clasificación habitual. Inversiones, diferidos y la porción
  // de deuda a doce meses requieren la marca: no se presume su vencimiento.
  if (['11', '13', '14'].some((prefijo) => codigo.startsWith(prefijo))) return true;
  return null;
}

function calcularCorrientes(cuentas: CuentaIndicador[], saldos: Record<string, number>) {
  let activo = 0;
  let pasivo = 0;
  let inventarioCorriente = 0;
  const pendientesActivo: string[] = [];
  const pendientesPasivo: string[] = [];
  Object.entries(saldos).forEach(([codigo, saldo]) => {
    if (saldo === 0) return;
    const esActivo = ['11', '12', '13', '14', '17'].some((prefijo) => codigo.startsWith(prefijo));
    const esPasivo = /^2[1-8]/.test(codigo);
    if (!esActivo && !esPasivo) return;
    const marca = corriente(cuentas, codigo);
    if (marca === null) (esActivo ? pendientesActivo : pendientesPasivo).push(codigo);
    else if (marca) {
      if (esActivo) {
        activo += saldo;
        if (codigo.startsWith('14')) inventarioCorriente += saldo;
      }
      else pasivo += saldo;
    }
  });
  return { activo, pasivo, inventarioCorriente, pendientesActivo, pendientesPasivo };
}

function calcularPeriodo(cuentas: CuentaIndicador[], periodo: PeriodoBaseIndicadores) {
  validarPeriodo(periodo);
  const saldos = periodo.saldosFinales;
  const iniciales = periodo.saldosIniciales;
  const corrientes = calcularCorrientes(cuentas, saldos);
  const pendientes = [...corrientes.pendientesActivo, ...corrientes.pendientesPasivo];
  const motivoCorriente = pendientes.length ? `Falta clasificar corriente/no corriente: ${pendientes.sort().join(', ')}.` : null;
  const promedio = (prefijo: string) => sumar(iniciales, prefijo) / 2 + sumar(saldos, prefijo) / 2;
  const bases = periodo.basesActividad?.fuente.trim() ? periodo.basesActividad : undefined;
  const valores: Record<ClaveIndicador, ValorExplicado> = {
    razon_corriente: motivoCorriente ? sinValor(motivoCorriente) : dividir(corrientes.activo, corrientes.pasivo, 'El pasivo corriente es cero.'),
    prueba_acida: motivoCorriente ? sinValor(motivoCorriente) : dividir(corrientes.activo - corrientes.inventarioCorriente, corrientes.pasivo, 'El pasivo corriente es cero.'),
    capital_trabajo: motivoCorriente ? sinValor(motivoCorriente) : explicado(corrientes.activo - corrientes.pasivo),
    endeudamiento: dividir(sumar(saldos, '2'), periodo.activoTotalFinal, 'El activo total es cero.', 100),
    apalancamiento: dividir(sumar(saldos, '2'), periodo.patrimonioFinal, 'El patrimonio es cero.'),
    margen_bruto: dividir(periodo.ventasNetas - periodo.costoVentas, periodo.ventasNetas, 'Las ventas netas son cero.', 100),
    margen_operacional: dividir(periodo.utilidadOperacional, periodo.ventasNetas, 'Las ventas netas son cero.', 100),
    margen_neto: dividir(periodo.utilidadNeta, periodo.ventasNetas, 'Las ventas netas son cero.', 100),
    roa: dividir(periodo.utilidadNeta, periodo.activoTotalInicial / 2 + periodo.activoTotalFinal / 2, 'El activo total promedio es cero.', 100),
    roe: dividir(periodo.utilidadNeta, periodo.patrimonioInicial / 2 + periodo.patrimonioFinal / 2, 'El patrimonio promedio es cero.', 100),
    ebitda: explicado(periodo.utilidadOperacional + periodo.depreciacionAmortizacionDeterioro),
    dias_cartera: bases?.ventasCredito != null ? dividir(promedio('1305'), bases.ventasCredito, 'Las ventas a crédito son cero.', 365) : sinValor(bases?.motivoVentasCredito ?? 'No hay una base verificada de ventas a crédito del período.'),
    dias_inventario: dividir(promedio('14'), periodo.costoVentas, 'El costo de ventas es cero.', 365),
    dias_proveedores: bases?.compras != null ? dividir(promedio('2205'), bases.compras, 'Las compras son cero.', 365) : sinValor(bases?.motivoCompras ?? 'No hay una base verificada de compras del período.'),
  };
  return { valores, corrientes, motivoCorriente };
}

function calcularEquilibrio(cuentas: CuentaIndicador[], periodo: PeriodoBaseIndicadores): ResultadoEquilibrio {
  let costosFijos = 0;
  let costosVariables = periodo.costoVentas;
  let gastosSinClasificar = 0;
  const cuentasSinClasificar: string[] = [];
  Object.entries(periodo.gastosPeriodo).forEach(([codigo, valor]) => {
    // La clase 6 ya está incluida en costoVentas; no se duplica aquí.
    if (!codigo.startsWith('5') || valor === 0) return;
    // Gastos financieros e impuesto de renta no forman el costo operacional
    // del producto. Se pueden incorporar expresamente mediante una marca.
    const marca = marcaHeredada(cuentas, codigo, 'costo_comportamiento');
    if (!/^5[12]/.test(codigo) && !marca) return;
    const tipo = comportamientoCosto(cuentas, codigo);
    if (tipo === 'fijo') costosFijos += valor;
    else if (tipo === 'variable') costosVariables += valor;
    else {
      gastosSinClasificar += valor;
      cuentasSinClasificar.push(codigo);
    }
  });
  [costosFijos, costosVariables, gastosSinClasificar].forEach((valor) => validarNumero(valor, 'agregado de costos'));
  const margenContribucion = periodo.ventasNetas - costosVariables;
  validarNumero(margenContribucion, 'margen de contribución');
  const tasaContribucion = periodo.ventasNetas === 0 ? null : margenContribucion / periodo.ventasNetas;
  const motivo = cuentasSinClasificar.length
    ? `Falta clasificar fijo/variable: ${cuentasSinClasificar.sort().join(', ')}.`
    : periodo.ventasNetas <= 0 ? 'Las ventas netas deben ser positivas para calcular el punto de equilibrio.'
      : margenContribucion <= 0 ? 'El margen de contribución debe ser positivo para alcanzar el equilibrio.'
        : costosFijos < 0 ? 'Los costos fijos son negativos; revise las reclasificaciones del período.' : null;
  const pesos = motivo || tasaContribucion == null ? null : Math.round(costosFijos / tasaContribucion);
  const bases = periodo.basesActividad;
  const motivoUnidades = motivo ?? (!bases?.fuente.trim() || !bases.unidadesHomogeneas
    ? 'Seleccione un producto o una línea con unidades homogéneas y una fuente verificada.'
    : (bases.unidadesVendidas ?? 0) <= 0 ? 'Las unidades vendidas deben ser positivas.' : null);
  // Se usa el importe sin redondear: redondear primero los pesos puede llevar
  // el mínimo de unidades un entero por encima o por debajo del equilibrio.
  const unidades = motivoUnidades || tasaContribucion == null || !bases?.unidadesVendidas
    ? null : Math.ceil(costosFijos / (margenContribucion / bases.unidadesVendidas));
  if (pesos !== null) validarNumero(pesos, 'equilibrio en pesos');
  if (unidades !== null) validarNumero(unidades, 'equilibrio en unidades');
  return {
    ventas: Math.round(periodo.ventasNetas), costosFijos: Math.round(costosFijos),
    costosVariables: Math.round(costosVariables), gastosSinClasificar: Math.round(gastosSinClasificar),
    cuentasSinClasificar, margenContribucion: Math.round(margenContribucion),
    tasaContribucion, pesos, unidades, motivo, motivoUnidades,
  };
}

function contribucion(productos: ProductoContribucion[] | undefined): FilaContribucion[] {
  return (productos ?? []).map((producto) => {
    const margen = producto.ventas - producto.costoVariable;
    validarNumero(margen, 'contribución por producto');
    const porcentajeContribucion = producto.ventas === 0 ? null : margen / producto.ventas * 100;
    const contribucionUnitaria = producto.unidades === 0 ? null : margen / producto.unidades;
    if (porcentajeContribucion !== null) validarNumero(porcentajeContribucion, 'porcentaje de contribución por producto');
    if (contribucionUnitaria !== null) validarNumero(contribucionUnitaria, 'contribución unitaria');
    return {
      ...producto, ventas: Math.round(producto.ventas), costoVariable: Math.round(producto.costoVariable),
      margenContribucion: Math.round(margen),
      porcentajeContribucion, contribucionUnitaria,
    };
  });
}

function contribucionPorLinea(productos: ProductoContribucion[] | undefined): FilaContribucionLinea[] {
  const lineas = new Map<string, ProductoContribucion>();
  (productos ?? []).forEach((producto) => {
    if (!producto.linea) return;
    const fila = lineas.get(producto.linea) ?? {
      id: producto.linea, nombre: producto.linea, linea: producto.linea,
      ventas: 0, costoVariable: 0, unidades: 0,
    };
    fila.ventas += producto.ventas;
    fila.costoVariable += producto.costoVariable;
    // Una línea puede reunir presentaciones distintas. El margen por unidad
    // solo se publica por producto; no se suman unidades incompatibles.
    lineas.set(producto.linea, fila);
  });
  return contribucion(Array.from(lineas.values())).map((fila) => ({ ...fila, unidades: null }));
}

export function generarIndicadores(entrada: EntradaIndicadores) {
  const actual = calcularPeriodo(entrada.cuentas, entrada.actual);
  const anterior = calcularPeriodo(entrada.cuentas, entrada.anterior);
  const filas: FilaIndicador[] = DEFINICIONES.map((definicion) => {
    const a = actual.valores[definicion.clave];
    const b = anterior.valores[definicion.clave];
    const valorActual = a.valor == null ? null : definicion.unidad === 'pesos' ? Math.round(a.valor) : a.valor;
    const valorAnterior = b.valor == null ? null : definicion.unidad === 'pesos' ? Math.round(b.valor) : b.valor;
    const variacion = valorActual == null || valorAnterior == null ? null : valorActual - valorAnterior;
    const variacionPorcentaje = a.valor == null || b.valor == null || b.valor === 0 ? null : (a.valor - b.valor) / Math.abs(b.valor) * 100;
    if (variacion !== null) validarNumero(variacion, 'variación del indicador');
    if (variacionPorcentaje !== null) validarNumero(variacionPorcentaje, 'variación porcentual del indicador');
    return {
      ...definicion, actual: valorActual, anterior: valorAnterior,
      variacion, variacionPorcentaje,
      motivoActual: a.motivo, motivoAnterior: b.motivo,
    };
  });
  const equilibrio = {
    actual: calcularEquilibrio(entrada.cuentas, entrada.actual),
    anterior: calcularEquilibrio(entrada.cuentas, entrada.anterior),
  };
  return {
    filas, equilibrio,
    contribucion: {
      actual: contribucion(entrada.actual.productos), anterior: contribucion(entrada.anterior.productos),
      lineasActual: contribucionPorLinea(entrada.actual.productos),
      lineasAnterior: contribucionPorLinea(entrada.anterior.productos),
    },
    advertencias: Array.from(new Set([
      ...filas.flatMap((fila) => [fila.motivoActual, fila.motivoAnterior]),
      equilibrio.actual.motivo, equilibrio.anterior.motivo,
      ...(entrada.actual.productos ? [] : ['No hay una base verificada de ventas y costos variables por producto o línea.']),
    ].filter((motivo): motivo is string => motivo !== null))),
  };
}
