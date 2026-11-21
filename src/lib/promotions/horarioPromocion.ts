/**
 * Lógica PURA del control «Cuándo está activa» (asistente paso 3 y edición
 * masiva de horario). Sin React y sin reloj implícito.
 *
 * Tres modos, que se guardan así (migración 20261120180000):
 *   - «Todo el día»: `applicable_days`, `start_time`, `end_time` y
 *     `schedule_windows` en NULL.
 *   - «Mismo horario cada día»: días + franja diaria, como siempre
 *     (`schedule_windows` NULL). Si el fin es menor que el inicio, termina
 *     al día siguiente y la madrugada cuenta como el día de inicio.
 *   - «Franja que cruza días»: `schedule_windows` (y las otras tres NULL).
 *
 * La vista previa de la semana y las próximas activaciones salen de
 * `vigencia.tramosSemanalesDe`, el mismo criterio con el que el motor decide
 * si la promoción aplica: lo que se ve es lo que cobra la caja.
 */
import type { WeekDay } from '@/components/pos/promociones/types';
import { addPlainDays, toPlainDate, wallTimeToInstant } from '@/lib/utils/dateCore';
import {
  DIAS_DESDE_LUNES,
  SEGUNDOS_DIA,
  SEGUNDOS_SEMANA,
  duracionFranjaSegundos,
  franjaSemanalValida,
  franjasSemanalesDe,
  tramosSemanalesDe,
  weekDayOfPlainDate,
  type FranjaSemanal,
  type HorarioPromocion,
} from '@/lib/promotions/vigencia';

export type ModoHorario = 'todo' | 'cadaDia' | 'cruza';

/** Franja a medio llenar en el formulario. */
export interface FranjaBorrador {
  desde_dia: WeekDay | '';
  desde_hora: string;
  hasta_dia: WeekDay | '';
  hasta_hora: string;
}

export interface HorarioFormulario {
  modo: ModoHorario;
  /** «Mismo horario cada día»: días elegidos (vacío = todos). */
  dias: WeekDay[];
  /** «Mismo horario cada día»: `HH:mm`. */
  inicio: string;
  fin: string;
  /** «Franja que cruza días». */
  franjas: FranjaBorrador[];
}

/** Columnas de `promotions` que escribe el control. */
export interface ColumnasHorario {
  applicable_days: WeekDay[] | null;
  start_time: string | null;
  end_time: string | null;
  schedule_windows: FranjaSemanal[] | null;
}

/** Tope de franjas por promoción (el mismo del CHECK). */
export const MAX_FRANJAS = 14;

export const FRANJA_VACIA: FranjaBorrador = { desde_dia: '', desde_hora: '', hasta_dia: '', hasta_hora: '' };

function horaCorta(valor: unknown): string {
  if (valor == null) return '';
  const m = String(valor).match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

/** Estado del control a partir de una fila (o del borrador del asistente). */
export function horarioDesdeColumnas(p: HorarioPromocion): HorarioFormulario {
  const vacio: HorarioFormulario = { modo: 'todo', dias: [], inicio: '', fin: '', franjas: [{ ...FRANJA_VACIA }] };
  const franjas = franjasSemanalesDe(p.schedule_windows);
  if (franjas) {
    return { ...vacio, modo: 'cruza', franjas: franjas.length > 0 ? franjas.map((f) => ({ ...f })) : [{ ...FRANJA_VACIA }] };
  }
  const dias = Array.isArray(p.applicable_days) ? (p.applicable_days.filter((d) => DIAS_DESDE_LUNES.includes(d as WeekDay)) as WeekDay[]) : [];
  const inicio = horaCorta(p.start_time);
  const fin = horaCorta(p.end_time);
  if (dias.length === 0 && !inicio && !fin) return vacio;
  return { ...vacio, modo: 'cadaDia', dias, inicio, fin };
}

/** Lo que se guarda. Un modo deja siempre en NULL las columnas del otro. */
export function columnasDeHorario(h: HorarioFormulario): ColumnasHorario {
  if (h.modo === 'cruza') {
    const franjas = h.franjas.map(franjaSemanalValida).filter((f): f is FranjaSemanal => f !== null);
    return { applicable_days: null, start_time: null, end_time: null, schedule_windows: franjas.length > 0 ? franjas : null };
  }
  if (h.modo === 'cadaDia') {
    return {
      applicable_days: h.dias.length > 0 ? DIAS_DESDE_LUNES.filter((d) => h.dias.includes(d)) : null,
      start_time: h.inicio || null,
      end_time: h.fin || null,
      schedule_windows: null,
    };
  }
  return { applicable_days: null, start_time: null, end_time: null, schedule_windows: null };
}

export type ErrorHorario =
  | 'horasFaltantes'
  | 'horasIguales'
  | 'franjaIncompleta'
  | 'franjaSinDuracion'
  | 'sinFranjas'
  | 'demasiadasFranjas';

/** Primer problema del control, o `null`. `franja` = índice de la franja con el problema. */
export function validarHorario(h: HorarioFormulario): { error: ErrorHorario; franja?: number } | null {
  if (h.modo === 'cadaDia') {
    if (!h.inicio || !h.fin) return { error: 'horasFaltantes' };
    if (h.inicio === h.fin) return { error: 'horasIguales' };
    return null;
  }
  if (h.modo === 'cruza') {
    if (h.franjas.length === 0) return { error: 'sinFranjas' };
    if (h.franjas.length > MAX_FRANJAS) return { error: 'demasiadasFranjas' };
    for (let i = 0; i < h.franjas.length; i++) {
      const f = h.franjas[i];
      if (!f.desde_dia || !f.hasta_dia || !horaCorta(f.desde_hora) || !horaCorta(f.hasta_hora)) return { error: 'franjaIncompleta', franja: i };
      if (!franjaSemanalValida(f)) return { error: 'franjaSinDuracion', franja: i };
    }
  }
  return null;
}

/** Duración en minutos de una franja del borrador; `null` si está incompleta. */
export function duracionBorradorMinutos(f: FranjaBorrador): number | null {
  if (!f.desde_dia || !f.hasta_dia || !horaCorta(f.desde_hora) || !horaCorta(f.hasta_hora)) return null;
  return Math.round(duracionFranjaSegundos({ desde_dia: f.desde_dia, desde_hora: horaCorta(f.desde_hora), hasta_dia: f.hasta_dia, hasta_hora: horaCorta(f.hasta_hora) }) / 60);
}

/** Minutos de una franja diaria `inicio`–`fin` (si fin < inicio, termina al día siguiente). */
export function duracionDiariaMinutos(inicio: string, fin: string): number | null {
  const a = horaCorta(inicio);
  const b = horaCorta(fin);
  if (!a || !b) return null;
  const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const d = (m(b) - m(a) + 24 * 60) % (24 * 60);
  return d === 0 ? null : d;
}

/** ¿La franja diaria termina al día siguiente? */
export function terminaAlDiaSiguiente(inicio: string, fin: string): boolean {
  const a = horaCorta(inicio);
  const b = horaCorta(fin);
  return Boolean(a && b && b < a);
}

// ─── Vista previa de la semana ──────────────────────────────────────────────

export interface SegmentoDia {
  /** Segundos desde la medianoche de ese día. */
  desde: number;
  hasta: number;
  /** Empieza a las 00:00 como continuación de una franja del día anterior. */
  continua: boolean;
}

/** Segmentos activos de cada día, lunes primero (índice 0 = lunes). */
export function vistaSemanal(p: HorarioPromocion): SegmentoDia[][] {
  const dias: SegmentoDia[][] = DIAS_DESDE_LUNES.map(() => []);
  for (const [a, b] of tramosSemanalesDe(p)) {
    for (const desplazamiento of [0, -SEGUNDOS_SEMANA]) {
      const x0 = a + desplazamiento;
      const x1 = b + desplazamiento;
      for (let k = 0; k < 7; k++) {
        const s0 = Math.max(x0, k * SEGUNDOS_DIA);
        const s1 = Math.min(x1, (k + 1) * SEGUNDOS_DIA);
        if (s0 < s1) dias[k].push({ desde: s0 - k * SEGUNDOS_DIA, hasta: s1 - k * SEGUNDOS_DIA, continua: s0 > x0 });
      }
    }
  }
  for (const segmentos of dias) segmentos.sort((x, y) => x.desde - y.desde);
  return dias;
}

// ─── Próximas activaciones ──────────────────────────────────────────────────

export interface Activacion {
  inicio: Date;
  fin: Date;
}

export interface ResumenActivaciones {
  primeras: Activacion[];
  /** Cuántas quedan dentro de la vigencia. `null` = sin fecha de fin (siguen cada semana). */
  total: number | null;
  /** La última dentro de la vigencia (solo con fecha de fin). */
  ultima: Activacion | null;
}

function horaDeSegundos(segundos: number): string {
  const s = ((segundos % SEGUNDOS_DIA) + SEGUNDOS_DIA) % SEGUNDOS_DIA;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

/** Un día YYYY-MM-DD es válido si existe en el calendario. */
function esDiaPlano(valor: string | null | undefined): valor is string {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

/** Tope de días que se recorren: diez años de vigencia. */
const MAX_DIAS = 3660;

/**
 * Activaciones que quedan desde `ahora` dentro de la vigencia `desde`–`hasta`
 * (días calendario de la organización). Una activación pertenece al día en
 * que EMPIEZA: con fecha fin «sábado», la de sábado 16:00 → domingo 14:00
 * cuenta entera, igual que en el motor. Una que ya empezó y no ha terminado
 * también se lista.
 */
export function proximasActivaciones(
  p: HorarioPromocion,
  o: { ahora: Date; zona: string; desde?: string | null; hasta?: string | null; limite?: number },
): ResumenActivaciones {
  const limite = o.limite ?? 3;
  const tramos = [...tramosSemanalesDe(p)].sort((x, y) => x[0] - y[0]);
  if (tramos.length === 0) return { primeras: [], total: 0, ultima: null };
  const hoy = toPlainDate(o.ahora, o.zona);
  const desde = esDiaPlano(o.desde) && o.desde > hoy ? o.desde : hoy;
  const hasta = esDiaPlano(o.hasta) ? o.hasta : null;
  if (hasta && hasta < addPlainDays(desde, -7)) return { primeras: [], total: 0, ultima: null };
  const umbral = Math.max(o.ahora.getTime(), esDiaPlano(o.desde) ? wallTimeToInstant(o.desde, '00:00', o.zona).getTime() : Number.NEGATIVE_INFINITY);

  const activacion = (dia: string, [a, b]: readonly [number, number]): Activacion => {
    const diasHastaFin = Math.floor(b / SEGUNDOS_DIA) - Math.floor(a / SEGUNDOS_DIA);
    return {
      inicio: wallTimeToInstant(dia, horaDeSegundos(a), o.zona),
      fin: wallTimeToInstant(addPlainDays(dia, diasHastaFin), horaDeSegundos(b), o.zona),
    };
  };

  const primeras: Activacion[] = [];
  let total = 0;
  let ultimaDia: string | null = null;
  let ultimoTramo: readonly [number, number] | null = null;
  // Se empieza una semana antes: una franja larga que empezó entonces puede seguir activa.
  const inicioRecorrido = addPlainDays(desde, -7);
  const finRecorrido = hasta ?? addPlainDays(desde, 7 * 8);
  const seguro = addPlainDays(desde, 8);
  for (let i = 0, dia = inicioRecorrido; i < MAX_DIAS && dia <= finRecorrido; i++, dia = addPlainDays(dia, 1)) {
    const indice = DIAS_DESDE_LUNES.indexOf(weekDayOfPlainDate(dia));
    for (const tramo of tramos) {
      if (Math.floor(tramo[0] / SEGUNDOS_DIA) !== indice) continue;
      // Pasado `seguro`, la activación empieza después de `ahora` y del inicio de la vigencia.
      let candidata: Activacion | null = null;
      if (dia < seguro) {
        candidata = activacion(dia, tramo);
        if (candidata.fin.getTime() <= umbral) continue;
      }
      total += 1;
      if (primeras.length < limite) primeras.push(candidata ?? activacion(dia, tramo));
      ultimaDia = dia;
      ultimoTramo = tramo;
    }
    if (!hasta && primeras.length >= limite) break;
  }
  if (!hasta) return { primeras, total: null, ultima: null };
  return { primeras, total, ultima: ultimaDia && ultimoTramo ? activacion(ultimaDia, ultimoTramo) : null };
}
