/**
 * Del dato de la base a la entrada del motor de nómina, y de su resultado a lo
 * que guarda `fn_hr_nomina_guardar` (ADR-003 §3). Puro: lo usan el servidor y
 * las pruebas.
 */
import { dias360, VERSION_MOTOR_NOMINA, type ParametrosNomina } from './base';
import type { Catalogo } from './conceptos';
import {
  calcularColilla,
  calcularPeriodo,
  diferenciaColillas,
  type AlertaNomina,
  type Ausencia,
  type EntradaColilla,
  type PeriodoSalario,
  type ResultadoColilla,
  type ResultadoPeriodo,
  type TipoPeriodo,
} from './motorNomina';

/** Lo que devuelve `fn_hr_nomina_insumos`. */
export interface InsumosNomina {
  periodo: { id: string; desde: string; hasta: string; tipo: TipoPeriodo; frecuencia?: string; estado?: string };
  nomina_habilitada: boolean;
  parametros: ParametrosNomina;
  conceptos: Catalogo;
  exoneracion_114_1: boolean | null;
  jornada: {
    horas_dia?: Array<{ employment_id: string; fecha: string; categoria: string; recargo: number; divisor: number; minutos: number }>;
    descuentos?: Array<{ employment_id: string; tipo: string; fecha: string; minutos: number }>;
    ausencias?: Array<{
      id: string;
      employment_id: string;
      clase: string | null;
      pagada: boolean | null;
      desde: string;
      hasta: string;
      tramos: Array<{ desde: string; hasta: string; paga: string | null; fraccion: number | null; piso?: string | null }> | null;
    }>;
  } | null;
  pendientes: { novedades_nomina: number; novedades_asistencia: number; dias_no_listos: number };
  empleados: EmpleadoInsumo[];
  excluidos: Array<Record<string, unknown>>;
}

export interface EmpleadoInsumo {
  vinculo_id: string;
  persona_id: string | null;
  nombre: string | null;
  sede_id: number | null;
  ingreso: string;
  retiro: string | null;
  remoto: boolean;
  /** Horas semanales pactadas (employments.work_hours_per_week). */
  jornada_semanal?: number | null;
  moneda: string | null;
  periodo_salario: PeriodoSalario;
  salario: Array<{ desde: string; hasta: string; valor: number }>;
  clase_arl: number;
  ajustes: {
    integral: boolean;
    procedimiento: 1 | 2;
    porcentaje_fijo: number | null;
    dependientes: boolean;
    medicina_prepagada: number;
    intereses_vivienda: number;
    aportes_voluntarios: number;
    pension_en_licencia?: 'no' | 'empleador' | 'compartida' | null;
    cotiza_por_semanas?: boolean | null;
  } | null;
  dependientes_registrados: number;
  novedades: Array<{ id: string; concepto: string; valor: number | null; cantidad: number | null; descripcion: string | null }>;
  comisiones: Array<{ id: string; valor: number }>;
  prestamos: Array<{ cuota_id: string; prestamo_id: string; valor: number; max_deduccion_pct: number | null }>;
  embargos: Array<{ id: string; tipo: 'alimentos' | 'cooperativa' | 'ordinario'; recibido: string; modo: 'fijo' | 'porcentaje'; valor: number; saldo: number | null; incluye_prestaciones?: boolean | null }>;
  mes_previo: { ingresos_retencion: number; incr: number; retencion: number } | null;
  anterior: { devengado: number; neto: number } | null;
  /** IBC del último mes cotizado (suma de sus colillas ordinarias cerradas). */
  ibc_anterior?: number | null;
  /** IBC por mes ('YYYY-MM') de los meses anteriores con colillas cerradas. */
  ibc_meses?: Record<string, number | string> | null;
  variables_12m: { desde: string; hasta: string; valor: number };
  acumulado: { desde: string; hasta: string; variables: number; no_remunerados: Array<{ desde: string; hasta: string }> } | null;
}

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Entrada del motor de un vínculo a partir de los insumos de la base. */
export function entradaDesdeInsumos(ins: InsumosNomina, emp: EmpleadoInsumo): EntradaColilla {
  const j = ins.jornada ?? {};
  const ausencias: Ausencia[] = (j.ausencias ?? [])
    .filter((a) => a.employment_id === emp.vinculo_id)
    .map((a) => ({
      id: a.id,
      clase: a.clase ?? '',
      pagada: a.pagada !== false,
      desde: a.desde,
      hasta: a.hasta,
      tramos: (a.tramos ?? []).map((t) => ({ desde: t.desde, hasta: t.hasta, paga: t.paga ?? null, fraccion: n(t.fraccion), piso: t.piso ?? null })),
    }));
  const v12 = emp.variables_12m;
  const dias12 = v12 && v12.desde <= v12.hasta ? dias360(v12.desde, v12.hasta) : 0;
  const ajustes = emp.ajustes;
  return {
    vinculo_id: emp.vinculo_id,
    sede_id: emp.sede_id,
    periodo: { id: ins.periodo.id, desde: ins.periodo.desde, hasta: ins.periodo.hasta, tipo: ins.periodo.tipo },
    vinculo: {
      ingreso: emp.ingreso,
      retiro: emp.retiro,
      integral: ajustes?.integral ?? false,
      periodo_salario: emp.periodo_salario,
      remoto: emp.remoto,
      jornada_semanal: emp.jornada_semanal === null || emp.jornada_semanal === undefined ? null : n(emp.jornada_semanal),
      pension_en_licencia: ajustes?.pension_en_licencia === 'empleador' || ajustes?.pension_en_licencia === 'compartida' ? ajustes.pension_en_licencia : 'no',
      cotiza_por_semanas: ajustes?.cotiza_por_semanas === true,
    },
    salario: emp.salario.map((s) => ({ desde: s.desde, hasta: s.hasta, valor: n(s.valor) })),
    clase_arl: n(emp.clase_arl) || 1,
    exoneracion_114_1: ins.exoneracion_114_1,
    parametros: ins.parametros,
    conceptos: ins.conceptos,
    horas: (j.horas_dia ?? [])
      .filter((h) => h.employment_id === emp.vinculo_id)
      .map((h) => ({ fecha: h.fecha, categoria: h.categoria, recargo: n(h.recargo), divisor: n(h.divisor), minutos: n(h.minutos) })),
    descuentos_tiempo: (j.descuentos ?? [])
      .filter((d) => d.employment_id === emp.vinculo_id)
      .map((d) => ({ fecha: d.fecha, tipo: d.tipo, minutos: n(d.minutos) })),
    ausencias,
    novedades: emp.novedades.map((x) => ({ id: x.id, concepto: x.concepto, valor: x.valor === null ? null : n(x.valor), cantidad: x.cantidad === null ? null : n(x.cantidad), descripcion: x.descripcion })),
    comisiones: emp.comisiones.map((c) => ({ id: c.id, valor: n(c.valor) })),
    prestamos: emp.prestamos.map((p) => ({ ...p, valor: n(p.valor), max_deduccion_pct: p.max_deduccion_pct === null ? null : n(p.max_deduccion_pct) })),
    embargos: emp.embargos.map((g) => ({ ...g, valor: n(g.valor), saldo: g.saldo === null ? null : n(g.saldo), incluye_prestaciones: g.incluye_prestaciones === true })),
    retencion: {
      procedimiento: ajustes?.procedimiento === 2 ? 2 : 1,
      porcentaje_fijo: ajustes?.porcentaje_fijo === null || ajustes?.porcentaje_fijo === undefined ? null : n(ajustes.porcentaje_fijo),
      dependientes: Boolean(ajustes?.dependientes) || n(emp.dependientes_registrados) > 0,
      medicina_prepagada: n(ajustes?.medicina_prepagada),
      intereses_vivienda: n(ajustes?.intereses_vivienda),
      aportes_voluntarios: n(ajustes?.aportes_voluntarios),
    },
    mes_previo: emp.mes_previo ? { ingresos_retencion: n(emp.mes_previo.ingresos_retencion), incr: n(emp.mes_previo.incr), retencion: n(emp.mes_previo.retencion) } : null,
    promedio_variable_mensual: dias12 > 0 ? (n(v12.valor) / dias12) * 30 : 0,
    acumulado: emp.acumulado
      ? {
          desde: emp.acumulado.desde,
          hasta: emp.acumulado.hasta,
          variables: n(emp.acumulado.variables),
          dias_no_remunerados: (emp.acumulado.no_remunerados ?? []).reduce((s, r) => s + dias360(r.desde, r.hasta), 0),
        }
      : null,
    anterior: emp.anterior ? { devengado: n(emp.anterior.devengado), neto: n(emp.anterior.neto) } : null,
    ibc_anterior: emp.ibc_anterior === null || emp.ibc_anterior === undefined ? null : n(emp.ibc_anterior) || null,
    ibc_meses: emp.ibc_meses ? Object.fromEntries(Object.entries(emp.ibc_meses).map(([k, v]) => [k, n(v)])) : null,
  };
}

/** Bloqueos del período que no dependen de un vínculo. */
export function bloqueosDelPeriodo(ins: InsumosNomina): AlertaNomina[] {
  const b: AlertaNomina[] = [];
  const p = ins.pendientes;
  if (p.novedades_nomina > 0) b.push({ codigo: 'novedades_nomina_pendientes', severidad: 'bloqueo', detalle: { cantidad: p.novedades_nomina } });
  if (p.novedades_asistencia > 0) b.push({ codigo: 'novedades_asistencia_pendientes', severidad: 'bloqueo', detalle: { cantidad: p.novedades_asistencia } });
  if (p.dias_no_listos > 0) b.push({ codigo: 'dias_no_listos', severidad: 'bloqueo', detalle: { cantidad: p.dias_no_listos } });
  return b;
}

export function sinParametros(e: EntradaColilla): Omit<EntradaColilla, 'parametros' | 'conceptos'> {
  const resto: Partial<EntradaColilla> = { ...e };
  delete resto.parametros;
  delete resto.conceptos;
  return resto as Omit<EntradaColilla, 'parametros' | 'conceptos'>;
}

function retencionMes(c: ResultadoColilla, cat: Catalogo) {
  const ingresos = c.items.filter((i) => i.tipo === 'earning' && cat[i.codigo]?.base_retencion).reduce((s, i) => s + i.valor, 0);
  const incr = c.items.filter((i) => ['SALUD_EMPLEADO', 'PENSION_EMPLEADO', 'FONDO_SOLIDARIDAD'].includes(i.codigo)).reduce((s, i) => s + i.valor, 0);
  const retencion = c.items.filter((i) => i.codigo === 'RETENCION_FUENTE').reduce((s, i) => s + i.valor, 0);
  return { ingresos, incr, retencion };
}

export interface PayloadGuardar {
  huella: string;
  version_motor: string;
  totales: ResultadoPeriodo['totales'];
  bloqueos: AlertaNomina[];
  excluidos: Array<Record<string, unknown>>;
  parametros_snapshot: { parametros: ParametrosNomina; conceptos: Catalogo; exoneracion_114_1: boolean | null };
  colillas: Array<Record<string, unknown>>;
}

/** Corre el motor sobre todos los vínculos y arma lo que guarda la base. */
export function preliquidarDesdeInsumos(ins: InsumosNomina): { resultado: ResultadoPeriodo; payload: PayloadGuardar } {
  const entradas = ins.empleados.map((e) => entradaDesdeInsumos(ins, e));
  const resultado = calcularPeriodo(entradas, bloqueosDelPeriodo(ins));
  const porVinculo = new Map(ins.empleados.map((e) => [e.vinculo_id, e]));
  const entradaPorVinculo = new Map(entradas.map((e) => [e.vinculo_id, e]));
  const payload: PayloadGuardar = {
    huella: resultado.huella,
    version_motor: VERSION_MOTOR_NOMINA,
    totales: resultado.totales,
    bloqueos: resultado.bloqueos,
    excluidos: ins.excluidos,
    parametros_snapshot: { parametros: ins.parametros, conceptos: ins.conceptos, exoneracion_114_1: ins.exoneracion_114_1 },
    colillas: resultado.colillas.map((c) => {
      const emp = porVinculo.get(c.vinculo_id);
      return {
        ...c,
        nombre: emp?.nombre ?? null,
        // La moneda es la del vínculo (sale de la organización); si falta, la pone la base.
        moneda: emp?.moneda ?? null,
        periodo_salario: emp?.periodo_salario ?? 'monthly',
        entrada: sinParametros(entradaPorVinculo.get(c.vinculo_id)!),
        retencion_mes: retencionMes(c, ins.conceptos),
      };
    }),
  };
  return { resultado, payload };
}

/** Lo que devuelve `fn_hr_nomina_ajuste_insumos`. */
export interface InsumosAjuste {
  periodo: { id: string; desde: string; hasta: string; tipo: TipoPeriodo };
  run_id: string;
  parametros_snapshot: { parametros: ParametrosNomina; conceptos: Catalogo; exoneracion_114_1?: boolean | null };
  colillas: Array<{ vinculo_id: string; entrada: Omit<EntradaColilla, 'parametros' | 'conceptos'>; nombre: string | null }>;
}

export interface NovedadAjuste {
  concepto: string;
  valor?: number | null;
  cantidad?: number | null;
}

/**
 * Ajuste controlado de un período cerrado: se recalcula la colilla con su entrada
 * y sus reglas ORIGINALES (las del run cerrado) más las novedades del ajuste, y
 * se guarda solo la diferencia por concepto.
 */
export function ajusteDesdeInsumos(ins: InsumosAjuste, vinculoId: string, novedades: NovedadAjuste[]): PayloadGuardar {
  const fila = ins.colillas.find((c) => c.vinculo_id === vinculoId);
  if (!fila || !fila.entrada) throw new Error('ajuste_sin_colilla');
  const base: EntradaColilla = { ...(fila.entrada as EntradaColilla), parametros: ins.parametros_snapshot.parametros, conceptos: ins.parametros_snapshot.conceptos };
  const original = calcularColilla(base);
  const corregida = calcularColilla({
    ...base,
    novedades: [...base.novedades, ...novedades.map((x, i) => ({ id: `ajuste-${i + 1}`, concepto: x.concepto, valor: x.valor ?? null, cantidad: x.cantidad ?? null }))],
  });
  const items = diferenciaColillas(original, corregida);
  const dev = items.filter((i) => i.tipo === 'earning').reduce((s, i) => s + i.valor, 0);
  const ded = items.filter((i) => i.tipo === 'deduction').reduce((s, i) => s + i.valor, 0);
  const colilla = { vinculo_id: vinculoId, huella_entrada: corregida.huella_entrada, entrada: sinParametros({ ...base, novedades: [] }), items };
  return {
    huella: `${original.huella_entrada}:${corregida.huella_entrada}`,
    version_motor: VERSION_MOTOR_NOMINA,
    totales: { empleados: 1, devengado: dev, deducciones: ded, neto: dev - ded, costo_empleador: 0 },
    bloqueos: [],
    excluidos: [],
    parametros_snapshot: { parametros: ins.parametros_snapshot.parametros, conceptos: ins.parametros_snapshot.conceptos, exoneracion_114_1: ins.parametros_snapshot.exoneracion_114_1 ?? null },
    colillas: [colilla],
  };
}
