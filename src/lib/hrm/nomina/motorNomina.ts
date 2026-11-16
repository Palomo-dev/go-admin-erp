/**
 * Motor de nómina de RR. HH. (ADR-003 §3). Calcula la colilla de un vínculo en
 * un período a partir de insumos completos: salario por tramos del historial,
 * horas y novedades aprobadas de la jornada (fase 2), novedades de nómina,
 * comisiones, préstamos, embargos y parámetros por vigencia.
 *
 * Puro y determinista: la misma entrada da la misma colilla y la misma huella.
 * Todo valor en pesos se redondea al crearse (al peso, salvo el IBC al peso
 * superior y la retención al múltiplo de `retencion_redondeo_cop`), y los totales
 * son sumas de valores ya redondeados: la colilla, el asiento y la nómina
 * electrónica cuadran sin diferencias de centavos.
 */
import {
  aPeso,
  aPesoSuperior,
  dias360,
  diasDe,
  esFinDeMes,
  huella,
  maxFecha,
  minFecha,
  num,
  numOpcional,
  pesoDia360,
  promedioDiario,
  sumaDiaria,
  tabla,
  VERSION_MOTOR_NOMINA,
  type ParametrosNomina,
} from './base';
import { concepto, type Catalogo, type Concepto } from './conceptos';
import { fraccionExentaCesantias, retencionMensual, type DatosRetencion, type ResultadoRetencion } from './retencion';
import { aplicarDeducciones, type Embargo, type CuotaPrestamo, type DescuentoAutorizado } from './deducciones';

export type TipoPeriodo = 'ordinaria' | 'prima' | 'cesantias';
export type PeriodoSalario = 'monthly' | 'biweekly' | 'weekly' | 'daily' | 'hourly';
export type TipoItem = 'earning' | 'deduction' | 'employer_cost' | 'info';

export interface TramoSalario {
  desde: string;
  hasta: string;
  /** Valor en la periodicidad del vínculo (mensual, quincenal, semanal, diario o por hora). */
  valor: number;
}

export interface LineaHoras {
  fecha: string;
  categoria: string;
  recargo: number;
  divisor: number;
  minutos: number;
}

export interface TramoAusencia {
  desde: string;
  hasta: string;
  paga: string | null;
  fraccion: number;
  piso?: string | null;
}

export interface Ausencia {
  id: string;
  clase: string;
  pagada: boolean;
  desde: string;
  hasta: string;
  tramos: TramoAusencia[];
}

export interface NovedadNomina {
  id: string;
  concepto: string;
  /** Valor en pesos; si no viene, se calcula con `cantidad` (días de vacaciones compensadas). */
  valor?: number | null;
  cantidad?: number | null;
  descripcion?: string | null;
}

export interface Acumulado {
  /** Rango de la liquidación de prima o cesantías (puede empezar antes del ingreso). */
  desde: string;
  hasta: string;
  /** Pagos variables prestacionales (extras, recargos, comisiones…) del rango, ya liquidados. */
  variables: number;
  /** Días de licencia no remunerada del rango (suspenden el tiempo de servicio). */
  dias_no_remunerados: number;
  /** Cesantías ya liquidadas en el rango (anticipos o pagos parciales). */
  ya_pagado?: number;
}

export interface EntradaColilla {
  vinculo_id: string;
  sede_id: number | null;
  periodo: { id?: string; desde: string; hasta: string; tipo: TipoPeriodo };
  vinculo: {
    ingreso: string;
    retiro: string | null;
    integral: boolean;
    periodo_salario: PeriodoSalario;
    /** Teletrabajo: el auxilio de transporte se paga como auxilio de conectividad. */
    remoto?: boolean;
  };
  salario: TramoSalario[];
  clase_arl: number;
  /** Bandera de la organización (art. 114-1). `null` = no configurada: no se exonera y se avisa. */
  exoneracion_114_1: boolean | null;
  parametros: ParametrosNomina;
  conceptos: Catalogo;
  horas: LineaHoras[];
  descuentos_tiempo: Array<{ fecha: string; tipo: string; minutos: number }>;
  ausencias: Ausencia[];
  novedades: NovedadNomina[];
  comisiones: Array<{ id: string; valor: number }>;
  prestamos: CuotaPrestamo[];
  embargos: Embargo[];
  retencion: DatosRetencion;
  /** Lo ya liquidado en el mismo mes por otros períodos (quincena anterior). */
  mes_previo?: { ingresos_retencion: number; incr: number; retencion: number } | null;
  /** Promedio mensual de lo variable del último año (base de vacaciones). */
  promedio_variable_mensual?: number;
  acumulado?: Acumulado | null;
  /** Colilla del período anterior, para las alertas de variación. */
  anterior?: { devengado: number; neto: number } | null;
}

export interface Item {
  tipo: TipoItem;
  codigo: string;
  nombre: string;
  valor: number;
  cantidad?: number;
  tasa?: number;
  base?: number;
  fuente?: { tipo: string; id: string };
  detalle?: Record<string, unknown>;
}

export type Severidad = 'aviso' | 'bloqueo';
export interface AlertaNomina {
  codigo: string;
  severidad: Severidad;
  detalle?: Record<string, unknown>;
}

export interface ResultadoColilla {
  vinculo_id: string;
  sede_id: number | null;
  version_motor: string;
  items: Item[];
  totales: {
    devengado: number;
    deducciones: number;
    neto: number;
    aportes_empleador: number;
    provisiones: number;
    costo_empleador: number;
  };
  bases: {
    salario_mensual: number;
    dias_periodo: number;
    dias_trabajados: number;
    ibc: number;
    ibc_minimo: number;
    ibc_maximo: number;
    exceso_40: number;
    base_parafiscales: number;
    base_prestaciones: number;
    exonerado_114_1: boolean;
    retencion: ResultadoRetencion | null;
  };
  columnas: Record<string, number>;
  comision_ids: string[];
  alertas: AlertaNomina[];
  huella_entrada: string;
}

const ROMANOS = ['', 'I', 'II', 'III', 'IV', 'V'];

const CONCEPTO_HORAS: Record<string, string> = {
  ord_nocturna: 'RECARGO_NOCTURNO',
  dom_diurna: 'RECARGO_DOMINICAL',
  dom_nocturna: 'RECARGO_DOMINICAL_NOCTURNO',
  extra_diurna: 'HORA_EXTRA_DIURNA',
  extra_nocturna: 'HORA_EXTRA_NOCTURNA',
  extra_dom_diurna: 'HORA_EXTRA_DOMINICAL_DIURNA',
  extra_dom_nocturna: 'HORA_EXTRA_DOMINICAL_NOCTURNA',
};

const CONCEPTO_AUSENCIA: Record<string, string> = {
  vacaciones: 'VACACIONES_DISFRUTADAS',
  incapacidad_comun: 'INCAPACIDAD_COMUN',
  incapacidad_laboral: 'INCAPACIDAD_LABORAL',
  maternidad: 'LICENCIA_MATERNIDAD',
  paternidad: 'LICENCIA_PATERNIDAD',
  luto: 'LICENCIA_REMUNERADA',
  calamidad: 'LICENCIA_REMUNERADA',
  licencia_remunerada: 'LICENCIA_REMUNERADA',
};

/** Salario mensual equivalente según la periodicidad del vínculo. */
export function aMensual(valor: number, periodo: PeriodoSalario, divisorHora: number): number {
  switch (periodo) {
    case 'monthly':
      return valor;
    case 'biweekly':
      return valor * 2;
    case 'weekly':
      return (valor * 30) / 7;
    case 'daily':
      return valor * 30;
    case 'hourly':
      return valor * divisorHora;
  }
}

class Colilla {
  readonly items: Item[] = [];
  readonly alertas: AlertaNomina[] = [];
  constructor(private readonly cat: Catalogo) {}

  c(codigo: string): Concepto {
    return concepto(this.cat, codigo);
  }

  agregar(tipo: TipoItem, codigo: string, valor: number, extra: Omit<Item, 'tipo' | 'codigo' | 'nombre' | 'valor'> = {}): Item | null {
    const v = aPeso(valor);
    if (v === 0) return null;
    const it: Item = { tipo, codigo, nombre: this.c(codigo).nombre, valor: v, ...extra };
    this.items.push(it);
    return it;
  }

  alerta(codigo: string, severidad: Severidad, detalle?: Record<string, unknown>) {
    this.alertas.push(detalle ? { codigo, severidad, detalle } : { codigo, severidad });
  }

  devengados(): Item[] {
    return this.items.filter((i) => i.tipo === 'earning');
  }

  suma(filtro: (c: Concepto, i: Item) => boolean): number {
    return this.devengados().reduce((s, i) => (filtro(this.c(i.codigo), i) ? s + i.valor : s), 0);
  }
}

/** Días del rango en que el vínculo está vigente. */
function rangoVigente(e: EntradaColilla): { desde: string; hasta: string } | null {
  const desde = maxFecha(e.periodo.desde, e.vinculo.ingreso);
  const hasta = e.vinculo.retiro ? minFecha(e.periodo.hasta, e.vinculo.retiro) : e.periodo.hasta;
  return hasta < desde ? null : { desde, hasta };
}

function salarioEn(e: EntradaColilla, fecha: string): number | null {
  for (const t of e.salario) if (t.desde <= fecha && fecha <= t.hasta) return t.valor;
  return null;
}

function divisorEn(e: EntradaColilla, fecha: string): number {
  return num(e.parametros, 'divisor_hora_mensual', fecha);
}

/** Salario mensual equivalente vigente en una fecha. Falla si el historial no cubre la fecha. */
function mensualEn(e: EntradaColilla, fecha: string): number {
  const v = salarioEn(e, fecha);
  if (v === null) throw new Error(`salario_sin_vigencia: ${e.vinculo_id} en ${fecha}`);
  return aMensual(v, e.vinculo.periodo_salario, divisorEn(e, fecha));
}

/** Día cubierto por una ausencia (devuelve la ausencia y el tramo de pago). */
function ausenciaDelDia(e: EntradaColilla, fecha: string): { a: Ausencia; t: TramoAusencia | null } | null {
  for (const a of e.ausencias) {
    if (a.desde <= fecha && fecha <= a.hasta) {
      const t = a.tramos.find((x) => x.desde <= fecha && fecha <= x.hasta) ?? null;
      return { a, t };
    }
  }
  return null;
}

/** Día sin pago: licencia no remunerada o ausencia sin tramo de pago. */
function esNoRemunerado(e: EntradaColilla, fecha: string): boolean {
  const aus = ausenciaDelDia(e, fecha);
  if (!aus) return false;
  return !aus.a.pagada || !CONCEPTO_AUSENCIA[aus.a.clase] || !aus.t || !aus.t.fraccion;
}

// ---------------------------------------------------------------------------
// Período ordinario
// ---------------------------------------------------------------------------

function devengadosOrdinarios(e: EntradaColilla, col: Colilla, vig: { desde: string; hasta: string }) {
  const p = e.parametros;
  const porHora = e.vinculo.periodo_salario === 'hourly';
  const codSalario = e.vinculo.integral ? 'SALARIO_INTEGRAL' : 'SALARIO';

  // 1. Salario por días y pago de ausencias, día por día con el salario y los parámetros de cada fecha.
  let salario = 0;
  let diasSalario = 0;
  let diasTransporte = 0;
  const porAusencia = new Map<string, { valor: number; dias: number; ausencia: string; paga: string | null }>();
  const noRemunerados: string[] = [];
  for (const f of diasDe(vig.desde, vig.hasta)) {
    const w = pesoDia360(f);
    if (!w) continue;
    const mensual = mensualEn(e, f);
    const diario = mensual / 30;
    const aus = ausenciaDelDia(e, f);
    if (!aus) {
      if (!porHora) {
        salario += diario * w;
        diasSalario += w;
      }
      diasTransporte += w;
      continue;
    }
    const codigo = CONCEPTO_AUSENCIA[aus.a.clase];
    if (!aus.a.pagada || !codigo || !aus.t || !aus.t.fraccion) {
      noRemunerados.push(f);
      continue;
    }
    let base = diario;
    if (aus.a.clase === 'vacaciones') base = diario + (e.promedio_variable_mensual ?? 0) / 30;
    let valor = base * aus.t.fraccion;
    if (aus.t.piso === 'smmlv_diario') valor = Math.max(valor, num(p, 'smmlv', f) / 30);
    // Un ítem por ausencia y por quién paga: lo que paga la EPS o la ARL se recobra.
    const k = `${codigo}|${aus.a.id}|${aus.t.paga ?? ''}`;
    const prev = porAusencia.get(k) ?? { valor: 0, dias: 0, ausencia: aus.a.id, paga: aus.t.paga ?? null };
    prev.valor += valor * w;
    prev.dias += w;
    porAusencia.set(k, prev);
  }
  if (!porHora) col.agregar('earning', codSalario, salario, { cantidad: diasSalario });
  for (const [k, v] of porAusencia) {
    const codigo = k.split('|')[0];
    col.agregar('earning', codigo, v.valor, { cantidad: v.dias, fuente: { tipo: 'leave_requests', id: v.ausencia }, detalle: { paga: v.paga } });
  }
  if (noRemunerados.length) col.alerta('licencia_no_remunerada', 'aviso', { dias: noRemunerados.length });

  // 2. Horas de la jornada: la ordinaria va con el salario (solo su recargo); la extra se paga completa.
  const porConcepto = new Map<string, { valor: number; minutos: number }>();
  for (const h of e.horas) {
    if (h.minutos <= 0 || h.fecha < vig.desde || h.fecha > vig.hasta) continue;
    if (e.vinculo.integral) {
      col.alerta('integral_con_horas', 'aviso', { categoria: h.categoria });
      continue;
    }
    const valorHora = porHora ? (salarioEn(e, h.fecha) ?? 0) : mensualEn(e, h.fecha) / h.divisor;
    const esExtra = h.categoria.startsWith('extra');
    let codigo = CONCEPTO_HORAS[h.categoria];
    let factor = esExtra ? 1 + h.recargo : h.recargo;
    if (porHora && !esExtra) {
      // Por hora no hay salario que cubra la ordinaria: se paga la hora y aparte su recargo.
      const ordinaria = porConcepto.get('SALARIO_HORAS') ?? { valor: 0, minutos: 0 };
      ordinaria.valor += (h.minutos / 60) * valorHora;
      ordinaria.minutos += h.minutos;
      porConcepto.set('SALARIO_HORAS', ordinaria);
      factor = h.recargo;
    }
    if (!codigo || factor === 0) continue;
    const acc = porConcepto.get(codigo) ?? { valor: 0, minutos: 0 };
    acc.valor += (h.minutos / 60) * valorHora * factor;
    acc.minutos += h.minutos;
    porConcepto.set(codigo, acc);
  }
  for (const [codigo, v] of porConcepto) {
    col.agregar('earning', codigo, v.valor, { cantidad: Math.round((v.minutos / 60) * 100) / 100 });
  }

  // 3. Tiempo no trabajado sin justificar (novedades rechazadas de la fase 2).
  let descuentoTiempo = 0;
  let minutosDescuento = 0;
  for (const d of e.descuentos_tiempo) {
    if (d.fecha < vig.desde || d.fecha > vig.hasta || d.minutos <= 0) continue;
    descuentoTiempo += (d.minutos / 60) * (mensualEn(e, d.fecha) / divisorEn(e, d.fecha));
    minutosDescuento += d.minutos;
  }
  if (descuentoTiempo > 0) col.agregar('earning', 'DESCUENTO_TIEMPO', -descuentoTiempo, { cantidad: Math.round((minutosDescuento / 60) * 100) / 100 });

  // 4. Comisiones causadas (fn_comisiones_pagar_por_nomina las marca pagadas al pagar la colilla).
  const totalComisiones = e.comisiones.reduce((s, c) => s + Math.max(0, c.valor), 0);
  if (totalComisiones > 0) col.agregar('earning', 'COMISIONES', totalComisiones, { cantidad: e.comisiones.length });

  // 5. Novedades de nómina aprobadas.
  for (const n of e.novedades) {
    const c = col.c(n.concepto);
    let valor = n.valor ?? null;
    if ((valor === null || valor === undefined) && n.concepto === 'VACACIONES_COMPENSADAS' && n.cantidad) {
      valor = ((mensualEn(e, vig.hasta) + (e.promedio_variable_mensual ?? 0)) / 30) * n.cantidad;
    }
    if (valor === null || valor === undefined || !Number.isFinite(valor)) {
      col.alerta('novedad_sin_valor', 'bloqueo', { novedad: n.id, concepto: n.concepto });
      continue;
    }
    const tipo: TipoItem = c.tipo === 'deduccion' ? 'deduction' : 'earning';
    if (tipo === 'deduction') continue; // los descuentos autorizados van por `aplicarDeducciones`
    col.agregar(tipo, n.concepto, valor, { cantidad: n.cantidad ?? undefined, fuente: { tipo: 'hr_payroll_novelties', id: n.id } });
  }

  // 6. Auxilio de transporte: hasta 2 SMMLV de salario, por los días efectivamente trabajados.
  let auxilio = 0;
  if (!e.vinculo.integral) {
    for (const f of diasDe(vig.desde, vig.hasta)) {
      const w = pesoDia360(f);
      if (!w || ausenciaDelDia(e, f)) continue;
      const tope = num(p, 'auxilio_transporte_tope_smmlv', f) * num(p, 'smmlv', f);
      if (mensualEn(e, f) <= tope) auxilio += (num(p, 'auxilio_transporte', f) / 30) * w;
    }
  }
  if (auxilio > 0) {
    col.agregar('earning', 'AUXILIO_TRANSPORTE', auxilio, {
      cantidad: diasTransporte,
      detalle: e.vinculo.remoto ? { como: 'auxilio_conectividad' } : undefined,
    });
  }
}

interface Aportes {
  ibc: number;
  ibcMinimo: number;
  ibcMaximo: number;
  exceso40: number;
  baseParafiscales: number;
  exonerado: boolean;
}

function seguridadSocial(e: EntradaColilla, col: Colilla, vig: { desde: string; hasta: string }): Aportes {
  const p = e.parametros;
  const fin = vig.hasta;
  // Los días de licencia no remunerada no se cotizan ni cuentan para el piso del IBC.
  const cotiza = (f: string) => !esNoRemunerado(e, f);
  const diasCotizados = sumaDiaria(vig.desde, vig.hasta, (f) => (cotiza(f) ? 1 : 0));
  const factorIntegral = e.vinculo.integral ? num(p, 'salario_integral_factor_ibc', fin) : 1;

  // Base salarial y regla del 40 % (Ley 1393, art. 30).
  const salarialSS = col.suma((c) => c.base_ss);
  const baseSalarial = salarialSS * factorIntegral;
  const noSalarial40 = col.suma((c) => c.cuenta_40);
  const total = baseSalarial + noSalarial40;
  const tope40 = num(p, 'ibc_no_salarial_tope_pct', fin);
  const exceso40 = Math.max(0, noSalarial40 - tope40 * total);

  // Topes del IBC, con el SMMLV de cada día.
  const ibcMinimo = sumaDiaria(vig.desde, vig.hasta, (f) => (cotiza(f) ? num(p, 'smmlv', f) / 30 : 0));
  const ibcMaximo = sumaDiaria(vig.desde, vig.hasta, (f) => (cotiza(f) ? (num(p, 'ibc_tope_smmlv', f) * num(p, 'smmlv', f)) / 30 : 0));
  let ibc = aPesoSuperior(baseSalarial + exceso40);
  if (diasCotizados > 0) {
    if (ibc < ibcMinimo) {
      col.alerta('ibc_ajustado_al_minimo', 'aviso', { ibc_calculado: ibc });
      ibc = aPesoSuperior(ibcMinimo);
    }
    if (ibc > ibcMaximo) ibc = aPeso(ibcMaximo);
  }
  if (exceso40 > 0) col.alerta('no_salarial_supera_40', 'aviso', { exceso: aPeso(exceso40) });

  const tasa = (codigo: string) => promedioDiario(p, codigo, vig.desde, vig.hasta);

  // Aportes del trabajador.
  col.agregar('deduction', 'SALUD_EMPLEADO', ibc * tasa('aporte_salud_trabajador'), { base: ibc, tasa: tasa('aporte_salud_trabajador') });
  col.agregar('deduction', 'PENSION_EMPLEADO', ibc * tasa('aporte_pension_trabajador'), { base: ibc, tasa: tasa('aporte_pension_trabajador') });

  // Fondo de solidaridad: IBC mensual en SMMLV, contra la tabla vigente al corte.
  const smmlvFin = num(p, 'smmlv', fin);
  const enSmmlv = diasCotizados > 0 ? (ibc / diasCotizados) * 30 / smmlvFin : 0;
  const fsp = tabla<Array<{ desde_smmlv: number; hasta_smmlv: number | null; tarifa: number }>>(p, 'fsp_tabla', fin);
  const fila = fsp.find((r) => enSmmlv >= r.desde_smmlv && (r.hasta_smmlv === null || enSmmlv < r.hasta_smmlv));
  if (fila) col.agregar('deduction', 'FONDO_SOLIDARIDAD', ibc * fila.tarifa, { base: ibc, tasa: fila.tarifa, detalle: { ibc_en_smmlv: Math.round(enSmmlv * 100) / 100 } });

  // Exoneración del art. 114-1: bandera del empleador y devengado del mes < umbral; nunca al integral.
  const devengadoTotal = col.devengados().reduce((s, i) => s + i.valor, 0);
  const devengadoMensual = diasCotizados > 0 ? (devengadoTotal / diasCotizados) * 30 : devengadoTotal;
  if (e.exoneracion_114_1 === null) col.alerta('exoneracion_114_1_sin_configurar', 'aviso');
  const exonerado =
    e.exoneracion_114_1 === true &&
    !e.vinculo.integral &&
    devengadoMensual < num(p, 'exoneracion_114_1_umbral_smmlv', fin) * smmlvFin;

  // Aportes del empleador.
  if (!exonerado) col.agregar('employer_cost', 'SALUD_EMPLEADOR', ibc * tasa('aporte_salud_empleador'), { base: ibc, tasa: tasa('aporte_salud_empleador') });
  col.agregar('employer_cost', 'PENSION_EMPLEADOR', ibc * tasa('aporte_pension_empleador'), { base: ibc, tasa: tasa('aporte_pension_empleador') });
  const clase = ROMANOS[e.clase_arl] ?? 'I';
  const arl = tabla<Record<string, { inicial: number }>>(p, 'arl_tarifas', fin)[clase];
  if (!arl) throw new Error(`arl_clase_invalida: ${e.clase_arl}`);
  col.agregar('employer_cost', 'ARL', ibc * arl.inicial, { base: ibc, tasa: arl.inicial, detalle: { clase } });

  // Parafiscales: «nómina de salarios» (sin el tope de 25 SMMLV ni la regla del 40 %).
  const baseParafiscales = aPesoSuperior(col.suma((c) => c.base_parafiscales) * factorIntegral);
  col.agregar('employer_cost', 'CAJA_COMPENSACION', baseParafiscales * tasa('aporte_ccf'), { base: baseParafiscales, tasa: tasa('aporte_ccf') });
  if (!exonerado) {
    col.agregar('employer_cost', 'ICBF', baseParafiscales * tasa('aporte_icbf'), { base: baseParafiscales, tasa: tasa('aporte_icbf') });
    col.agregar('employer_cost', 'SENA', baseParafiscales * tasa('aporte_sena'), { base: baseParafiscales, tasa: tasa('aporte_sena') });
  }
  return { ibc, ibcMinimo: aPeso(ibcMinimo), ibcMaximo: aPeso(ibcMaximo), exceso40: aPeso(exceso40), baseParafiscales, exonerado };
}

function provisiones(e: EntradaColilla, col: Colilla): number {
  const p = e.parametros;
  const fin = e.periodo.hasta;
  const basePrest = col.suma((c) => c.prestacional);
  // Vacaciones: salario ordinario, sin auxilio de transporte ni extras (CST 192).
  const baseVac = col.suma((_c, i) => ['SALARIO', 'SALARIO_INTEGRAL', 'SALARIO_HORAS', 'DESCUENTO_TIEMPO', 'LICENCIA_REMUNERADA'].includes(i.codigo) || i.codigo === 'VACACIONES_DISFRUTADAS');
  const diasVac = num(p, 'vacaciones_dias_habiles_anio', fin);
  if (!e.vinculo.integral) {
    const ces = basePrest / 12;
    col.agregar('employer_cost', 'PROVISION_CESANTIAS', ces, { base: basePrest, tasa: 1 / 12 });
    col.agregar('employer_cost', 'PROVISION_INTERESES', ces * num(p, 'intereses_cesantias_tasa', fin), { base: aPeso(ces), tasa: num(p, 'intereses_cesantias_tasa', fin) });
    col.agregar('employer_cost', 'PROVISION_PRIMA', basePrest / 12, { base: basePrest, tasa: 1 / 12 });
  }
  col.agregar('employer_cost', 'PROVISION_VACACIONES', (baseVac * diasVac) / 360, { base: baseVac, tasa: diasVac / 360 });
  return basePrest;
}

function retencion(e: EntradaColilla, col: Colilla, extraExento = 0): ResultadoRetencion | null {
  const fin = e.periodo.hasta;
  // La retención es mensual: se calcula en el período que cierra el mes, con lo del mes.
  if (e.periodo.tipo === 'ordinaria' && !esFinDeMes(fin)) return null;
  const ingresos = col.suma((c) => c.base_retencion) - extraExento;
  const incr = col.items
    .filter((i) => ['SALUD_EMPLEADO', 'PENSION_EMPLEADO', 'FONDO_SOLIDARIDAD'].includes(i.codigo))
    .reduce((s, i) => s + i.valor, 0);
  const previo = e.periodo.tipo === 'ordinaria' ? e.mes_previo : null;
  let r: ResultadoRetencion;
  try {
    r = retencionMensual(e.parametros, {
      fecha: fin,
      ingresos: ingresos + (previo?.ingresos_retencion ?? 0),
      incr: incr + (previo?.incr ?? 0),
      datos: e.retencion,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'porcentaje_fijo_faltante') {
      col.alerta('retencion_porcentaje_fijo_faltante', 'bloqueo');
      return null;
    }
    throw err;
  }
  const aRetener = Math.max(0, r.retencion_mes - (previo?.retencion ?? 0));
  col.agregar('deduction', 'RETENCION_FUENTE', aRetener, {
    base: aPeso(r.depuracion.base),
    tasa: r.porcentaje ?? undefined,
    detalle: { procedimiento: r.procedimiento, retenido_antes_en_el_mes: previo?.retencion ?? 0 },
  });
  return r;
}

// ---------------------------------------------------------------------------
// Prima y cesantías
// ---------------------------------------------------------------------------

/**
 * Base mensual de prima o cesantías: salario (el último, o el promedio del rango
 * si cambió en los últimos 3 meses, CST 253) + promedio de lo variable + auxilio
 * de transporte si al corte tiene derecho.
 */
export function basePrestacional(e: EntradaColilla, desde: string, hasta: string, variables: number, dias: number): { salario: number; variable: number; auxilio: number; total: number; promedio: boolean } {
  const p = e.parametros;
  const ultimo = mensualEn(e, hasta);
  // Los últimos 3 meses calendario, incluido el del corte.
  let anio = Number(hasta.slice(0, 4));
  let mes = Number(hasta.slice(5, 7)) - 2;
  if (mes <= 0) {
    mes += 12;
    anio -= 1;
  }
  const tresMeses = maxFecha(desde, `${anio}-${String(mes).padStart(2, '0')}-01`);
  let cambio = false;
  for (const f of diasDe(tresMeses, hasta)) {
    if (salarioEn(e, f) !== null && Math.abs(mensualEn(e, f) - ultimo) > 0.005) {
      cambio = true;
      break;
    }
  }
  let salario = ultimo;
  if (cambio) {
    const d = dias360(desde, hasta);
    salario = d > 0 ? sumaDiaria(desde, hasta, (f) => (salarioEn(e, f) === null ? 0 : mensualEn(e, f) / 30)) / d * 30 : ultimo;
  }
  const variable = dias > 0 ? (variables / dias) * 30 : 0;
  const auxilio = ultimo <= num(p, 'auxilio_transporte_tope_smmlv', hasta) * num(p, 'smmlv', hasta) ? num(p, 'auxilio_transporte', hasta) : 0;
  return { salario, variable, auxilio, total: salario + variable + auxilio, promedio: cambio };
}

function liquidarPrestacion(e: EntradaColilla, col: Colilla): number {
  const acc = e.acumulado;
  if (!acc) {
    col.alerta('acumulado_faltante', 'bloqueo');
    return 0;
  }
  if (e.vinculo.integral) {
    col.alerta('integral_sin_prima_ni_cesantias', 'aviso');
    return 0;
  }
  const desde = maxFecha(acc.desde, e.vinculo.ingreso);
  const hasta = e.vinculo.retiro ? minFecha(acc.hasta, e.vinculo.retiro) : acc.hasta;
  const dias = Math.max(0, dias360(desde, hasta) - acc.dias_no_remunerados);
  if (dias === 0) return 0;
  const base = basePrestacional(e, desde, hasta, acc.variables, dias);
  const detalle = { desde, hasta, dias, salario: aPeso(base.salario), variable: aPeso(base.variable), auxilio: aPeso(base.auxilio), salario_promediado: base.promedio };
  if (e.periodo.tipo === 'prima') {
    col.agregar('earning', 'PRIMA_SERVICIOS', (base.total * dias) / 360, { cantidad: dias, base: aPeso(base.total), detalle });
    return 0;
  }
  const cesantias = aPeso((base.total * dias) / 360) - aPeso(acc.ya_pagado ?? 0);
  const tasa = num(e.parametros, 'intereses_cesantias_tasa', hasta);
  col.agregar('info', 'CESANTIAS_CONSIGNAR', cesantias, { cantidad: dias, base: aPeso(base.total), detalle });
  const intereses = col.agregar('earning', 'INTERESES_CESANTIAS', (cesantias * tasa * dias) / 360, { cantidad: dias, base: cesantias, tasa });
  // Cesantías e intereses exentos según el salario promedio (art. 206 num. 4).
  const exenta = fraccionExentaCesantias(e.parametros, hasta, base.salario + base.variable);
  return intereses ? intereses.valor * exenta : 0;
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

export function calcularColilla(e: EntradaColilla): ResultadoColilla {
  const col = new Colilla(e.conceptos);
  const p = e.parametros;
  const fin = e.periodo.hasta;
  const vig = rangoVigente(e);
  let aportes: Aportes = { ibc: 0, ibcMinimo: 0, ibcMaximo: 0, exceso40: 0, baseParafiscales: 0, exonerado: false };
  let basePrest = 0;
  let ret: ResultadoRetencion | null = null;

  if (!vig) {
    col.alerta('vinculo_fuera_del_periodo', 'aviso');
  } else if (e.periodo.tipo === 'ordinaria') {
    devengadosOrdinarios(e, col, vig);
    aportes = seguridadSocial(e, col, vig);
    basePrest = provisiones(e, col);
    ret = retencion(e, col);
  } else {
    const exento = liquidarPrestacion(e, col);
    ret = retencion(e, col, exento);
  }

  // Deducciones con prelación: embargos (alimentos, cooperativas, ordinarios), préstamos y otros descuentos.
  const salarial = col.suma((c) => c.salarial);
  const ley = col.items
    .filter((i) => ['SALUD_EMPLEADO', 'PENSION_EMPLEADO', 'FONDO_SOLIDARIDAD', 'RETENCION_FUENTE'].includes(i.codigo))
    .reduce((s, i) => s + i.valor, 0);
  const devengado = col.devengados().reduce((s, i) => s + i.valor, 0);
  const otros: DescuentoAutorizado[] = e.novedades
    .filter((n) => col.c(n.concepto).tipo === 'deduccion' && n.valor)
    .map((n) => ({ id: n.id, concepto: n.concepto, valor: Number(n.valor) }));
  if (vig) {
    const smmlvPeriodo = sumaDiaria(vig.desde, vig.hasta, (f) => num(p, 'smmlv', f) / 30);
    const d = aplicarDeducciones({
      devengado,
      salarial,
      deducciones_ley: ley,
      smmlv_periodo: smmlvPeriodo,
      fraccion_alimentos: num(p, 'embargo_alimentos_max', fin),
      fraccion_excedente: num(p, 'embargo_fraccion_excedente', fin),
      neto_minimo_libranza: num(p, 'libranza_neto_minimo', fin),
      embargos: e.embargos,
      prestamos: e.prestamos,
      otros,
    });
    for (const x of d.aplicados) {
      col.agregar('deduction', x.concepto, x.valor, { fuente: x.fuente, detalle: x.detalle });
    }
    for (const a of d.alertas) col.alerta(a.codigo, a.severidad, a.detalle);
  }

  // Totales (sumas de valores ya redondeados).
  const sum = (t: TipoItem, f: (i: Item) => boolean = () => true) => col.items.filter((i) => i.tipo === t && f(i)).reduce((s, i) => s + i.valor, 0);
  const totDev = sum('earning');
  const totDed = sum('deduction');
  const neto = totDev - totDed;
  if (neto < 0) col.alerta('neto_negativo', 'bloqueo', { neto });
  const aportesEmp = sum('employer_cost', (i) => col.c(i.codigo).tipo === 'aporte_empleador');
  const provs = sum('employer_cost', (i) => col.c(i.codigo).tipo === 'provision');

  // Alertas contra el período anterior (el umbral lo fija la empresa).
  if (e.anterior && e.periodo.tipo === 'ordinaria') {
    const umbral = numOpcional(p, 'nomina_alerta_variacion_pct', fin) ?? 0.1;
    const varNeto = e.anterior.neto > 0 ? Math.abs(neto - e.anterior.neto) / e.anterior.neto : 0;
    const varDev = e.anterior.devengado > 0 ? Math.abs(totDev - e.anterior.devengado) / e.anterior.devengado : 0;
    if (varNeto > umbral || varDev > umbral) {
      col.alerta('variacion_contra_anterior', 'aviso', {
        umbral,
        neto_anterior: e.anterior.neto,
        neto,
        devengado_anterior: e.anterior.devengado,
        devengado: totDev,
      });
    }
  } else if (e.anterior === null && e.periodo.tipo === 'ordinaria') {
    col.alerta('sin_periodo_anterior', 'aviso');
  }

  const v = (codigos: string[], t?: TipoItem) => col.items.filter((i) => codigos.includes(i.codigo) && (!t || i.tipo === t)).reduce((s, i) => s + i.valor, 0);
  const columnas: Record<string, number> = {
    basic_salary: v(['SALARIO', 'SALARIO_INTEGRAL', 'SALARIO_HORAS', 'DESCUENTO_TIEMPO', 'VACACIONES_DISFRUTADAS', 'LICENCIA_REMUNERADA']),
    transport_allowance: v(['AUXILIO_TRANSPORTE']),
    overtime_pay: v(['HORA_EXTRA_DIURNA', 'HORA_EXTRA_NOCTURNA', 'HORA_EXTRA_DOMINICAL_DIURNA', 'HORA_EXTRA_DOMINICAL_NOCTURNA']),
    night_premium: v(['RECARGO_NOCTURNO']),
    holiday_premium: v(['RECARGO_DOMINICAL', 'RECARGO_DOMINICAL_NOCTURNO']),
    commissions: v(['COMISIONES']),
    bonuses: v(['BONIFICACION_SALARIAL', 'BONIFICACION_NO_SALARIAL']),
    gross_pay: totDev,
    health_deduction: v(['SALUD_EMPLEADO']),
    pension_deduction: v(['PENSION_EMPLEADO']),
    solidarity_fund: v(['FONDO_SOLIDARIDAD']),
    tax_withholding: v(['RETENCION_FUENTE']),
    loan_deductions: v(['PRESTAMO']),
    advance_deductions: 0,
    total_deductions: totDed,
    net_pay: neto,
    employer_health: v(['SALUD_EMPLEADOR']),
    employer_pension: v(['PENSION_EMPLEADOR']),
    employer_arl: v(['ARL']),
    employer_parafiscales: v(['CAJA_COMPENSACION', 'ICBF', 'SENA']),
    employer_severance: v(['PROVISION_CESANTIAS']),
    employer_severance_interest: v(['PROVISION_INTERESES']),
    employer_vacation_provision: v(['PROVISION_VACACIONES']),
    employer_bonus_provision: v(['PROVISION_PRIMA']),
    total_employer_cost: totDev + aportesEmp + provs,
    regular_hours: 0,
    overtime_day_hours: 0,
    overtime_night_hours: 0,
    holiday_hours: 0,
  };
  columnas.other_deductions = totDed - columnas.health_deduction - columnas.pension_deduction - columnas.solidarity_fund - columnas.tax_withholding - columnas.loan_deductions;
  columnas.other_earnings = totDev - columnas.basic_salary - columnas.transport_allowance - columnas.overtime_pay - columnas.night_premium - columnas.holiday_premium - columnas.commissions - columnas.bonuses;
  for (const h of e.horas) {
    const horas = h.minutos / 60;
    if (h.categoria.startsWith('ord')) columnas.regular_hours += horas;
    else if (h.categoria === 'extra_diurna') columnas.overtime_day_hours += horas;
    else if (h.categoria === 'extra_nocturna') columnas.overtime_night_hours += horas;
    else columnas.holiday_hours += horas;
  }
  for (const k of ['regular_hours', 'overtime_day_hours', 'overtime_night_hours', 'holiday_hours']) columnas[k] = Math.round(columnas[k] * 100) / 100;

  const salarioMensual = vig ? mensualEn(e, vig.hasta) : 0;
  return {
    vinculo_id: e.vinculo_id,
    sede_id: e.sede_id,
    version_motor: VERSION_MOTOR_NOMINA,
    items: col.items,
    totales: { devengado: totDev, deducciones: totDed, neto, aportes_empleador: aportesEmp, provisiones: provs, costo_empleador: totDev + aportesEmp + provs },
    bases: {
      salario_mensual: aPeso(salarioMensual),
      dias_periodo: dias360(e.periodo.desde, e.periodo.hasta),
      dias_trabajados: vig ? dias360(vig.desde, vig.hasta) : 0,
      ibc: aportes.ibc,
      ibc_minimo: aportes.ibcMinimo,
      ibc_maximo: aportes.ibcMaximo,
      exceso_40: aportes.exceso40,
      base_parafiscales: aportes.baseParafiscales,
      base_prestaciones: aPeso(basePrest),
      exonerado_114_1: aportes.exonerado,
      retencion: ret,
    },
    columnas,
    comision_ids: e.comisiones.map((c) => c.id).sort(),
    alertas: col.alertas,
    huella_entrada: huella(e),
  };
}

export interface ResultadoPeriodo {
  colillas: ResultadoColilla[];
  totales: { empleados: number; devengado: number; deducciones: number; neto: number; costo_empleador: number };
  bloqueos: AlertaNomina[];
  huella: string;
}

/** Calcula todas las colillas del período. Un error de un vínculo se reporta como bloqueo sin tumbar los demás. */
export function calcularPeriodo(entradas: readonly EntradaColilla[], bloqueosPeriodo: AlertaNomina[] = []): ResultadoPeriodo {
  const colillas: ResultadoColilla[] = [];
  const bloqueos: AlertaNomina[] = [...bloqueosPeriodo];
  for (const e of [...entradas].sort((a, b) => a.vinculo_id.localeCompare(b.vinculo_id))) {
    try {
      const c = calcularColilla(e);
      colillas.push(c);
      for (const a of c.alertas) if (a.severidad === 'bloqueo') bloqueos.push({ ...a, detalle: { ...(a.detalle ?? {}), vinculo_id: c.vinculo_id } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      bloqueos.push({ codigo: msg.split(':')[0] || 'error_calculo', severidad: 'bloqueo', detalle: { vinculo_id: e.vinculo_id, mensaje: msg } });
    }
  }
  const t = colillas.reduce(
    (s, c) => ({
      empleados: s.empleados + 1,
      devengado: s.devengado + c.totales.devengado,
      deducciones: s.deducciones + c.totales.deducciones,
      neto: s.neto + c.totales.neto,
      costo_empleador: s.costo_empleador + c.totales.costo_empleador,
    }),
    { empleados: 0, devengado: 0, deducciones: 0, neto: 0, costo_empleador: 0 }
  );
  return { colillas, totales: t, bloqueos, huella: huella(colillas.map((c) => [c.vinculo_id, c.huella_entrada])) };
}

/** Diferencia por concepto entre dos colillas (ajuste controlado de un período cerrado). */
export function diferenciaColillas(original: ResultadoColilla, corregida: ResultadoColilla): Item[] {
  const clave = (i: Item) => `${i.tipo}|${i.codigo}`;
  const m = new Map<string, Item>();
  for (const i of corregida.items) {
    const k = clave(i);
    const prev = m.get(k);
    m.set(k, prev ? { ...prev, valor: prev.valor + i.valor } : { tipo: i.tipo, codigo: i.codigo, nombre: i.nombre, valor: i.valor });
  }
  for (const i of original.items) {
    const k = clave(i);
    const prev = m.get(k);
    m.set(k, prev ? { ...prev, valor: prev.valor - i.valor } : { tipo: i.tipo, codigo: i.codigo, nombre: i.nombre, valor: -i.valor });
  }
  return [...m.values()].filter((i) => i.valor !== 0).sort((a, b) => clave(a).localeCompare(clave(b)));
}
