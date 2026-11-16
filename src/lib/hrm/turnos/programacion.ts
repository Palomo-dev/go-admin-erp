/**
 * Reglas puras de la programación de turnos (Figma 20.8) y de la semana del
 * jefe (20.15). Sin React ni base: las prueban `__tests__/programacion.test.ts`.
 *
 * Las fechas de trabajo son `date` (días calendario «AAAA-MM-DD»): se suman y
 * comparan como texto, sin pasar por zonas. Las horas de inicio y fin vienen ya
 * calculadas por la base en la zona de la sede (`start_at` / `end_at`).
 */
import { addPlainDays } from '@/lib/utils/dateCore';

export interface PersonaSemana {
  id: string;
  nombre: string;
  cargo: string | null;
  area: string | null;
  area_id: string | null;
  sede_id: number | null;
  jornada_semana: number | null;
  jefe_id: string | null;
}

export interface AsignacionSemana {
  id: string;
  employment_id: string;
  fecha: string;
  inicio: string | null;
  fin: string | null;
  minutos: number | null;
  descanso_min: number | null;
  dia_descanso: boolean;
  borrador: boolean;
  publicado_en: string | null;
  plantilla_id: string | null;
  plantilla: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
}

export interface AusenciaSemana {
  id: string;
  employment_id: string;
  desde: string;
  hasta: string;
  estado: 'requested' | 'approved' | 'taken';
  /** `incapacidad` sin etiqueta cuando quien mira no ve salud (decisión 2). */
  clase: string | null;
  etiqueta: string | null;
}

export interface FestivoSemana {
  fecha: string;
  nombre: string;
  origen: 'plataforma' | 'organizacion';
}

export interface PlantillaSemana {
  id: string;
  nombre: string;
  hora_inicio: string;
  hora_fin: string;
  descanso_min: number | null;
  descanso_pagado: boolean;
}

export interface RespuestaSemana {
  zona: string;
  permisos: { gestionar: boolean; ver_borradores: boolean; ausencias_org: boolean };
  personas: PersonaSemana[];
  asignaciones: AsignacionSemana[];
  ausencias: AusenciaSemana[];
  festivos: FestivoSemana[];
  plantillas: PlantillaSemana[];
  publicada_en: string | null;
  borradores: number;
}

export interface Hallazgo {
  codigo: string;
  employment_id: string;
  fechas?: string[];
  semana?: string;
  asignaciones?: string[];
  minutos_extra?: number;
  minutos_planeados?: number;
  tope_minutos?: number;
  en_el_mes?: number;
  umbral_habitual?: number;
}

export interface Validacion {
  bloqueos: Hallazgo[];
  alertas: Hallazgo[];
  publicado?: boolean;
  publicados?: number;
  novedades?: number;
  requiere_confirmacion?: boolean;
  requiere_motivo?: boolean;
}

/** Alertas que son «tope» (decisión 4: dejan publicar con motivo y crean una novedad). */
export const CODIGOS_TOPE = ['extra_planeada', 'extra_diaria_supera_tope', 'semana_supera_jornada', 'extra_semanal_supera_tope'] as const;

export function esTope(h: Pick<Hallazgo, 'codigo'>): boolean {
  return (CODIGOS_TOPE as readonly string[]).includes(h.codigo);
}

// ─── Plantillas y rotaciones (rutas /api/hrm/turnos/plantillas y /rotaciones) ──

export interface PlantillaTurno {
  id: string;
  nombre: string;
  hora_inicio: string;
  hora_fin: string;
  descanso_min: number;
  descanso_pagado: boolean;
  activa: boolean;
  /** Días ISO (1 = lunes … 7 = domingo) en que se usa; vacío = todos. */
  dias: number[];
  en_uso: number;
}

export interface RotacionTurno {
  id: string;
  nombre: string;
  descripcion: string | null;
  ciclo_dias: number;
  patron: Array<string | null>;
  activa: boolean;
  personas: number;
  empezo: string | null;
  ultima_generada: string | null;
}

// ─── Semana ──────────────────────────────────────────────────────────────────

/** Día ISO de un `date` (1 = lunes … 7 = domingo), sin zona. */
export function diaIso(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/** Lunes de la semana del día. */
export function lunesDe(fecha: string): string {
  return addPlainDays(fecha, 1 - diaIso(fecha));
}

/** Los 7 días de la semana que empieza en `lunes`. */
export function diasDeSemana(lunes: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addPlainDays(lunes, i));
}

// ─── Celdas ──────────────────────────────────────────────────────────────────

export type TipoCelda = 'turno' | 'borrador' | 'cruce' | 'tope' | 'descanso' | 'ausencia' | 'vacio';

export interface Celda {
  tipo: TipoCelda;
  fecha: string;
  asignacion: AsignacionSemana | null;
  ausencia: AusenciaSemana | null;
  /** Con un cruce: la otra plantilla con la que se pisa. */
  cruzaCon: string | null;
  /** Con un tope: horas planeadas de la semana. */
  minutosSemana: number | null;
  festivo: FestivoSemana | null;
}

function indexar<T>(lista: T[], clave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of lista) {
    const k = clave(x);
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return m;
}

export interface IndiceSemana {
  porPersonaDia: Map<string, AsignacionSemana[]>;
  ausencias: Map<string, AusenciaSemana[]>;
  festivos: Map<string, FestivoSemana>;
  cruces: Map<string, string[]>;
  topesDia: Set<string>;
  topesSemana: Map<string, number>;
}

/** Índices para pintar la grilla sin recorrer las listas en cada celda. */
export function indexarSemana(datos: Pick<RespuestaSemana, 'asignaciones' | 'ausencias' | 'festivos'>, validacion: Validacion | null): IndiceSemana {
  const porPersonaDia = indexar(datos.asignaciones, (a) => `${a.employment_id}|${a.fecha}`);
  const ausencias = indexar(datos.ausencias, (a) => a.employment_id);
  const festivos = new Map(datos.festivos.map((f) => [f.fecha, f]));
  const cruces = new Map<string, string[]>();
  for (const b of validacion?.bloqueos ?? []) {
    if (b.codigo !== 'turno_cruzado') continue;
    for (const id of b.asignaciones ?? []) cruces.set(id, (b.asignaciones ?? []).filter((x) => x !== id));
  }
  const topesDia = new Set<string>();
  const topesSemana = new Map<string, number>();
  for (const a of validacion?.alertas ?? []) {
    if (!esTope(a)) continue;
    if (a.fechas?.length) for (const f of a.fechas) topesDia.add(`${a.employment_id}|${f}`);
    if (a.semana) topesSemana.set(`${a.employment_id}|${a.semana}`, a.minutos_planeados ?? 0);
  }
  return { porPersonaDia, ausencias, festivos, cruces, topesDia, topesSemana };
}

export function ausenciaDelDia(indice: IndiceSemana, persona: string, fecha: string): AusenciaSemana | null {
  return (indice.ausencias.get(persona) ?? []).find((a) => a.desde <= fecha && a.hasta >= fecha) ?? null;
}

/**
 * Celdas de una persona en un día. Normalmente una; con un cruce, las dos que se
 * pisan (Figma 20.8.1: «Cruza con Apertura»).
 */
export function celdasDe(indice: IndiceSemana, persona: string, fecha: string, todas: AsignacionSemana[]): Celda[] {
  const festivo = indice.festivos.get(fecha) ?? null;
  const asignaciones = indice.porPersonaDia.get(`${persona}|${fecha}`) ?? [];
  const ausencia = ausenciaDelDia(indice, persona, fecha);
  if (asignaciones.length === 0) {
    return [{ tipo: ausencia ? 'ausencia' : 'vacio', fecha, asignacion: null, ausencia, cruzaCon: null, minutosSemana: null, festivo }];
  }
  return asignaciones.map((a) => {
    const otros = indice.cruces.get(a.id);
    if (otros?.length) {
      const otra = todas.find((x) => x.id === otros[0]);
      return { tipo: 'cruce', fecha, asignacion: a, ausencia, cruzaCon: otra?.plantilla ?? otra?.hora_inicio ?? null, minutosSemana: null, festivo };
    }
    if (a.dia_descanso) return { tipo: 'descanso', fecha, asignacion: a, ausencia, cruzaCon: null, minutosSemana: null, festivo };
    if (indice.topesDia.has(`${persona}|${fecha}`)) {
      return { tipo: 'tope', fecha, asignacion: a, ausencia, cruzaCon: null, minutosSemana: null, festivo };
    }
    return { tipo: a.borrador ? 'borrador' : 'turno', fecha, asignacion: a, ausencia, cruzaCon: null, minutosSemana: null, festivo };
  });
}

/** Minutos planeados de la persona en los días dados (sin días de descanso). */
export function minutosDePersona(asignaciones: AsignacionSemana[], persona: string, dias: string[]): number {
  const set = new Set(dias);
  return asignaciones
    .filter((a) => a.employment_id === persona && set.has(a.fecha) && !a.dia_descanso)
    .reduce((s, a) => s + (a.minutos ?? 0), 0);
}

/** Tono de la insignia de horas: rojo con cruce, ámbar por encima del tope, neutro si no. */
export function tonoHoras(persona: string, indice: IndiceSemana, lunes: string): 'peligro' | 'advertencia' | 'neutro' {
  for (const [id] of indice.cruces) {
    const fila = Array.from(indice.porPersonaDia.values()).flat().find((a) => a.id === id);
    if (fila?.employment_id === persona && fila.fecha >= lunes && fila.fecha <= addPlainDays(lunes, 6)) return 'peligro';
  }
  if (indice.topesSemana.has(`${persona}|${lunes}`)) return 'advertencia';
  for (const k of indice.topesDia) if (k.startsWith(`${persona}|`)) return 'advertencia';
  return 'neutro';
}

/** «49 h», «6 h 30 min». */
export function partesHoras(minutos: number): { h: number; m: number } {
  const t = Math.max(0, Math.round(minutos));
  return { h: Math.floor(t / 60), m: t % 60 };
}

// ─── Hallazgos ───────────────────────────────────────────────────────────────

export interface ResumenHallazgos {
  cruces: number;
  topes: number;
  otras: number;
}

/** Cruces (cada par cuenta una vez) y topes de la validación. */
export function resumenHallazgos(v: Validacion | null): ResumenHallazgos {
  if (!v) return { cruces: 0, topes: 0, otras: 0 };
  const cruces = v.bloqueos.filter((b) => b.codigo === 'turno_cruzado').length + v.bloqueos.filter((b) => b.codigo === 'turno_en_ausencia').length;
  const topes = v.alertas.filter(esTope).length;
  return { cruces, topes, otras: v.alertas.length - topes };
}

// ─── Filtros ─────────────────────────────────────────────────────────────────

export interface FiltrosProgramacion {
  texto: string;
  area: string | null;
  cargo: string | null;
  mostrar: 'todo' | 'cruces' | 'topes';
  estado: 'todos' | 'borrador';
  plantilla: string | null;
  incluirAusencias: boolean;
  incluirDescansos: boolean;
  soloConTurno: boolean;
}

export const FILTROS_INICIALES: FiltrosProgramacion = {
  texto: '',
  area: null,
  cargo: null,
  mostrar: 'todo',
  estado: 'todos',
  plantilla: null,
  incluirAusencias: true,
  incluirDescansos: false,
  soloConTurno: true,
};

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Personas visibles según los filtros (Figma 20.8.6). */
export function filtrarPersonas(
  datos: Pick<RespuestaSemana, 'personas' | 'asignaciones' | 'ausencias'>,
  dias: string[],
  indice: IndiceSemana,
  f: FiltrosProgramacion
): PersonaSemana[] {
  const q = normalizar(f.texto);
  const enRango = (a: AsignacionSemana) => dias.includes(a.fecha);
  return datos.personas.filter((p) => {
    if (q && !normalizar(`${p.nombre} ${p.cargo ?? ''} ${p.area ?? ''}`).includes(q)) return false;
    if (f.area && p.area_id !== f.area) return false;
    if (f.cargo && p.cargo !== f.cargo) return false;
    const suyas = datos.asignaciones.filter((a) => a.employment_id === p.id && enRango(a));
    if (f.plantilla && !suyas.some((a) => a.plantilla_id === f.plantilla)) return false;
    if (f.estado === 'borrador' && !suyas.some((a) => a.borrador)) return false;
    if (f.mostrar === 'cruces' && !suyas.some((a) => indice.cruces.has(a.id))) return false;
    if (f.mostrar === 'topes' && tonoHoras(p.id, indice, dias[0]) !== 'advertencia') return false;
    const conTurno = suyas.some((a) => !a.dia_descanso);
    const ausente = dias.some((d) => ausenciaDelDia(indice, p.id, d));
    if (f.soloConTurno && !conTurno && !(f.incluirAusencias && ausente) && !(f.incluirDescansos && suyas.length > 0)) return false;
    return true;
  });
}

export function filtrosActivos(f: FiltrosProgramacion): number {
  return (
    (f.area ? 1 : 0) +
    (f.cargo ? 1 : 0) +
    (f.mostrar !== 'todo' ? 1 : 0) +
    (f.estado !== 'todos' ? 1 : 0) +
    (f.plantilla ? 1 : 0) +
    (f.incluirAusencias !== FILTROS_INICIALES.incluirAusencias ? 1 : 0) +
    (f.incluirDescansos !== FILTROS_INICIALES.incluirDescansos ? 1 : 0) +
    (f.soloConTurno !== FILTROS_INICIALES.soloConTurno ? 1 : 0)
  );
}

// ─── Exportar ────────────────────────────────────────────────────────────────

function celdaCsv(v: string): string {
  return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV de la semana: una fila por persona, una columna por día y las horas. */
export function csvSemana(
  personas: PersonaSemana[],
  dias: string[],
  asignaciones: AsignacionSemana[],
  textos: { persona: string; horas: string; descanso: string; dia: (fecha: string) => string }
): string {
  const filas = [[textos.persona, ...dias.map(textos.dia), textos.horas]];
  for (const p of personas) {
    const fila = [p.nombre];
    for (const d of dias) {
      const a = asignaciones.filter((x) => x.employment_id === p.id && x.fecha === d);
      fila.push(a.map((x) => (x.dia_descanso ? textos.descanso : `${x.hora_inicio ?? ''}-${x.hora_fin ?? ''}${x.plantilla ? ` ${x.plantilla}` : ''}`)).join(' / '));
    }
    const { h, m } = partesHoras(minutosDePersona(asignaciones, p.id, dias));
    fila.push(m ? `${h}:${String(m).padStart(2, '0')}` : String(h));
    filas.push(fila);
  }
  return filas.map((f) => f.map(celdaCsv).join(',')).join('\n');
}

// ─── Plantillas ──────────────────────────────────────────────────────────────

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Duración y minutos nocturnos de una plantilla (Figma 20.8.9). La franja
 * nocturna sale del parámetro vigente (horas enteras, p. ej. 19 → 6); el
 * descanso no pagado se resta de las diurnas primero.
 */
export function calcularPlantilla(
  inicio: string,
  fin: string,
  descansoMin: number,
  descansoPagado: boolean,
  nocturno: { inicio: number | null; fin: number | null }
): { duracion: number; nocturnas: number; diurnas: number; cruzaMedianoche: boolean } {
  const a = aMinutos(inicio);
  let b = aMinutos(fin);
  const cruza = b <= a;
  if (cruza) b += 1440;
  const bruto = b - a;
  let noct = 0;
  if (nocturno.inicio !== null && nocturno.fin !== null) {
    const ni = nocturno.inicio * 60;
    const nf = nocturno.fin * 60;
    for (let t = a; t < b; t++) {
      const m = t % 1440;
      const enNoche = ni > nf ? m >= ni || m < nf : m >= ni && m < nf;
      if (enNoche) noct++;
    }
  }
  const duracion = Math.max(0, bruto - (descansoPagado ? 0 : descansoMin));
  const nocturnas = Math.min(noct, duracion);
  return { duracion, nocturnas, diurnas: duracion - nocturnas, cruzaMedianoche: cruza };
}

/** Días ISO de una plantilla como rangos: [1..7] → «lun a dom», [5,6] → «vie y sáb». */
export function rangosDias(dias: number[]): Array<[number, number]> {
  const d = [...dias].sort((x, y) => x - y);
  const out: Array<[number, number]> = [];
  for (const x of d) {
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo[1] === x - 1) ultimo[1] = x;
    else out.push([x, x]);
  }
  return out;
}
