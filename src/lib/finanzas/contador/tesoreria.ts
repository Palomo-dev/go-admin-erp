/**
 * Categorías de tesorería de la hoja del contador.
 * Donde el estado es Corregir o Nuevo manda la cuenta propuesta, no la original.
 * La seguridad social se causa en el grupo 5105 y se paga con débito a 2370,
 * en dos movimientos. No se inventan las subcuentas de 5105.
 */

export type TipoTesoreria = 'ingreso' | 'egreso';
export type AfectaResultados = 'si' | 'no' | 'parcial' | 'depende';
export type EstadoCategoria = 'ok' | 'corregir' | 'nuevo';
export type CentroCostoTipo = 'administracion' | 'ventas' | 'produccion';
export type LadoMovimiento = 'debito' | 'credito';

export interface CategoriaTesoreria {
  clave: string;
  tipo: TipoTesoreria;
  nombre: string;
  afectaResultados: AfectaResultados;
  estado: EstadoCategoria;
  cuentaPropuesta: string;
  cuentaOriginal: string | null;
  nota: string;
  /** Cuenta por defecto cuando la categoría es un solo movimiento. */
  cuenta: string | null;
  alternativas: readonly string[];
  prohibidas: readonly string[];
  /** Si la cuenta de administración (51) tiene espejo de ventas (52). */
  espejoVentas: boolean;
}

export const CATEGORIAS_TESORERIA: readonly CategoriaTesoreria[] = [
  cat('ventas_productos', 'ingreso', 'Ventas de productos', 'si', 'ok', '4135', null, '', '4135'),
  cat('servicios', 'ingreso', 'Servicios', 'si', 'ok', '4155 o la de la actividad', null, '', '4155', ['4145', '4165', '4170']),
  cat('arriendos_recibidos', 'ingreso', 'Arriendos recibidos', 'si', 'ok', '4220', null, 'Si es la actividad principal, usar 4155.', '4220', ['4155']),
  cat('intereses_recibidos', 'ingreso', 'Intereses', 'si', 'ok', '421005', null, '', '421005'),
  cat('comisiones_recibidas', 'ingreso', 'Comisiones recibidas', 'si', 'corregir', '4225', '4235', '4235 es servicios.', '4225', [], ['4235']),
  cat('recuperaciones', 'ingreso', 'Recuperaciones', 'si', 'ok', '4250', null, '', '4250'),
  cat('otros_ingresos', 'ingreso', 'Otros ingresos', 'si', 'ok', '42959501 (aux. de 4295)', null, '4295 es título.', '42959501'),
  cat('aportes_socios', 'ingreso', 'Aportes de socios', 'no', 'ok', '3105', null, 'Movimiento de caja, no ingreso.', '3105'),
  cat('prestamos_recibidos', 'ingreso', 'Préstamos recibidos', 'no', 'corregir', '2105 (banco) / 2355 (socio)', '2105/2195', 'Movimiento de caja, no ingreso.', null, ['2105', '2355'], ['2195']),
  cat('anticipos_clientes', 'ingreso', 'Anticipos de clientes', 'no', 'ok', '2805', null, 'Movimiento de caja, no ingreso.', '2805'),
  cat('cobro_cartera', 'ingreso', 'Cobro de cartera', 'no', 'ok', 'C 1305', null, 'Movimiento de caja, no ingreso.', '1305'),
  cat('proveedores_pago', 'egreso', 'Proveedores (pago)', 'no', 'corregir', 'D 2205', null, 'Usar 1435 solo en compra de contado sin factura previa.', '2205', ['1435']),
  cat('nomina', 'egreso', 'Nómina', 'si', 'corregir', 'Causación 5105 / pago D 2505', null, 'Separar causación y pago.', null),
  cat('seguridad_social', 'egreso', 'Seguridad social y parafiscales', 'si', 'corregir', 'Causación en subcuentas de 5105 / pago D 2370', null, 'Separar causación y pago.', null),
  cat('arriendo', 'egreso', 'Arriendo', 'si', 'ok', '5120', null, '', '5120', [], [], true),
  cat('energia', 'egreso', 'Energía', 'si', 'ok', '513530', null, '', '513530', [], [], true),
  cat('agua', 'egreso', 'Agua', 'si', 'ok', '513525', null, '', '513525', [], [], true),
  cat('internet', 'egreso', 'Internet y telefonía', 'si', 'corregir', '513535 o 513595', '513540', '513540 es correo, portes y telegramas.', '513535', ['513595'], ['513540'], true),
  cat('gas', 'egreso', 'Gas', 'si', 'nuevo', '513555', null, 'Categoría nueva.', '513555', [], [], true),
  cat('transporte', 'egreso', 'Transporte y fletes', 'si', 'corregir', '513550 (administración) / 523550 (ventas)', null, 'Separar según área.', null, ['513550', '523550']),
  cat('publicidad', 'egreso', 'Publicidad', 'si', 'ok', '523560', null, '', '523560'),
  cat('mantenimiento', 'egreso', 'Mantenimiento', 'si', 'ok', '5145', null, '', '5145', [], [], true),
  cat('papeleria', 'egreso', 'Papelería', 'si', 'ok', '519530', null, '', '519530', [], [], true),
  cat('aseo', 'egreso', 'Aseo y cafetería', 'si', 'ok', '519525', null, '', '519525', [], [], true),
  cat('honorarios', 'egreso', 'Honorarios', 'si', 'ok', '5110', null, '', '5110', [], [], true),
  cat('seguros', 'egreso', 'Seguros', 'si', 'ok', '5130', null, '', '5130', [], [], true),
  cat('impuestos_gasto', 'egreso', 'Impuestos (gasto)', 'si', 'ok', '5115', null, '', '5115', [], [], true),
  cat('impuestos_declarados', 'egreso', 'Pago de impuestos declarados', 'no', 'corregir', 'D 2408 / 2365', null, 'Separar como categoría propia (no es gasto).', null, ['2408', '2365']),
  cat('gmf', 'egreso', 'GMF (4x1000)', 'si', 'corregir', 'Subcuenta propia en 511595 o 530595', null, '50% deducible en renta; llevarlo en subcuenta propia.', '511595', ['530595'], [], true),
  cat('comisiones_bancarias', 'egreso', 'Comisiones bancarias', 'si', 'ok', '53051501 (aux. de 530515)', null, '530515 es título.', '53051501'),
  cat('intereses_pagados', 'egreso', 'Intereses', 'si', 'ok', '530520', null, '', '530520'),
  cat('software', 'egreso', 'Software', 'si', 'corregir', 'SaaS mensual 513595 / licencia > 1 año a 16 con amortización 5165', null, 'Diferenciar suscripción mensual de licencia de largo plazo.', null, ['513595', '16', '5165']),
  cat('combustible', 'egreso', 'Combustible', 'si', 'ok', '519545', null, '', '519545', [], [], true),
  cat('viaticos', 'egreso', 'Viáticos', 'si', 'ok', '5155', null, '', '5155', [], [], true),
  cat('pago_prestamos', 'egreso', 'Pago de préstamos', 'parcial', 'corregir', 'Capital D 2105/2355 (no afecta) + intereses D 530520 (sí afecta)', null, 'Partir el pago en capital e intereses.', null, ['2105', '2355', '530520']),
  cat('devoluciones_clientes', 'egreso', 'Devoluciones a clientes', 'depende', 'corregir', '4175 solo con nota crédito / anticipo D 2805 / pago D 1305', null, '4175 solo cuando hay nota crédito.', null, ['4175', '2805', '1305']),
  cat('otros_gastos', 'egreso', 'Otros gastos', 'si', 'ok', '5195', null, '', '5195', [], [], true),
];

export interface CuentaCentro {
  cuenta: string | null;
  estado: 'definida' | 'por_definir';
}

export interface OpcionCuenta {
  alternativa?: string;
  cuentaProduccion?: string | null;
}

export interface LineaTesoreria {
  momento: string;
  lado: LadoMovimiento;
  cuenta: string | null;
  grupo: string | null;
  exigeSubcuenta: boolean;
  afectaResultados: boolean;
  centavos: number;
}

const GRUPO_NOMINA = '5105';
const PAGO_SEGURIDAD = '2370';

export function categoriaPorClave(clave: string): CategoriaTesoreria {
  const categoria = CATEGORIAS_TESORERIA.find((item) => item.clave === clave);
  if (!categoria) throw new Error('Categoría de tesorería desconocida');
  return categoria;
}

/**
 * Elige la cuenta según el centro. Administración usa la 51, ventas el espejo 52.
 * Producción o prestación directa va a clase 6 o 7: sin una cuenta explícita
 * queda por definir (no se elige 6155 ni 6170).
 */
export function cuentaSegunCentro(clave: string, centro: CentroCostoTipo, opcion: OpcionCuenta = {}): CuentaCentro {
  if (centro === 'produccion') {
    const cuenta = opcion.cuentaProduccion?.trim() || '';
    if (cuenta && (cuenta.startsWith('6') || cuenta.startsWith('7'))) {
      return { cuenta, estado: 'definida' };
    }
    return { cuenta: null, estado: 'por_definir' };
  }
  if (clave === 'transporte') {
    return { cuenta: centro === 'ventas' ? '523550' : '513550', estado: 'definida' };
  }
  if (clave === 'gmf') {
    const cuenta = cuentaElegida('gmf', opcion.alternativa, '511595');
    if (cuenta === '530595') return { cuenta, estado: 'definida' };
    return { cuenta: centro === 'ventas' ? espejo52(cuenta) : cuenta, estado: 'definida' };
  }
  const categoria = categoriaPorClave(clave);
  if (!categoria.cuenta) throw new Error('Esa categoría no se resuelve solo con el centro de costo');
  const base = cuentaElegida(clave, opcion.alternativa, categoria.cuenta);
  if (centro === 'ventas' && categoria.espejoVentas && base.startsWith('51')) {
    return { cuenta: espejo52(base), estado: 'definida' };
  }
  return { cuenta: base, estado: 'definida' };
}

/** Causación Dr 5105 / Cr 2505. El pago es otro movimiento y no afecta resultados. */
export function lineasNomina(momento: 'causacion' | 'pago', pesos: number): LineaTesoreria[] {
  const centavos = aCentavos(pesos);
  if (momento === 'pago') {
    return [linea('pago', 'debito', '2505', null, false, false, centavos)];
  }
  return [
    linea('causacion', 'debito', GRUPO_NOMINA, GRUPO_NOMINA, false, true, centavos),
    linea('causacion', 'credito', '2505', null, false, false, centavos),
  ];
}

/**
 * Causación: débito al grupo 5105 (la subcuenta la confirma el contador) y
 * crédito a 2370. Pago: débito a 2370. Van separados.
 */
export function lineasSeguridadSocial(momento: 'causacion' | 'pago', pesos: number, subcuenta?: string): LineaTesoreria[] {
  const centavos = aCentavos(pesos);
  if (momento === 'pago') {
    return [linea('pago', 'debito', PAGO_SEGURIDAD, null, false, false, centavos)];
  }
  const debita = subcuentaGasto(subcuenta);
  return [
    linea('causacion', 'debito', debita.cuenta, debita.grupo, debita.exigeSubcuenta, true, centavos),
    linea('causacion', 'credito', PAGO_SEGURIDAD, null, false, false, centavos),
  ];
}

export function lineasPrestamoRecibido(origen: 'banco' | 'socio', pesos: number): LineaTesoreria[] {
  const cuenta = origen === 'banco' ? '2105' : '2355';
  return [linea('recibido', 'credito', cuenta, null, false, false, aCentavos(pesos))];
}

export function lineasPagoPrestamo(
  momento: 'capital' | 'intereses',
  pesos: number,
  origen: 'banco' | 'socio' = 'banco',
): LineaTesoreria[] {
  if (momento === 'intereses') {
    return [linea('intereses', 'debito', '530520', null, false, true, aCentavos(pesos))];
  }
  const cuenta = origen === 'banco' ? '2105' : '2355';
  return [linea('capital', 'debito', cuenta, null, false, false, aCentavos(pesos))];
}

export function lineasDevolucionCliente(
  modo: 'nota_credito' | 'anticipo' | 'pago_cartera',
  pesos: number,
): LineaTesoreria[] {
  const cuenta = modo === 'nota_credito' ? '4175' : modo === 'anticipo' ? '2805' : '1305';
  const afecta = modo === 'nota_credito';
  return [linea(modo, 'debito', cuenta, null, false, afecta, aCentavos(pesos))];
}

export function lineasSoftware(
  momento: 'saas' | 'licencia' | 'amortizacion',
  pesos: number,
  centro: Exclude<CentroCostoTipo, 'produccion'> = 'administracion',
): LineaTesoreria[] {
  if (momento === 'licencia') {
    return [linea('licencia', 'debito', '16', null, false, false, aCentavos(pesos))];
  }
  const base = momento === 'saas' ? '513595' : '5165';
  const cuenta = centro === 'ventas' ? espejo52(base) : base;
  return [linea(momento, 'debito', cuenta, null, false, true, aCentavos(pesos))];
}

/** 2408 es título: el pago del IVA declarado debita el auxiliar del generado (24080501). */
export function lineasImpuestoDeclarado(cuenta: '2408' | '2365', pesos: number): LineaTesoreria[] {
  return [linea('pago', 'debito', cuenta === '2408' ? '24080501' : cuenta, null, false, false, aCentavos(pesos))];
}

export function lineasProveedor(pesos: number, compraContadoSinFactura = false): LineaTesoreria[] {
  return [linea('pago', 'debito', compraContadoSinFactura ? '1435' : '2205', null, false, false, aCentavos(pesos))];
}

export interface RepartoCentro {
  centro: 'administracion' | 'ventas';
  porcentaje: number;
}

export function repartirPorcentaje(
  clave: string,
  pesos: number,
  partes: readonly RepartoCentro[],
  opcion: OpcionCuenta = {},
): { centro: 'administracion' | 'ventas'; cuenta: string; centavos: number }[] {
  const suma = partes.reduce((total, parte) => total + parte.porcentaje, 0);
  if (partes.length === 0 || suma !== 100) throw new Error('Los porcentajes del centro de costo suman 100');
  const total = aCentavos(pesos);
  let asignado = 0;
  return partes.map((parte, indice) => {
    const ultimo = indice === partes.length - 1;
    const centavos = ultimo ? total - asignado : Math.round((total * parte.porcentaje) / 100);
    asignado += centavos;
    const resuelta = cuentaSegunCentro(clave, parte.centro, opcion);
    if (!resuelta.cuenta) throw new Error('No hay cuenta para ese centro');
    return { centro: parte.centro, cuenta: resuelta.cuenta, centavos };
  });
}

function subcuentaGasto(subcuenta: string | undefined): { cuenta: string | null; grupo: string; exigeSubcuenta: boolean } {
  if (!subcuenta) return { cuenta: null, grupo: GRUPO_NOMINA, exigeSubcuenta: true };
  const codigo = subcuenta.trim();
  if (!codigo.startsWith(GRUPO_NOMINA) || codigo.length < 6 || !/^\d+$/.test(codigo)) {
    throw new Error('La subcuenta de causación pertenece al grupo 5105');
  }
  return { cuenta: codigo, grupo: GRUPO_NOMINA, exigeSubcuenta: false };
}

function cuentaElegida(clave: string, alternativa: string | undefined, defecto: string): string {
  const categoria = categoriaPorClave(clave);
  const cuenta = (alternativa ?? defecto).trim();
  if (categoria.prohibidas.includes(cuenta)) {
    throw new Error('Esa cuenta quedó corregida y no se usa');
  }
  const permitidas = [defecto, ...categoria.alternativas];
  if (!permitidas.includes(cuenta)) throw new Error('La cuenta no está en las opciones de la categoría');
  return cuenta;
}

function espejo52(cuenta51: string): string {
  if (!cuenta51.startsWith('51')) throw new Error('Solo se espeja una cuenta de administración');
  return `52${cuenta51.slice(2)}`;
}

function linea(
  momento: string,
  lado: LadoMovimiento,
  cuenta: string | null,
  grupo: string | null,
  exigeSubcuenta: boolean,
  afectaResultados: boolean,
  centavos: number,
): LineaTesoreria {
  return { momento, lado, cuenta, grupo, exigeSubcuenta, afectaResultados, centavos };
}

function aCentavos(pesos: number): number {
  if (!Number.isFinite(pesos) || pesos <= 0) throw new Error('El valor va en positivo');
  return Math.round(pesos * 100);
}

function cat(
  clave: string,
  tipo: TipoTesoreria,
  nombre: string,
  afectaResultados: AfectaResultados,
  estado: EstadoCategoria,
  cuentaPropuesta: string,
  cuentaOriginal: string | null,
  nota: string,
  cuenta: string | null,
  alternativas: readonly string[] = [],
  prohibidas: readonly string[] = [],
  espejoVentas = false,
): CategoriaTesoreria {
  return {
    clave, tipo, nombre, afectaResultados, estado, cuentaPropuesta, cuentaOriginal, nota, cuenta, alternativas, prohibidas, espejoVentas,
  };
}
