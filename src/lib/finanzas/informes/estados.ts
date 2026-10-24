import type { PeriodoBaseIndicadores } from './indicadores';
import { codigoNormalizado } from '@/lib/finanzas/pucPrefijo';

/** Entradas del libro filtradas por organización, sucursal y centro por el servidor. */
export interface CuentaInforme {
  account_code: string;
  account_code_original?: string;
  name: string;
  type?: string;
  description?: string | null;
  concepto_exogena?: string | null;
  presentacion_niif?: 'corriente' | 'no_corriente' | 'segun_plazo' | null;
  es_ori?: boolean | null;
  es_equivalente_efectivo?: boolean | null;
  plazo_meses?: number | null;
  clasificacion_corriente?: 'corriente' | 'no_corriente' | null;
  costo_comportamiento?: 'fijo' | 'variable' | null;
}

export type ConceptoPatrimonio = 'aportes' | 'dividendos_efectivo' | 'dividendos_acciones'
  | 'reservas' | 'traslado_resultados' | 'correccion_errores' | 'ori';

export interface MovimientoInforme {
  id?: string | number;
  entry_id: string | number;
  /** Día contable en la zona de la organización; el servidor convierte el timestamptz. */
  entry_date: string;
  account_code: string;
  account_code_original?: string;
  debit: number;
  credit: number;
  posted: boolean;
  voided?: boolean;
  /** Fecha local de la reversión: original y reversión se excluyen desde este corte. */
  anulado_desde?: string | null;
  /** La restauración contabilizada termina el intervalo de anulación. */
  anulado_hasta?: string | null;
  source?: string | null;
  /** Clasificación explícita persistida; nunca se infiere del texto del asiento. */
  concepto_patrimonio?: ConceptoPatrimonio | null;
  /** Provisión distinta de depreciación/deterioro: clasificación explícita del asiento. */
  provision_sin_caja?: boolean;
  /** Clasificación explícita persistida de cobros de cartera por inversión/financiación. */
  cash_flow_activity?: 'operacion' | 'inversion' | 'financiacion' | null;
}

export interface EntradaEstados {
  cuentas: CuentaInforme[];
  movimientos: MovimientoInforme[];
  desde: string;
  hasta: string;
  grupoNiif: 2 | 3;
}

export interface FilaComparativa {
  codigo: string;
  nombre: string;
  actual: number;
  anterior: number;
  variacion: number;
  variacionPorcentaje: number | null;
}

export interface ResultadoPeriodo {
  desde: string;
  hasta: string;
  saldosIniciales: Record<string, number>;
  saldosFinales: Record<string, number>;
  ingresos: number;
  ventasNetas: number;
  costoVentas: number;
  gastosOperacionales: number;
  costoProduccion: number;
  utilidadOperacional: number;
  gastosNoOperacionales: number;
  impuestoRenta: number;
  utilidadNeta: number;
  ori: number | null;
  resultadoIntegral: number;
  activo: number;
  pasivo: number;
  patrimonio: number;
  resultadoAbierto: number;
  diferenciaBalance: number;
  baseIndicadores: PeriodoBaseIndicadores;
}

const COLUMNAS_PATRIMONIO = ['31', '32', '33', '34', '35', '36', '37', '38'] as const;
export interface FilaPatrimonio {
  clave: string;
  nombre: string;
  valores: Record<string, number>;
  total: number;
}
export interface ResultadoPatrimonio {
  columnas: string[];
  filas: FilaPatrimonio[];
  saldoFinal: number;
  patrimonioBalance: number;
  diferencia: number;
  advertencias: string[];
}
export interface FilaFlujo {
  clave: string;
  nombre: string;
  actividad: 'operacion' | 'inversion' | 'financiacion';
  valor: number;
}
export interface ResultadoFlujo {
  filas: FilaFlujo[];
  operacion: number;
  inversion: number;
  financiacion: number;
  flujoNeto: number;
  efectivoInicial: number;
  efectivoFinal: number;
  variacionEfectivo: number;
  diferencia: number;
  advertencias: string[];
}

const esResultado = (codigo: string) => /^[4-7]/.test(codigo);
const esCierre = (m: MovimientoInforme) => m.source === 'cierre_ejercicio' || m.source === 'cierre_periodo';
const natural = (codigo: string, debito: number, credito: number) => /^[1567]/.test(codigo) ? debito - credito : credito - debito;
const sumar = (valores: number[]) => valores.reduce((a, b) => a + b, 0);
const netoCredito = (m: MovimientoInforme) => m.credit - m.debit;
const enPeriodo = (m: MovimientoInforme, desde: string, hasta: string) => m.entry_date >= desde && m.entry_date <= hasta;

/** Devuelve null al comparar contra cero: no existe una variación porcentual finita. */
export function comparar(codigo: string, nombre: string, actual: number, anterior: number): FilaComparativa {
  return { codigo, nombre, actual, anterior, variacion: actual - anterior,
    variacionPorcentaje: anterior === 0 ? null : (actual - anterior) / Math.abs(anterior) * 100 };
}

function validarFecha(fecha: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('El periodo debe usar fechas YYYY-MM-DD.');
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) throw new Error('La fecha del periodo no es válida.');
}

/** 29 de febrero compara con el último día de febrero del año anterior. */
export function fechaAnoAnterior(fecha: string): string {
  validarFecha(fecha);
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const maximo = new Date(Date.UTC(anio - 1, mes, 0)).getUTCDate();
  return `${anio - 1}-${String(mes).padStart(2, '0')}-${String(Math.min(dia, maximo)).padStart(2, '0')}`;
}

export function movimientosContabilizados<T extends MovimientoInforme>(movimientos: T[], corte?: string, estricto = false): T[] {
  return movimientos.filter((m) => {
    if (m.posted !== true || m.voided === true) return false;
    if (!corte || !m.anulado_desde) return true;
    const anulacionIniciada = estricto ? m.anulado_desde < corte : m.anulado_desde <= corte;
    const restaurado = m.anulado_hasta && (estricto ? m.anulado_hasta < corte : m.anulado_hasta <= corte);
    return !anulacionIniciada || !!restaurado;
  })
    .map((m) => {
      const codigo = codigoNormalizado(m.account_code);
      return codigo === m.account_code && m.account_code_original != null ? m
        : { ...m, account_code: codigo, account_code_original: m.account_code_original ?? m.account_code };
    });
}

/** Saldos propios de cada cuenta, jamás se suman títulos y agregados del árbol. */
export function saldosAlCorte(movimientos: MovimientoInforme[], corte: string, estricto = false): Record<string, number> {
  const saldos: Record<string, number> = {};
  for (const m of movimientosContabilizados(movimientos, corte, estricto)) {
    if (estricto ? m.entry_date >= corte : m.entry_date > corte) continue;
    saldos[m.account_code] = (saldos[m.account_code] ?? 0) + natural(m.account_code, m.debit, m.credit);
  }
  return saldos;
}

export function saldoPrefijo(saldos: Record<string, number>, prefijo: string): number {
  return sumar(Object.entries(saldos).filter(([codigo]) => codigo.startsWith(prefijo)).map(([, valor]) => valor));
}

function cuentaDe(codigo: string, cuentas: CuentaInforme[]): CuentaInforme | undefined {
  return cuentas.filter((c) => codigo.startsWith(codigoNormalizado(c.account_code))).sort((a, b) => codigoNormalizado(b.account_code).length - codigoNormalizado(a.account_code).length)[0];
}

function esOri(m: MovimientoInforme, cuentas: CuentaInforme[]) {
  return m.account_code.startsWith('38') && cuentaDe(m.account_code, cuentas)?.es_ori === true;
}

function depreciacion(movimientos: MovimientoInforme[]): number {
  return sumar(movimientos.filter((m) => ['1592', '1598', '1399', '1499'].some((p) => m.account_code.startsWith(p))).map((m) => m.credit));
}

/** El resultado económico excluye cierres, pero los saldos del balance los incluyen. */
export function resultadoPeriodo(movimientos: MovimientoInforme[], desde: string, hasta: string) {
  const periodo = movimientosContabilizados(movimientos, hasta).filter((m) => enPeriodo(m, desde, hasta) && !esCierre(m));
  const neto = (prefijo: string) => sumar(periodo.filter((m) => m.account_code.startsWith(prefijo)).map(netoCredito));
  // 4175 ya está dentro de 41 como débito: restarlo otra vez duplicaría las devoluciones.
  const ventasNetas = neto('41');
  const costoVentas = 0 - neto('6');
  const costoProduccion = 0 - neto('7');
  const gastosOperacionales = 0 - neto('51') - neto('52');
  const utilidadOperacional = ventasNetas - costoVentas - gastosOperacionales;
  const ingresos = neto('4');
  const utilidadNeta = sumar(periodo.filter((m) => esResultado(m.account_code)).map(netoCredito));
  return { ingresos, ventasNetas, costoVentas, costoProduccion, gastosOperacionales, utilidadOperacional,
    gastosNoOperacionales: 0 - neto('53'), impuestoRenta: 0 - neto('54'), utilidadNeta,
    depreciacionAmortizacionDeterioro: depreciacion(periodo) };
}

function patrimonioBalance(saldos: Record<string, number>): number {
  return saldoPrefijo(saldos, '3') + sumar(Object.entries(saldos).filter(([c]) => esResultado(c)).map(([c, v]) => c.startsWith('4') ? v : -v));
}

function calcularPeriodo(entrada: EntradaEstados, desde: string, hasta: string): ResultadoPeriodo {
  const movimientos = movimientosContabilizados(entrada.movimientos);
  const periodo = movimientosContabilizados(movimientos, hasta).filter((m) => enPeriodo(m, desde, hasta) && !esCierre(m));
  const inicial = saldosAlCorte(movimientos, desde, true);
  const final = saldosAlCorte(movimientos, hasta);
  const resultado = resultadoPeriodo(movimientos, desde, hasta);
  const ori = entrada.grupoNiif === 3 ? null : sumar(periodo.filter((m) => esOri(m, entrada.cuentas)).map(netoCredito));
  const activo = saldoPrefijo(final, '1');
  const pasivo = saldoPrefijo(final, '2');
  const patrimonio = patrimonioBalance(final);
  const gastosPeriodo: Record<string, number> = {};
  periodo.filter((m) => m.account_code.startsWith('5')).forEach((m) => {
    gastosPeriodo[m.account_code] = (gastosPeriodo[m.account_code] ?? 0) + m.debit - m.credit;
  });
  return { desde, hasta, saldosIniciales: inicial, saldosFinales: final, ...resultado, ori,
    resultadoIntegral: resultado.utilidadNeta + (ori ?? 0), activo, pasivo, patrimonio,
    resultadoAbierto: patrimonio - saldoPrefijo(final, '3'), diferenciaBalance: activo - pasivo - patrimonio,
    baseIndicadores: { saldosIniciales: inicial, saldosFinales: final, gastosPeriodo,
      activoTotalInicial: saldoPrefijo(inicial, '1'), activoTotalFinal: activo,
      patrimonioInicial: patrimonioBalance(inicial), patrimonioFinal: patrimonio,
      ventasNetas: resultado.ventasNetas, costoVentas: resultado.costoVentas,
      utilidadOperacional: resultado.utilidadOperacional, utilidadNeta: resultado.utilidadNeta,
      depreciacionAmortizacionDeterioro: resultado.depreciacionAmortizacionDeterioro } };
}

function filaPatrimonio(clave: string, nombre: string): FilaPatrimonio {
  return { clave, nombre, valores: Object.fromEntries(COLUMNAS_PATRIMONIO.map((c) => [c, 0])), total: 0 };
}

function agregarPatrimonio(fila: FilaPatrimonio, codigo: string, valor: number) {
  const columna = codigo.slice(0, 2);
  if (!COLUMNAS_PATRIMONIO.includes(columna as typeof COLUMNAS_PATRIMONIO[number])) return;
  fila.valores[columna] += valor;
  fila.total += valor;
}

function agruparAsientos(movimientos: MovimientoInforme[]): MovimientoInforme[][] {
  const mapa = new Map<string | number, MovimientoInforme[]>();
  for (const m of movimientos) mapa.set(m.entry_id, [...(mapa.get(m.entry_id) ?? []), m]);
  return [...mapa.values()];
}

/** Clasifica solo eventos inequívocos o explícitos; lo restante conserva una fila visible. */
function conceptoAsiento(lineas: MovimientoInforme[]): ConceptoPatrimonio | null {
  const explicitos = [...new Set(lineas.map((m) => m.concepto_patrimonio).filter((c): c is ConceptoPatrimonio => !!c))];
  if (explicitos.length === 1) return explicitos[0];
  if (explicitos.length > 1) return null;
  const debita = (p: string) => lineas.some((m) => m.account_code.startsWith(p) && m.debit > 0);
  const acredita = (p: string) => lineas.some((m) => m.account_code.startsWith(p) && m.credit > 0);
  if (debita('37') && acredita('2360')) return 'dividendos_efectivo';
  if ((debita('37') || debita('36')) && acredita('35')) return 'dividendos_acciones';
  if ((debita('37') || debita('36')) && acredita('33')) return 'reservas';
  if (debita('36') && acredita('37')) return 'traslado_resultados';
  if (lineas.some((m) => /^(31|32)/.test(m.account_code) && m.credit > 0)
    && !lineas.some((m) => m.account_code.startsWith('3') && m.debit > 0)) return 'aportes';
  return null;
}

function calcularPatrimonio(entrada: EntradaEstados, periodo: ResultadoPeriodo): ResultadoPatrimonio {
  const filas = [
    filaPatrimonio('saldo_inicial', 'Saldo inicial'), filaPatrimonio('aportes', 'Aportes'),
    filaPatrimonio('dividendos_efectivo', 'Dividendos decretados en efectivo'),
    filaPatrimonio('dividendos_acciones', 'Dividendos en acciones'), filaPatrimonio('reservas', 'Constitución de reservas'),
    filaPatrimonio('traslado_resultados', 'Traslado de resultados de 36 a 37'),
    filaPatrimonio('correccion_errores', 'Corrección de errores de periodos anteriores — sección 10'),
    filaPatrimonio('ori', 'ORI del periodo'), filaPatrimonio('utilidad_periodo', 'Utilidad del periodo'),
    filaPatrimonio('anulaciones_anteriores', 'Efecto de anulaciones de periodos anteriores'),
    filaPatrimonio('otros', 'Otros movimientos por clasificar'), filaPatrimonio('saldo_final', 'Saldo final'),
  ];
  const porClave = Object.fromEntries(filas.map((f) => [f.clave, f]));
  const inicial = porClave.saldo_inicial;
  for (const columna of COLUMNAS_PATRIMONIO) agregarPatrimonio(inicial, columna, saldoPrefijo(periodo.saldosIniciales, columna));
  const resultadoInicialAbierto = patrimonioBalance(periodo.saldosIniciales) - saldoPrefijo(periodo.saldosIniciales, '3');
  agregarPatrimonio(inicial, '36', resultadoInicialAbierto);

  const movimientos = movimientosContabilizados(entrada.movimientos, periodo.hasta).filter((m) => enPeriodo(m, periodo.desde, periodo.hasta));
  let clasificar = false;
  for (const lineas of agruparAsientos(movimientos)) {
    const concepto = conceptoAsiento(lineas);
    for (const m of lineas.filter((l) => l.account_code.startsWith('3'))) {
      // Cierres contra 36 reclasifican la utilidad ya presentada; el cambio total se explica
      // con el resultado económico y el resultado abierto, nunca duplicando la utilidad.
      if (esCierre(m) && m.account_code.startsWith('36')) continue;
      const clave = esOri(m, entrada.cuentas) && entrada.grupoNiif === 2 ? 'ori' : concepto === 'ori' ? 'otros' : concepto ?? 'otros';
      if (clave === 'otros' && netoCredito(m) !== 0) clasificar = true;
      agregarPatrimonio(porClave[clave], m.account_code, netoCredito(m));
    }
  }
  agregarPatrimonio(porClave.utilidad_periodo, '36', periodo.utilidadNeta);
  // Los saldos iniciales son históricos. La anulación posterior de una línea antigua
  // explica una variación de patrimonio distinta de la utilidad corriente, sin asumir 37.
  const anuladosAnteriores = movimientosContabilizados(entrada.movimientos).filter((m) =>
    m.anulado_desde && m.entry_date < periodo.desde
    && movimientosContabilizados([m], periodo.hasta).length !== movimientosContabilizados([m], periodo.desde, true).length);
  for (const m of anuladosAnteriores) {
    const factor = movimientosContabilizados([m], periodo.hasta).length - movimientosContabilizados([m], periodo.desde, true).length;
    if (m.account_code.startsWith('3')) agregarPatrimonio(porClave.anulaciones_anteriores, m.account_code, factor * netoCredito(m));
    else if (esResultado(m.account_code)) agregarPatrimonio(porClave.anulaciones_anteriores, '36', factor * netoCredito(m));
  }
  const final = porClave.saldo_final;
  for (const fila of filas.filter((f) => f.clave !== 'saldo_final')) {
    for (const columna of COLUMNAS_PATRIMONIO) agregarPatrimonio(final, columna, fila.valores[columna]);
  }
  const advertencias = clasificar ? ['Hay movimientos de patrimonio pendientes de clasificar; no se infirieron a partir del texto del asiento.'] : [];
  if (anuladosAnteriores.length > 0) advertencias.push('Los saldos iniciales conservan el estado histórico; las anulaciones posteriores se revelan en una fila separada sin modificar la utilidad corriente.');
  return { columnas: [...COLUMNAS_PATRIMONIO, 'total'], filas: entrada.grupoNiif === 3 ? filas.filter((f) => f.clave !== 'ori') : filas,
    saldoFinal: final.total, patrimonioBalance: periodo.patrimonio,
    diferencia: final.total - periodo.patrimonio, advertencias };
}

function esEquivalente(codigo: string, cuentas: CuentaInforme[]): boolean {
  if (!codigo.startsWith('12')) return false;
  const cuenta = cuentaDe(codigo, cuentas);
  return cuenta?.es_equivalente_efectivo === true
    && cuenta.plazo_meses != null && cuenta.plazo_meses >= 0 && cuenta.plazo_meses <= 3;
}
const esAcumuladaInversion = (codigo: string) => /^(1299|159|1698|1699|1898|1899)/.test(codigo);

function calcularFlujo(entrada: EntradaEstados, periodo: ResultadoPeriodo): ResultadoFlujo {
  const movimientos = movimientosContabilizados(entrada.movimientos, periodo.hasta).filter((m) => enPeriodo(m, periodo.desde, periodo.hasta) && !esCierre(m));
  const filas: FilaFlujo[] = [];
  const agregar = (clave: string, nombre: string, actividad: FilaFlujo['actividad'], valor: number) => filas.push({ clave, nombre, actividad, valor });
  const delta = (prefijo: string) => saldoPrefijo(periodo.saldosFinales, prefijo) - saldoPrefijo(periodo.saldosIniciales, prefijo);
  agregar('utilidad_neta', 'Utilidad neta del periodo', 'operacion', periodo.utilidadNeta);
  agregar('depreciacion_deterioro', 'Depreciación, amortización y deterioro — créditos en 1592, 1598, 1399 y 1499', 'operacion', depreciacion(movimientos));
  agregar('otras_provisiones', 'Otras provisiones sin salida de caja identificadas', 'operacion',
    sumar(movimientos.filter((m) => m.provision_sin_caja === true && /^2/.test(m.account_code)).map(netoCredito)));
  const ganancias = sumar(movimientos.filter((m) => m.account_code.startsWith('4245')).map(netoCredito));
  const perdidas = sumar(movimientos.filter((m) => m.account_code.startsWith('5310')).map((m) => m.debit - m.credit));
  agregar('ganancia_venta_activos', 'Menos utilidad en venta de activos — 4245', 'operacion', -ganancias);
  agregar('perdida_venta_activos', 'Más pérdida en venta de activos — 5310', 'operacion', perdidas);
  for (const prefijo of ['13', '14', '17']) agregar(`variacion_${prefijo}`, `Variación ${prefijo}${prefijo === '13' ? ' neta de 1399' : prefijo === '14' ? ' neta de 1499' : ''}`, 'operacion', -delta(prefijo));
  // Las variaciones se calcularon netas. Se elimina su efecto no monetario para no
  // sumar dos veces el deterioro que acaba de añadirse a la utilidad.
  const deterioroNeto = sumar(movimientos.filter((m) => /^(1399|1499)/.test(m.account_code)).map((m) => m.credit));
  agregar('deterioro_en_capital_trabajo', 'Deterioro incluido en variación neta de cartera e inventarios', 'operacion', -deterioroNeto);
  for (const prefijo of ['22', '23', '24', '25', '26', '27', '28']) {
    const cambio = delta(prefijo) - (prefijo === '23' ? delta('2360') : 0);
    agregar(`variacion_${prefijo}`, `Variación ${prefijo}${prefijo === '23' ? ' sin dividendos por pagar 2360' : ''}`, 'operacion', cambio);
  }
  const provisionesPasivo = sumar(movimientos.filter((m) => m.provision_sin_caja === true && /^(22|23|24|25|26|27|28)/.test(m.account_code) && !m.account_code.startsWith('2360')).map(netoCredito));
  agregar('provisiones_en_capital_trabajo', 'Provisiones no monetarias incluidas en variación de pasivos', 'operacion', -provisionesPasivo);

  const codigosInversion = new Set([...Object.keys(periodo.saldosIniciales), ...Object.keys(periodo.saldosFinales)].filter((codigo) => /^(12|15|16|18)/.test(codigo) && !esAcumuladaInversion(codigo) && !esEquivalente(codigo, entrada.cuentas)));
  let variacionInversion = 0;
  for (const codigo of codigosInversion) variacionInversion -= (periodo.saldosFinales[codigo] ?? 0) - (periodo.saldosIniciales[codigo] ?? 0);
  agregar('variacion_bruta_inversion', 'Variación bruta de inversiones, PPE, intangibles y otros activos — sin acumuladas ni equivalentes', 'inversion', variacionInversion);

  let cobroVentas = 0;
  let bajaBruta = 0;
  let pendientesVenta = false;
  let carteraVentaActivos = 0;
  let cobrosPosterioresInversion = 0;
  let cobrosPosterioresFinanciacion = 0;
  const avisosClasificacion: string[] = [];
  for (const lineas of agruparAsientos(movimientos)) {
    const venta = lineas.some((m) => /^(4245|5310)/.test(m.account_code));
    const bajas = lineas.filter((m) => codigosInversion.has(m.account_code) && m.credit > 0);
    const caja = lineas.filter((m) => m.account_code.startsWith('11') || esEquivalente(m.account_code, entrada.cuentas));
    const cartera = lineas.filter((m) => m.account_code.startsWith('13') && !m.account_code.startsWith('1399'));
    const ventaACredito = sumar(cartera.map((m) => m.debit - m.credit));
    const actividades = [...new Set(lineas.map((m) => m.cash_flow_activity).filter((a): a is NonNullable<MovimientoInforme['cash_flow_activity']> => !!a))];
    if (actividades.length > 1) avisosClasificacion.push('Un asiento tiene clasificaciones de flujo incompatibles; revise su marca antes de presentar el informe.');
    const actividadExplicita = actividades.length === 1 ? actividades[0] : null;
    if (actividadExplicita && actividadExplicita !== 'operacion' && bajas.length === 0) {
      // Un cobro posterior de PPE ya no contiene la cuenta 15. Solo la marca del
      // contador permite diferenciarlo de un cobro comercial sobre la misma 13.
      // Se mueve el efectivo neto del asiento completo (incluye descuentos/gastos
      // ordinarios de ese cobro), sin atribuirlo por tercero ni buscar importes iguales.
      const compatible = cartera.length > 0 && lineas.every((m) => m.account_code.startsWith('11')
        || esEquivalente(m.account_code, entrada.cuentas)
        || (m.account_code.startsWith('13') && !m.account_code.startsWith('1399'))
        || (esResultado(m.account_code) && !/^(4245|5310)/.test(m.account_code)));
      const efectivoCobrado = sumar(caja.map((m) => m.debit - m.credit));
      if (compatible) {
        if (actividadExplicita === 'inversion') cobrosPosterioresInversion += efectivoCobrado;
        else cobrosPosterioresFinanciacion += efectivoCobrado;
      } else if (efectivoCobrado !== 0) avisosClasificacion.push('La marca de actividad corresponde a un asiento mixto que no es un cobro de cartera; revise su clasificación de efectivo.');
    }
    if (bajas.length > 0 && (venta || ventaACredito > 0 || caja.some((m) => m.debit > m.credit))) {
      cobroVentas += sumar(caja.map((m) => m.debit - m.credit));
      bajaBruta += sumar(bajas.map((m) => m.credit));
      if (ventaACredito > 0) {
        carteraVentaActivos += ventaACredito;
        pendientesVenta = true;
      }
      if (caja.length === 0) pendientesVenta = true;
    }
  }
  // La baja de un activo no es un cobro: se retira de la variación bruta y se
  // presenta el importe efectivamente recibido en 11/equivalentes.
  agregar('cartera_venta_activos', 'Cartera por venta de activos excluida del capital de trabajo operativo', 'operacion', carteraVentaActivos);
  agregar('baja_activos_vendidos', 'Baja bruta de activos vendidos incluida en la variación', 'inversion', -bajaBruta);
  agregar('cobro_venta_activos', 'Efectivo recibido por venta de activos', 'inversion', cobroVentas);
  agregar('reclasificacion_cobros_cartera', 'Cobros de cartera clasificados expresamente fuera de operación', 'operacion', -cobrosPosterioresInversion - cobrosPosterioresFinanciacion);
  agregar('cobros_posteriores_inversion', 'Cobros posteriores de cartera de inversión identificados por el contador', 'inversion', cobrosPosterioresInversion);
  agregar('cobros_posteriores_financiacion', 'Cobros posteriores de cartera de financiación identificados por el contador', 'financiacion', cobrosPosterioresFinanciacion);
  agregar('obligaciones_financieras', 'Variación de obligaciones financieras — 21', 'financiacion', delta('21'));
  agregar('aportes', 'Aportes — variación de 31 y 32', 'financiacion', delta('31') + delta('32'));
  let decretados = 0;
  for (const lineas of agruparAsientos(movimientos)) {
    if (conceptoAsiento(lineas) === 'dividendos_efectivo') decretados += sumar(lineas.filter((m) => m.account_code.startsWith('37')).map((m) => m.debit - m.credit));
  }
  const dividendosPagados = decretados - delta('2360');
  agregar('dividendos_pagados', 'Dividendos pagados — decretados menos aumento de 2360', 'financiacion', -dividendosPagados);
  const efectivo = (saldos: Record<string, number>) => sumar(Object.entries(saldos).filter(([codigo]) => codigo.startsWith('11') || esEquivalente(codigo, entrada.cuentas)).map(([, valor]) => valor));
  const efectivoInicial = efectivo(periodo.saldosIniciales);
  const efectivoFinal = efectivo(periodo.saldosFinales);
  const operacion = sumar(filas.filter((f) => f.actividad === 'operacion').map((f) => f.valor));
  const inversion = sumar(filas.filter((f) => f.actividad === 'inversion').map((f) => f.valor));
  const financiacion = sumar(filas.filter((f) => f.actividad === 'financiacion').map((f) => f.valor));
  const flujoNeto = operacion + inversion + financiacion;
  const variacionEfectivo = efectivoFinal - efectivoInicial;
  const advertencias: string[] = [...avisosClasificacion];
  if (pendientesVenta) advertencias.push('Hay ventas de activos a crédito o sin cobro identificable en el mismo asiento. Se excluyó la cartera reconocida de operación; revise y clasifique sus cobros posteriores como inversión.');
  if (entrada.cuentas.some((c) => c.es_equivalente_efectivo && (c.plazo_meses == null || c.plazo_meses > 3 || c.plazo_meses < 0))) advertencias.push('Una inversión marcada como equivalente no tiene plazo válido de hasta tres meses y se excluyó de los equivalentes.');
  const diferencia = flujoNeto - variacionEfectivo;
  if (Math.abs(diferencia) > 0.005) advertencias.push('El flujo calculado difiere de la variación de efectivo; revise reclasificaciones, operaciones sin efectivo y ventas de activos antes de presentarlo.');
  return { filas, operacion, inversion, financiacion, flujoNeto, efectivoInicial, efectivoFinal, variacionEfectivo, diferencia, advertencias };
}

function validarImportesResultado(valor: unknown): void {
  if (typeof valor === 'number' && !Number.isFinite(valor)) throw new Error('El agregado del informe excede el rango numérico admitido.');
  if (valor && typeof valor === 'object') Object.values(valor).forEach(validarImportesResultado);
}

export function generarEstados(entrada: EntradaEstados) {
  validarFecha(entrada.desde);
  validarFecha(entrada.hasta);
  if (entrada.desde > entrada.hasta) throw new Error('La fecha inicial no puede ser posterior al corte.');
  if (![2, 3].includes(entrada.grupoNiif)) throw new Error('El grupo NIIF debe ser 2 o 3.');
  for (const m of entrada.movimientos) {
    validarFecha(m.entry_date);
    if (m.anulado_desde) validarFecha(m.anulado_desde);
    if (m.anulado_hasta) validarFecha(m.anulado_hasta);
    if (m.cash_flow_activity && !['operacion', 'inversion', 'financiacion'].includes(m.cash_flow_activity)) throw new Error('La clasificación de actividad del flujo no es válida.');
    if (!/^\d+$/.test(codigoNormalizado(m.account_code)) || !Number.isFinite(m.debit) || !Number.isFinite(m.credit) || m.debit < 0 || m.credit < 0) throw new Error('El movimiento contable contiene una cuenta o un importe inválido.');
  }
  const actual = calcularPeriodo(entrada, entrada.desde, entrada.hasta);
  const anterior = calcularPeriodo(entrada, fechaAnoAnterior(entrada.desde), fechaAnoAnterior(entrada.hasta));
  const situacion = [comparar('1', 'Activo', actual.activo, anterior.activo), comparar('2', 'Pasivo', actual.pasivo, anterior.pasivo), comparar('3', 'Patrimonio', actual.patrimonio, anterior.patrimonio)];
  const resultados = [
    comparar('ventas_netas', 'Ventas netas', actual.ventasNetas, anterior.ventasNetas),
    comparar('costo_ventas', 'Costo de ventas', actual.costoVentas, anterior.costoVentas),
    comparar('utilidad_bruta', 'Utilidad bruta', actual.ventasNetas - actual.costoVentas, anterior.ventasNetas - anterior.costoVentas),
    comparar('gastos_operacionales', 'Gastos operacionales', actual.gastosOperacionales, anterior.gastosOperacionales),
    comparar('utilidad_operacional', 'Utilidad operacional', actual.utilidadOperacional, anterior.utilidadOperacional),
    comparar('otros_ingresos', 'Otros ingresos', actual.ingresos - actual.ventasNetas, anterior.ingresos - anterior.ventasNetas),
    comparar('costo_produccion', 'Costos de producción — clase 7', actual.costoProduccion, anterior.costoProduccion),
    comparar('gastos_no_operacionales', 'Gastos no operacionales', actual.gastosNoOperacionales, anterior.gastosNoOperacionales),
    comparar('impuesto_renta', 'Impuesto de renta — 54', actual.impuestoRenta, anterior.impuestoRenta),
    comparar('utilidad_neta', 'Utilidad neta', actual.utilidadNeta, anterior.utilidadNeta),
  ];
  if (entrada.grupoNiif === 2) resultados.push(comparar('ori', 'Otro resultado integral — auxiliares 38 marcados ORI', actual.ori ?? 0, anterior.ori ?? 0), comparar('resultado_integral', 'Resultado integral total', actual.resultadoIntegral, anterior.resultadoIntegral));
  const patrimonio = calcularPatrimonio(entrada, actual);
  const patrimonioAnterior = calcularPatrimonio(entrada, anterior);
  const flujoIndirecto = calcularFlujo(entrada, actual);
  const flujoIndirectoAnterior = calcularFlujo(entrada, anterior);
  const informe = { actual, anterior, situacion, resultados, patrimonio, patrimonioAnterior, flujoIndirecto, flujoIndirectoAnterior,
    advertencias: [...new Set([...patrimonio.advertencias, ...flujoIndirecto.advertencias,
      ...(entrada.movimientos.some((m) => m.anulado_desde && m.anulado_desde >= entrada.desde && m.anulado_desde <= entrada.hasta && m.entry_date < entrada.desde) ? ['Hay asientos de periodos anteriores anulados en el periodo actual; los saldos iniciales conservan el estado histórico y pueden requerir conciliación con los saldos finales.'] : []),
      ...(Math.abs(actual.diferenciaBalance) > 0.005 ? ['El estado de situación financiera presenta una diferencia contable.'] : []),
      ...(Math.abs(patrimonio.diferencia) > 0.005 ? ['El estado de cambios en el patrimonio difiere del patrimonio del balance.'] : [])])] };
  validarImportesResultado(informe);
  return informe;
}
