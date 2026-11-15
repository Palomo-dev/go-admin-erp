/**
 * Cómo se presentan los valores de ley en «Parámetros legales» (diseño
 * 10.RH.1): qué códigos de `hr_legal_parameters` forman cada fila, en qué
 * grupo va y cómo se lee su valor. Ningún valor vive aquí: todo sale de las
 * filas de la base; este archivo solo decide la presentación.
 *
 * Cada fila devuelve una clave i18n (`hrmConfig.parametros.valor.*`) y sus
 * parámetros ya formateados en el idioma de quien mira.
 */
import type { FilaParametro } from './tipos';
import { vigenteEn } from './parametrosVista';

export const GRUPOS_PARAMETROS = ['salario', 'jornada', 'aportes', 'prestaciones', 'otros'] as const;
export type GrupoParametros = (typeof GRUPOS_PARAMETROS)[number];

export interface Formato {
  dinero: (n: number) => string;
  /** Fracción → «8,5 %». */
  pct: (fraccion: number) => string;
  numero: (n: number) => string;
  /** Hora del día (19 → «7:00 p. m.»). */
  hora: (h: number) => string;
}

export interface Lectura {
  clave: string;
  params?: Record<string, string>;
  /** Segunda línea («desde 1-ene-2026», «empleador · trabajador»). */
  detalle?: { clave: string; params?: Record<string, string> };
}

/** Valor de un código en la fecha (o null si no rige o está por confirmar). */
export type Lector = (code: string) => FilaParametro | null;

export interface FilaCatalogo {
  id: string;
  grupo: GrupoParametros;
  /** El primero es el principal: de él salen estado, fuente e historial. */
  codigos: readonly string[];
  leer: (v: Lector, f: Formato) => Lectura | null;
}

const num = (fila: FilaParametro | null): number | null => (fila && fila.value !== null && Number.isFinite(Number(fila.value)) ? Number(fila.value) : null);
const json = <T,>(fila: FilaParametro | null): T | null => (fila && fila.value_json != null ? (fila.value_json as T) : null);

function rangoTarifas(tarifas: number[], f: Formato): Record<string, string> | null {
  if (tarifas.length === 0) return null;
  return { min: f.pct(Math.min(...tarifas)), max: f.pct(Math.max(...tarifas)) };
}

function simple(id: string, grupo: GrupoParametros, code: string, tipo: 'pct' | 'numero' | 'dinero' | 'semanas' | 'smmlv'): FilaCatalogo {
  return {
    id,
    grupo,
    codigos: [code],
    leer: (v, f) => {
      const n = num(v(code));
      if (n === null) return null;
      const valor = tipo === 'pct' ? f.pct(n) : tipo === 'dinero' ? f.dinero(n) : f.numero(n);
      return { clave: `simple.${tipo}`, params: { valor } };
    },
  };
}

function par(id: string, grupo: GrupoParametros, a: string, b: string, detalle: string): FilaCatalogo {
  return {
    id,
    grupo,
    codigos: [a, b],
    leer: (v, f) => {
      const x = num(v(a));
      const y = num(v(b));
      if (x === null || y === null) return null;
      return { clave: 'par', params: { a: f.pct(x), b: f.pct(y) }, detalle: { clave: detalle } };
    },
  };
}

export const CATALOGO_PARAMETROS: readonly FilaCatalogo[] = [
  // ── Salario y topes
  simple('smmlv', 'salario', 'smmlv', 'dinero'),
  {
    id: 'auxilio_transporte',
    grupo: 'salario',
    codigos: ['auxilio_transporte', 'auxilio_transporte_tope_smmlv'],
    leer: (v, f) => {
      const n = num(v('auxilio_transporte'));
      if (n === null) return null;
      const tope = num(v('auxilio_transporte_tope_smmlv'));
      return { clave: 'simple.dinero', params: { valor: f.dinero(n) }, detalle: tope === null ? undefined : { clave: 'hastaSmmlv', params: { n: f.numero(tope) } } };
    },
  },
  simple('uvt', 'salario', 'uvt', 'dinero'),
  {
    id: 'salario_integral',
    grupo: 'salario',
    codigos: ['salario_integral_minimo_smmlv', 'salario_integral_factor_ibc', 'smmlv'],
    leer: (v, f) => {
      const veces = num(v('salario_integral_minimo_smmlv'));
      const smmlv = num(v('smmlv'));
      if (veces === null) return null;
      const factor = num(v('salario_integral_factor_ibc'));
      return {
        clave: smmlv === null ? 'vecesSmmlv' : 'simple.dinero',
        params: { valor: smmlv === null ? '' : f.dinero(veces * smmlv), n: f.numero(veces) },
        detalle: { clave: 'integral', params: { n: f.numero(veces), factor: factor === null ? '' : f.pct(factor) } },
      };
    },
  },
  {
    id: 'ibc_tope',
    grupo: 'salario',
    codigos: ['ibc_tope_smmlv', 'smmlv'],
    leer: (v, f) => {
      const veces = num(v('ibc_tope_smmlv'));
      const smmlv = num(v('smmlv'));
      if (veces === null) return null;
      return {
        clave: smmlv === null ? 'vecesSmmlv' : 'simple.dinero',
        params: { valor: smmlv === null ? '' : f.dinero(veces * smmlv), n: f.numero(veces) },
        detalle: { clave: 'vecesSmmlv', params: { n: f.numero(veces) } },
      };
    },
  },
  // ── Jornada y recargos
  {
    id: 'jornada',
    grupo: 'jornada',
    codigos: ['jornada_max_semanal', 'divisor_hora_mensual'],
    leer: (v, f) => {
      const h = num(v('jornada_max_semanal'));
      if (h === null) return null;
      const d = num(v('divisor_hora_mensual'));
      return { clave: d === null ? 'horas' : 'jornada', params: { h: f.numero(h), divisor: d === null ? '' : f.numero(d) } };
    },
  },
  {
    id: 'nocturno',
    grupo: 'jornada',
    codigos: ['nocturno_hora_inicio', 'nocturno_hora_fin'],
    leer: (v, f) => {
      const desde = num(v('nocturno_hora_inicio'));
      const hasta = num(v('nocturno_hora_fin'));
      if (desde === null) return null;
      return { clave: 'simple.texto', params: { valor: f.hora(desde) }, detalle: hasta === null ? undefined : { clave: 'nocturnoHasta', params: { hora: f.hora(hasta) } } };
    },
  },
  simple('dominical', 'jornada', 'recargo_dominical_festivo', 'pct'),
  {
    id: 'recargos',
    grupo: 'jornada',
    codigos: ['recargo_nocturno', 'recargo_extra_diurna', 'recargo_extra_nocturna'],
    leer: (v, f) => {
      const n = num(v('recargo_nocturno'));
      const d = num(v('recargo_extra_diurna'));
      const x = num(v('recargo_extra_nocturna'));
      if (n === null || d === null || x === null) return null;
      return { clave: 'trio', params: { a: f.pct(n), b: f.pct(d), c: f.pct(x) }, detalle: { clave: 'recargos' } };
    },
  },
  {
    id: 'horas_extra',
    grupo: 'jornada',
    codigos: ['horas_extra_max_dia', 'horas_extra_max_semana'],
    leer: (v, f) => {
      const d = num(v('horas_extra_max_dia'));
      const s = num(v('horas_extra_max_semana'));
      if (d === null || s === null) return null;
      return { clave: 'horasExtra', params: { dia: f.numero(d), semana: f.numero(s) } };
    },
  },
  simple('dominical_habitual', 'jornada', 'dominical_habitual_umbral_dias', 'numero'),
  // ── Aportes y retención
  par('salud', 'aportes', 'aporte_salud_empleador', 'aporte_salud_trabajador', 'empleadorTrabajador'),
  par('pension', 'aportes', 'aporte_pension_empleador', 'aporte_pension_trabajador', 'empleadorTrabajador'),
  {
    id: 'fsp',
    grupo: 'aportes',
    codigos: ['fsp_tabla'],
    leer: (v, f) => {
      const tabla = json<{ tarifa: number }[]>(v('fsp_tabla'));
      const r = Array.isArray(tabla) ? rangoTarifas(tabla.map((x) => Number(x.tarifa)).filter(Number.isFinite), f) : null;
      return r ? { clave: 'rango', params: r, detalle: { clave: 'segunIbc' } } : null;
    },
  },
  {
    id: 'parafiscales',
    grupo: 'aportes',
    codigos: ['aporte_ccf', 'aporte_icbf', 'aporte_sena'],
    leer: (v, f) => {
      const c = num(v('aporte_ccf'));
      const i = num(v('aporte_icbf'));
      const s = num(v('aporte_sena'));
      if (c === null || i === null || s === null) return null;
      return { clave: 'trio', params: { a: f.pct(c), b: f.pct(i), c: f.pct(s) }, detalle: { clave: 'sobreIbc' } };
    },
  },
  {
    id: 'arl',
    grupo: 'aportes',
    codigos: ['arl_tarifas'],
    leer: (v, f) => {
      const t = json<Record<string, { inicial: number }>>(v('arl_tarifas'));
      const r = t ? rangoTarifas(Object.values(t).map((x) => Number(x?.inicial)).filter(Number.isFinite), f) : null;
      return r ? { clave: 'rango', params: r, detalle: { clave: 'clasesArl' } } : null;
    },
  },
  {
    id: 'exoneracion',
    grupo: 'aportes',
    codigos: ['exoneracion_114_1_umbral_smmlv', 'smmlv'],
    leer: (v, f) => {
      const n = num(v('exoneracion_114_1_umbral_smmlv'));
      if (n === null) return null;
      const smmlv = num(v('smmlv'));
      return { clave: 'menosDeSmmlv', params: { n: f.numero(n) }, detalle: smmlv === null ? undefined : { clave: 'simple.dinero', params: { valor: f.dinero(n * smmlv) } } };
    },
  },
  {
    id: 'retencion',
    grupo: 'aportes',
    codigos: ['retencion_art383_tabla'],
    leer: (v, f) => {
      const tabla = json<{ tarifa: number }[]>(v('retencion_art383_tabla'));
      if (!Array.isArray(tabla) || tabla.length === 0) return null;
      const r = rangoTarifas(tabla.map((x) => Number(x.tarifa)).filter(Number.isFinite), f);
      return r ? { clave: 'rangos', params: { ...r, n: f.numero(tabla.length) }, detalle: { clave: 'enUvt' } } : null;
    },
  },
  // ── Prestaciones, licencias y descuentos
  simple('intereses_cesantias', 'prestaciones', 'intereses_cesantias_tasa', 'pct'),
  {
    id: 'licencias',
    grupo: 'prestaciones',
    codigos: ['licencia_maternidad_semanas', 'licencia_paternidad_semanas'],
    leer: (v, f) => {
      const m = num(v('licencia_maternidad_semanas'));
      const p = num(v('licencia_paternidad_semanas'));
      if (m === null || p === null) return null;
      return { clave: 'licencias', params: { m: f.numero(m), p: f.numero(p) } };
    },
  },
  {
    id: 'incapacidad',
    grupo: 'prestaciones',
    codigos: ['incapacidad_tramos'],
    leer: (v) => (json(v('incapacidad_tramos')) ? { clave: 'porTramos' } : null),
  },
  {
    id: 'indemnizacion',
    grupo: 'prestaciones',
    codigos: ['indemnizacion_art64'],
    leer: (v) => (json(v('indemnizacion_art64')) ? { clave: 'porTramos' } : null),
  },
  {
    id: 'aprendiz',
    grupo: 'prestaciones',
    codigos: ['aprendiz_apoyo', 'aprendiz_monetizacion_smmlv'],
    leer: (v, f) => {
      const m = num(v('aprendiz_monetizacion_smmlv'));
      if (!json(v('aprendiz_apoyo')) && m === null) return null;
      return { clave: 'porTramos', detalle: m === null ? undefined : { clave: 'monetizacion', params: { n: f.numero(m) } } };
    },
  },
  simple('conectividad', 'prestaciones', 'auxilio_conectividad_tope_smmlv', 'smmlv'),
  par('embargos', 'prestaciones', 'embargo_alimentos_max', 'embargo_fraccion_excedente', 'embargos'),
  simple('libranza', 'prestaciones', 'libranza_neto_minimo', 'pct'),
  {
    id: 'deducciones',
    grupo: 'prestaciones',
    codigos: ['renta_exenta_25_pct', 'renta_exenta_25_tope_uvt_anio', 'limite_global_pct', 'limite_global_tope_uvt_anio', 'dep_dependientes_pct', 'renta_exenta_voluntarios_pct'],
    leer: (v, f) => {
      const r = num(v('renta_exenta_25_pct'));
      const l = num(v('limite_global_pct'));
      if (r === null || l === null) return null;
      const tope = num(v('limite_global_tope_uvt_anio'));
      return { clave: 'deducciones', params: { r: f.pct(r), l: f.pct(l) }, detalle: tope === null ? undefined : { clave: 'topeUvt', params: { n: f.numero(tope) } } };
    },
  },
];

/** Códigos que el catálogo ya presenta (los demás van a «Otros», con su código). */
export const CODIGOS_PRESENTADOS: ReadonlySet<string> = new Set(CATALOGO_PARAMETROS.flatMap((c) => c.codigos));

/**
 * Filas «Otros»: códigos que llegaron de la base y aún no tienen
 * presentación. Se muestran con su código para que nada quede oculto.
 */
export function filasOtros(ley: readonly FilaParametro[]): FilaCatalogo[] {
  const extra = new Set<string>();
  for (const f of ley) if (!CODIGOS_PRESENTADOS.has(f.code) && !f.code.startsWith('dep_') && !f.code.startsWith('renta_exenta_')) extra.add(f.code);
  return [...extra].sort().map((code) => ({
    id: code,
    grupo: 'otros' as const,
    codigos: [code],
    leer: (v: Lector, f: Formato) => {
      const n = num(v(code));
      if (n !== null) return { clave: 'simple.numero', params: { valor: f.numero(n) } };
      return json(v(code)) ? { clave: 'porTramos' } : null;
    },
  }));
}

/** El lector de una fecha: la fila vigente de cada código (sin las «por confirmar» sin valor). */
export function lectorEn(ley: readonly FilaParametro[], fecha: string): Lector {
  return (code) => {
    const fila = vigenteEn(ley, code, fecha);
    if (!fila || (fila.value === null && fila.value_json == null)) return null;
    return fila;
  };
}

/** Estado que se muestra en la fila: el de la vigencia, o «Por confirmar» si no hay valor. */
export type EstadoFila = FilaParametro['status'] | 'sin_valor';

export function estadoEn(ley: readonly FilaParametro[], code: string, fecha: string): EstadoFila {
  const fila = vigenteEn(ley, code, fecha);
  if (!fila) return 'sin_valor';
  if (fila.value === null && fila.value_json == null) return 'por_confirmar';
  return fila.status;
}
