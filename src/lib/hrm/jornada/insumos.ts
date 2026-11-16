/**
 * Del dato de la base a la entrada del motor de horas, y de su resultado a lo
 * que guarda `fn_hr_jornada_guardar` (ADR-002 §3). Puro: lo usan el servidor y
 * las pruebas.
 */
import {
  CODIGOS_PARAMETROS_JORNADA,
  type CodigoParametroJornada,
  type EntradaDia,
  type Intervalo,
  type ParametrosJornada,
  type ResultadoDia,
  type TramoParametro,
} from './motorHoras';

export type TipoMarcacion = 'check_in' | 'check_out' | 'break_start' | 'break_end';

export interface Marcacion {
  tipo: TipoMarcacion;
  hora: string;
}

export interface TurnoInsumo {
  inicio?: string | null;
  fin?: string | null;
  minutos?: number | null;
  descanso_minutos?: number | null;
  descanso_pagado?: boolean | null;
  descanso?: boolean;
}

/** Lo que devuelve `fn_hr_jornada_insumos`. */
export interface InsumosJornada {
  employment_id: string;
  fecha: string;
  zona: string;
  version: number;
  estado: string | null;
  fuente: 'marcaciones' | 'turno' | null;
  eventos: Marcacion[];
  turno: TurnoInsumo | null;
  ajustes: {
    dia_descanso: number;
    exento_horas_extra: boolean;
    jornada_flexible: boolean;
    mecanismos: string[];
  };
  contrato_horas_semana: number | null;
  festivos: string[];
  parametros: Partial<Record<CodigoParametroJornada, TramoParametro[]>>;
  semana: { desde: string; ordinarias_previas: number; extras_previas: number };
  tolerancia_tardanza: number;
}

/**
 * Intervalos trabajados a partir de las marcaciones del día, en el mismo orden
 * que consolida la base (`fn_hr_timesheet_consolidar`): pares entrada → salida;
 * un descanso abierto corta el intervalo y su fin lo reanuda. Con descanso
 * pagado, las pausas no cortan.
 */
export function intervalosDesdeMarcaciones(
  eventos: readonly Marcacion[],
  descansoPagado = false
): { intervalos: Intervalo[]; incompleta: boolean } {
  const ordenados = [...eventos].sort((a, b) => Date.parse(a.hora) - Date.parse(b.hora));
  const intervalos: Intervalo[] = [];
  let abierto: string | null = null;
  let enPausa = false;
  for (const e of ordenados) {
    if (e.tipo === 'check_in') {
      if (abierto === null && !enPausa) abierto = e.hora;
    } else if (e.tipo === 'check_out') {
      if (abierto !== null) intervalos.push({ inicio: abierto, fin: e.hora });
      abierto = null;
      enPausa = false;
    } else if (e.tipo === 'break_start') {
      if (abierto !== null && !enPausa && !descansoPagado) {
        intervalos.push({ inicio: abierto, fin: e.hora });
        abierto = null;
        enPausa = true;
      }
    } else if (e.tipo === 'break_end') {
      if (enPausa) {
        abierto = e.hora;
        enPausa = false;
      }
    }
  }
  return { intervalos, incompleta: abierto !== null || enPausa };
}

/**
 * Intervalos de un turno publicado, para quien no marca (`sin_marcacion`). El
 * descanso no pagado se resta en la mitad del turno: no se sabe cuándo se tomó.
 */
export function intervalosDesdeTurno(turno: TurnoInsumo): Intervalo[] {
  if (!turno.inicio || !turno.fin || turno.descanso) return [];
  const ini = Date.parse(turno.inicio);
  const fin = Date.parse(turno.fin);
  if (!(fin > ini)) return [];
  const descanso = turno.descanso_pagado ? 0 : Math.max(0, turno.descanso_minutos ?? 0);
  if (descanso === 0) return [{ inicio: turno.inicio, fin: turno.fin }];
  const medio = Math.floor((ini + fin) / 2 / 60_000) * 60_000;
  const a = medio - Math.floor(descanso / 2) * 60_000;
  const b = a + descanso * 60_000;
  return [
    { inicio: new Date(ini).toISOString(), fin: new Date(a).toISOString() },
    { inicio: new Date(b).toISOString(), fin: new Date(fin).toISOString() },
  ].filter((i) => Date.parse(i.fin) > Date.parse(i.inicio));
}

function parametrosDe(crudos: InsumosJornada['parametros']): ParametrosJornada {
  const out: ParametrosJornada = {};
  for (const codigo of CODIGOS_PARAMETROS_JORNADA) {
    const tramos = crudos?.[codigo];
    if (Array.isArray(tramos)) {
      out[codigo] = tramos.map((t) => ({
        desde: String(t.desde),
        hasta: t.hasta === null || t.hasta === undefined ? null : String(t.hasta),
        valor: t.valor === null || t.valor === undefined ? null : Number(t.valor),
        estado: t.estado ?? null,
      }));
    }
  }
  return out;
}

/** Entrada del motor a partir de los insumos; `null` si el día no tiene qué clasificar. */
export function entradaDesdeInsumos(insumos: InsumosJornada): EntradaDia | null {
  if (!insumos.fuente) return null;
  const turno = insumos.turno && !insumos.turno.descanso ? insumos.turno : null;
  let intervalos: Intervalo[];
  let incompleta = false;
  if (insumos.fuente === 'marcaciones') {
    const r = intervalosDesdeMarcaciones(insumos.eventos ?? [], turno?.descanso_pagado === true);
    intervalos = r.intervalos;
    incompleta = r.incompleta;
  } else {
    intervalos = turno ? intervalosDesdeTurno(turno) : [];
  }
  return {
    fechaTrabajo: insumos.fecha,
    zona: insumos.zona,
    intervalos,
    festivos: insumos.festivos ?? [],
    diaDescanso: insumos.ajustes?.dia_descanso ?? 0,
    topeDiarioMinutos: turno?.minutos ?? null,
    jornadaFlexible: insumos.ajustes?.jornada_flexible === true,
    contratoHorasSemana: insumos.contrato_horas_semana ?? null,
    exentoHorasExtra: insumos.ajustes?.exento_horas_extra === true,
    semana: {
      ordinariasPrevias: Number(insumos.semana?.ordinarias_previas ?? 0),
      extrasPrevias: Number(insumos.semana?.extras_previas ?? 0),
    },
    marcacionIncompleta: incompleta,
    parametros: parametrosDe(insumos.parametros),
  };
}

/** Lo que recibe `fn_hr_jornada_guardar` como `p_resultado`. */
export function resultadoParaGuardar(resultado: ResultadoDia, fuente: 'marcaciones' | 'turno') {
  return {
    fuente,
    lineas: resultado.lineas,
    minutos: resultado.minutos,
    alertas: resultado.alertas,
    tramos: resultado.tramos.map((t) => ({
      inicio: t.inicio,
      fin: t.fin,
      fecha_local: t.fechaLocal,
      minutos: t.minutos,
      categoria: t.categoria,
      recargo: t.recargo,
      divisor: t.divisor,
    })),
    huella: resultado.huella,
    motor: resultado.motor,
  };
}
