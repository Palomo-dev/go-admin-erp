/**
 * Retención en la fuente por pagos laborales (ADR-003 §2.6; investigación §4).
 *
 * Depuración mensual, en este orden:
 * 1. ingresos laborales del mes;
 * 2. − ingresos no constitutivos de renta (salud, pensión y FSP del trabajador) = ingreso neto;
 * 3. − deducciones (dependientes 10 % con tope, medicina prepagada, intereses de vivienda);
 * 4. − rentas exentas por aportes voluntarios (AFC, FVP), con su 30 % y su tope anual / 12;
 * 5. − renta exenta del 25 % sobre lo que queda, con tope anual / 12;
 * 6. límite global: 3 + 4 + 5 ≤ 40 % del ingreso neto y ≤ tope anual / 12.
 *
 * Procedimiento 1: tabla del art. 383 sobre la base del mes.
 * Procedimiento 2: base del mes × porcentaje fijo semestral (art. 386), que
 * calcula `porcentajeFijoProcedimiento2`.
 *
 * No se usa `fn_retencion_art383`: tiene la tabla escrita en el SQL y redondea al
 * peso; aquí la tabla sale de `retencion_art383_tabla` por vigencia y el redondeo
 * de `retencion_redondeo_cop`.
 */
import { aMultiplo, num, tabla, uvt, type ParametrosNomina } from './base';

export interface TramoTabla383 {
  desde_uvt: number;
  hasta_uvt: number | null;
  tarifa: number;
  base_uvt: number;
  suma_uvt: number;
}

export interface DatosRetencion {
  procedimiento: 1 | 2;
  /** Porcentaje fijo del procedimiento 2, en fracción (0.0412). */
  porcentaje_fijo: number | null;
  dependientes: boolean;
  medicina_prepagada: number;
  intereses_vivienda: number;
  aportes_voluntarios: number;
}

export interface EntradaDepuracion {
  fecha: string;
  ingresos: number;
  /** Ingresos exentos que no pasan por la depuración (cesantías e intereses exentos). */
  exentos_directos?: number;
  incr: number;
  datos: DatosRetencion;
}

export interface Depuracion {
  ingresos: number;
  incr: number;
  ingreso_neto: number;
  deduccion_dependientes: number;
  deduccion_medicina: number;
  deduccion_vivienda: number;
  exenta_voluntarios: number;
  exenta_25: number;
  limite_40: number;
  beneficios_aplicados: number;
  base: number;
  base_uvt: number;
  uvt: number;
}

/** Impuesto en UVT de la tabla del art. 383 para una base en UVT. */
export function impuestoUvt(t: readonly TramoTabla383[], baseUvt: number): number {
  for (const r of t) {
    if (baseUvt > r.desde_uvt && (r.hasta_uvt === null || baseUvt <= r.hasta_uvt)) {
      return Math.max(0, (baseUvt - r.base_uvt) * r.tarifa + r.suma_uvt);
    }
  }
  return 0;
}

export function depurar(p: ParametrosNomina, e: EntradaDepuracion): Depuracion {
  const f = e.fecha;
  const u = uvt(p, f);
  const ingresos = Math.max(0, e.ingresos);
  const incr = Math.min(Math.max(0, e.incr), ingresos);
  const neto = ingresos - incr;

  const dep = e.datos.dependientes
    ? Math.min(ingresos * num(p, 'dep_dependientes_pct', f), num(p, 'dep_dependientes_tope_uvt_mes', f) * u)
    : 0;
  const med = Math.min(Math.max(0, e.datos.medicina_prepagada), num(p, 'dep_medicina_prepagada_tope_uvt_mes', f) * u);
  const viv = Math.min(Math.max(0, e.datos.intereses_vivienda), num(p, 'dep_intereses_vivienda_tope_uvt_mes', f) * u);
  const vol = Math.min(
    Math.max(0, e.datos.aportes_voluntarios),
    ingresos * num(p, 'renta_exenta_voluntarios_pct', f),
    (num(p, 'renta_exenta_voluntarios_tope_uvt_anio', f) * u) / 12
  );
  const despues = Math.max(0, neto - dep - med - viv - vol);
  const e25 = Math.min(despues * num(p, 'renta_exenta_25_pct', f), (num(p, 'renta_exenta_25_tope_uvt_anio', f) * u) / 12);
  const limite = Math.min(neto * num(p, 'limite_global_pct', f), (num(p, 'limite_global_tope_uvt_anio', f) * u) / 12);
  const beneficios = Math.min(dep + med + viv + vol + e25, limite);
  const base = Math.max(0, neto - beneficios);
  return {
    ingresos,
    incr,
    ingreso_neto: neto,
    deduccion_dependientes: dep,
    deduccion_medicina: med,
    deduccion_vivienda: viv,
    exenta_voluntarios: vol,
    exenta_25: e25,
    limite_40: limite,
    beneficios_aplicados: beneficios,
    base,
    base_uvt: base / u,
    uvt: u,
  };
}

export interface ResultadoRetencion {
  procedimiento: 1 | 2;
  depuracion: Depuracion;
  porcentaje: number | null;
  /** Retención del mes antes de restar lo ya retenido en el mes. */
  retencion_mes: number;
}

/** Retención del mes (procedimiento 1 o 2), redondeada con `retencion_redondeo_cop`. */
export function retencionMensual(p: ParametrosNomina, e: EntradaDepuracion): ResultadoRetencion {
  const d = depurar(p, e);
  const redondeo = num(p, 'retencion_redondeo_cop', e.fecha);
  if (e.datos.procedimiento === 2) {
    if (e.datos.porcentaje_fijo === null || !Number.isFinite(e.datos.porcentaje_fijo)) {
      throw new Error('porcentaje_fijo_faltante');
    }
    return { procedimiento: 2, depuracion: d, porcentaje: e.datos.porcentaje_fijo, retencion_mes: aMultiplo(d.base * e.datos.porcentaje_fijo, redondeo) };
  }
  const t = tabla<TramoTabla383[]>(p, 'retencion_art383_tabla', e.fecha);
  const imp = impuestoUvt(t, d.base_uvt) * d.uvt;
  return { procedimiento: 1, depuracion: d, porcentaje: null, retencion_mes: aMultiplo(imp, redondeo) };
}

export interface EntradaPorcentajeFijo {
  /** Fecha del cálculo (junio o diciembre); fija la UVT y la tabla. */
  fecha: string;
  /** Pagos laborales de los 12 meses anteriores (o de lo laborado si es menos). */
  ingresos_12m: number;
  incr_12m: number;
  /** Deducciones y rentas exentas de los 12 meses, ya con sus topes mensuales. */
  deducciones_12m: number;
  exentas_12m: number;
  meses: number;
}

/**
 * Porcentaje fijo del procedimiento 2 (art. 386): base depurada del período ÷ 13
 * (o entre los meses laborados, si son menos de 12: se promedia por mes), tabla
 * del art. 383 y luego impuesto ÷ ingreso gravado promedio. Cuatro decimales en
 * porcentaje (fracción con seis).
 */
export function porcentajeFijoProcedimiento2(p: ParametrosNomina, e: EntradaPorcentajeFijo): number {
  const u = uvt(p, e.fecha);
  const divisor = e.meses >= 12 ? 13 : Math.max(1, e.meses);
  const neto = Math.max(0, e.ingresos_12m - e.incr_12m);
  const otros = e.deducciones_12m + e.exentas_12m;
  const despues = Math.max(0, neto - otros);
  const e25Anual = Math.min(despues * num(p, 'renta_exenta_25_pct', e.fecha), num(p, 'renta_exenta_25_tope_uvt_anio', e.fecha) * u);
  const limite = Math.min(neto * num(p, 'limite_global_pct', e.fecha), num(p, 'limite_global_tope_uvt_anio', e.fecha) * u);
  const base = Math.max(0, neto - Math.min(otros + e25Anual, limite));
  const basePromedioUvt = base / divisor / u;
  const t = tabla<TramoTabla383[]>(p, 'retencion_art383_tabla', e.fecha);
  const impUvt = impuestoUvt(t, basePromedioUvt);
  if (basePromedioUvt <= 0) return 0;
  return Math.round((impUvt / basePromedioUvt) * 1_000_000) / 1_000_000;
}

/** Fracción exenta de cesantías e intereses según el salario promedio (art. 206 num. 4). */
export function fraccionExentaCesantias(p: ParametrosNomina, fecha: string, salarioPromedioMensual: number): number {
  const filas = tabla<Array<{ hasta_uvt: number | null; exento: number }>>(p, 'cesantias_exenta_tabla', fecha);
  const enUvt = salarioPromedioMensual / uvt(p, fecha);
  for (const f of filas) {
    if (f.hasta_uvt === null || enUvt <= f.hasta_uvt) return f.exento;
  }
  return 0;
}
