/**
 * Reglas puras de Asistencia, Horas extra y recargos y Novedades (Figma 20.10–20.12).
 * Sin React ni red: las prueban `__tests__/asistenciaLogica.test.ts`.
 *
 * Fechas: los días son `YYYY-MM-DD` (columnas `date`), así que se opera con
 * aritmética de días calendario, nunca con la zona del navegador.
 */
import { addPlainDays } from '@/lib/utils/dateCore';

/* ── Tipos de las respuestas de /api/hrm/asistencia/** ───────────────────── */

export interface PersonaAsistencia {
  employment_id: string;
  person_id: string | null;
  nombre: string;
  cargo: string | null;
  area: string | null;
  sede: string | null;
  branch_id: number | null;
}

export type EstadoHoy = 'presente' | 'tarde' | 'falta' | 'descanso' | 'salio' | 'ausencia' | 'por_llegar';
/**
 * Cómo marcó (`fn_hr_asistencia_hoy.como`). Marcación M0 suma `nfc` (etiqueta de la
 * sede), `carne`, `pin`, `rostro` y `huella` (kiosco M1 y relojes M2).
 */
export const COMOS_MARCO = ['ubicacion', 'qr', 'nfc', 'carne', 'pin', 'rostro', 'huella', 'remoto', 'manual', 'app'] as const;
export type ComoMarco = (typeof COMOS_MARCO)[number];

/** Valor de la base → `ComoMarco`; uno que esta versión no conoce se muestra como «—». */
export function comoDeValor(v: unknown): ComoMarco | null {
  return typeof v === 'string' && (COMOS_MARCO as readonly string[]).includes(v) ? (v as ComoMarco) : null;
}

/** Rutas de Marcación que abre el menú ⋯ de Asistencia (Figma 20.31.2). */
export const RUTA_MARCACION = '/app/hrm/marcacion';
export const RUTA_METODOS_SEDE = `${RUTA_MARCACION}?vista=metodos`;
export const RUTA_DISPOSITIVOS = `${RUTA_MARCACION}?vista=dispositivos`;

/**
 * «Mostrar el QR de la sede»: con una pantalla de QR en la sede, se abre la
 * primera en una pestaña nueva; sin ninguna, se lleva a agregarla.
 */
export function destinoQrSede(
  pantallas: readonly { id: string }[] | null | undefined
): { tipo: 'pantalla'; url: string } | { tipo: 'agregar'; url: string } {
  const primera = pantallas?.find((p) => typeof p.id === 'string' && p.id.length > 0);
  return primera
    ? { tipo: 'pantalla', url: `/marcacion/pantalla/${encodeURIComponent(primera.id)}` }
    : { tipo: 'agregar', url: `${RUTA_DISPOSITIVOS}&agregar=pantalla_qr` };
}

export interface FilaHoy extends PersonaAsistencia {
  turno: {
    nombre: string | null;
    inicio: string | null;
    fin: string | null;
  } | null;
  entrada: string | null;
  salida: string | null;
  como: ComoMarco | null;
  tarde_minutos: number | null;
  estado: EstadoHoy;
  remoto: boolean;
  ausencia: { clase: string; nombre?: string | null } | null;
}

export interface RespuestaHoy {
  fecha: string;
  ahora: string;
  zona: string;
  ambito: 'organizacion' | 'equipo';
  puede_gestionar: boolean;
  festivo: string | null;
  tolerancia_minutos: number;
  filas: FilaHoy[];
}

export type EstadoHojaPeriodo = 'por_aprobar' | 'aprobada' | 'sin_marcas';

export interface FilaHoja extends PersonaAsistencia {
  programadas: number;
  trabajadas: number;
  extra: number;
  nocturnas: number;
  dom_fest: number;
  pendientes: number;
  dias: number;
  dias_listos: number;
  listo_en: string | null;
  estado: EstadoHojaPeriodo;
}

export interface RespuestaHojas {
  desde: string;
  hasta: string;
  ambito: 'organizacion' | 'equipo';
  puede_gestionar: boolean;
  filas: FilaHoja[];
}

export const CATEGORIAS_HORA = [
  'ord_diurna',
  'ord_nocturna',
  'dom_diurna',
  'dom_nocturna',
  'extra_diurna',
  'extra_nocturna',
  'extra_dom_diurna',
  'extra_dom_nocturna',
] as const;
export type CategoriaHora = (typeof CATEGORIAS_HORA)[number];

export interface LineaHoras {
  categoria: CategoriaHora;
  minutos: number;
  recargo: number;
  divisor: number;
  fecha_local: string;
  motivo: 'dia_descanso' | 'festivo' | null;
}

export interface TramoHoras {
  inicio: string;
  fin: string;
  fecha_local: string;
  minutos: number;
  categoria: CategoriaHora;
  recargo: number;
  divisor: number;
}

export interface AlertaDia {
  codigo: 'extra_supera_tope_diario' | 'extra_supera_tope_semanal' | 'marcacion_incompleta';
  minutos?: number;
  tope_minutos?: number;
}

export interface NovedadDia {
  id: string;
  tipo: string;
  estado: string;
  minutos: number | null;
  justificacion: string | null;
  instancia_id: string | null;
}

export interface AjusteDia {
  id: string;
  tipo: string | null;
  hora: string | null;
  motivo: string;
  nota: string | null;
  estado: 'pending' | 'approved' | 'rejected';
  instancia_id: string | null;
  aplicado: boolean;
}

export interface DiaHoja {
  fecha: string;
  festivo: string | null;
  turno: {
    nombre: string | null;
    inicio: string | null;
    fin: string | null;
    planeado: number | null;
    descanso: boolean;
    asignacion_id: string;
  } | null;
  hoja: {
    id: string;
    estado: string;
    entrada: string | null;
    salida: string | null;
    trabajadas: number | null;
    programadas: number | null;
    tarde: number | null;
    salida_temprana: number | null;
    clasificada: boolean;
    marcacion_abierta: boolean;
    alertas: AlertaDia[];
    tramos: TramoHoras[];
  } | null;
  lineas: LineaHoras[];
  novedades: NovedadDia[];
  ajustes: AjusteDia[];
}

export interface DetalleParametro {
  valor: number | null;
  origen: 'organizacion' | 'plataforma' | string;
  desde: string | null;
  hasta: string | null;
  fuente: string | null;
  status?: string | null;
}

export interface RespuestaHoja {
  persona: PersonaAsistencia;
  desde: string;
  hasta: string;
  zona: string;
  hoy: string;
  propio: boolean;
  puede_gestionar: boolean;
  puede_ajustar: boolean;
  contrato_horas_semana: number | null;
  dias: DiaHoja[];
  vigencias: Record<
    string,
    Partial<
      Record<
        'recargo_dominical_festivo' | 'recargo_nocturno' | 'nocturno_hora_inicio' | 'recargo_extra_diurna' | 'recargo_extra_nocturna',
        DetalleParametro | null
      >
    >
  >;
  parametros: Partial<
    Record<
      'jornada_max_semanal' | 'horas_extra_max_dia' | 'horas_extra_max_semana' | 'nocturno_hora_inicio' | 'dominical_habitual_umbral_dias',
      DetalleParametro | null
    >
  >;
  dominicales_mes: Record<string, number>;
}

export interface FilaTope extends PersonaAsistencia {
  semana: string;
  hasta: string;
  trabajadas: number;
  extra: number;
  dia_max: string | null;
  extra_dia_max: number;
  jornada_horas: number;
  max_dia_horas: number;
  max_semana_horas: number;
  supera_semanal: boolean;
  supera_diario: boolean;
  supera_jornada: boolean;
}

export interface RespuestaTopes {
  desde: string;
  hasta: string;
  ambito: 'organizacion' | 'equipo';
  vigentes: {
    jornada_horas: number;
    max_dia_horas: number;
    max_semana_horas: number;
  };
  filas: FilaTope[];
}

export type TipoNovedad = 'horas_extra' | 'tardanza' | 'salida_temprana' | 'ausencia' | 'cambio_turno' | 'ajuste_marca';
export type EstadoNovedad = 'pendiente' | 'esperando_contraparte' | 'aprobada' | 'rechazada';

export interface FilaNovedad extends PersonaAsistencia {
  id: string;
  fuente: 'novedad' | 'ajuste';
  tipo: TipoNovedad;
  estado: EstadoNovedad;
  minutos: number | null;
  fecha: string;
  origen: 'automatica' | 'empleado' | 'gestor' | 'ajuste';
  justificacion: string | null;
  evento: string | null;
  hora: string | null;
  instancia_id: string | null;
  sin_aprobador: boolean;
  puede_decidir: boolean;
  solicito: string | null;
  lista_nomina: boolean;
  turno: {
    nombre: string | null;
    inicio: string | null;
    fin: string | null;
  } | null;
  cambio: { con: string | null; de: string | null; a: string | null } | null;
  extra: { categoria: CategoriaHora; recargo: number } | null;
  alertas: AlertaDia[];
  contraparte_pendiente: boolean;
}

export interface RespuestaNovedades {
  desde: string;
  hasta: string;
  ambito: 'organizacion' | 'equipo';
  puede_gestionar: boolean;
  periodo: {
    hojas: number;
    listas: number;
    lista_nomina: boolean;
    listo_en: string | null;
  };
  filas: FilaNovedad[];
}

/* ── Período ─────────────────────────────────────────────────────────────── */

function partes(fecha: string): [number, number, number] {
  const [a, m, d] = fecha.split('-').map(Number);
  return [a, m, d];
}

function dos(n: number): string {
  return String(n).padStart(2, '0');
}

export function finDeMes(fecha: string): string {
  const [a, m] = partes(fecha);
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${a}-${dos(m)}-${dos(dias)}`;
}

/** Quincena que contiene el día (1–15 o 16–fin de mes): el período de nómina por defecto. */
export function periodoQuincena(hoy: string): { desde: string; hasta: string } {
  const [a, m, d] = partes(hoy);
  if (d <= 15) return { desde: `${a}-${dos(m)}-01`, hasta: `${a}-${dos(m)}-15` };
  return { desde: `${a}-${dos(m)}-16`, hasta: finDeMes(hoy) };
}

/** Quincena siguiente a la que termina en `hasta`. */
export function quincenaSiguiente(hasta: string): {
  desde: string;
  hasta: string;
} {
  return periodoQuincena(addPlainDays(hasta, 1));
}

export function esQuincena(desde: string, hasta: string): boolean {
  const p = periodoQuincena(desde);
  return p.desde === desde && p.hasta === hasta;
}

/** Lunes de la semana (lunes a domingo) de un día calendario. */
export function lunesDe(fecha: string): string {
  const [a, m, d] = partes(fecha);
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return addPlainDays(fecha, dow === 0 ? -6 : 1 - dow);
}

export function diaSemana(fecha: string): number {
  const [a, m, d] = partes(fecha);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/* ── Números ─────────────────────────────────────────────────────────────── */

/** «79 h 20 min», «6 h», «18 min»; `0` → «0 h». Las unidades son las mismas en los 4 idiomas. */
export function textoDuracion(minutos: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(minutos) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0 && m === 0) return '0 h';
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${dos(m)} min`;
}

/** Duración o «—» si es cero (columnas de la tabla). */
export function duracionOGuion(minutos: number | null | undefined): string {
  return (Number(minutos) || 0) > 0 ? textoDuracion(minutos) : '—';
}

/** Diferencia con signo: «+ 8 min», «− 21 min», «—» si es cero. */
export function textoDiferencia(minutos: number | null | undefined): string {
  const n = Math.round(Number(minutos) || 0);
  if (n === 0) return '—';
  return `${n > 0 ? '+' : '−'} ${textoDuracion(Math.abs(n))}`;
}

/** Fracción a porcentaje entero: 0,9 → «90 %». */
export function textoPct(fraccion: number | null | undefined): string {
  return `${Math.round((Number(fraccion) || 0) * 100)} %`;
}

/* ── Hoy ─────────────────────────────────────────────────────────────────── */

export interface ResumenHoy {
  conTurno: number;
  presentes: number;
  faltan: number;
  tarde: number;
  descanso: number;
}

export function resumenHoy(filas: readonly FilaHoy[]): ResumenHoy {
  const r: ResumenHoy = {
    conTurno: 0,
    presentes: 0,
    faltan: 0,
    tarde: 0,
    descanso: 0,
  };
  for (const f of filas) {
    if (f.turno && f.estado !== 'ausencia') r.conTurno++;
    if (['presente', 'tarde', 'descanso', 'salio'].includes(f.estado)) r.presentes++;
    if (f.estado === 'falta') r.faltan++;
    if (f.tarde_minutos !== null && f.tarde_minutos > 0) r.tarde++;
    if (f.estado === 'descanso') r.descanso++;
  }
  return r;
}

/** Orden de la lista de hoy: primero quien falta, luego tarde, el resto por nombre (Figma móvil: «quién falta primero»). */
const PRIORIDAD_HOY: Record<EstadoHoy, number> = {
  falta: 0,
  tarde: 1,
  descanso: 2,
  presente: 3,
  salio: 4,
  por_llegar: 5,
  ausencia: 6,
};

export function ordenarHoy(filas: readonly FilaHoy[]): FilaHoy[] {
  return [...filas].sort((a, b) => PRIORIDAD_HOY[a.estado] - PRIORIDAD_HOY[b.estado] || a.nombre.localeCompare(b.nombre, 'es'));
}

export type TonoEstado = 'exito' | 'advertencia' | 'peligro' | 'neutro' | 'informacion' | 'marca';

export function tonoHoy(f: Pick<FilaHoy, 'estado'>): TonoEstado {
  switch (f.estado) {
    case 'presente':
      return 'exito';
    case 'tarde':
      return 'advertencia';
    case 'falta':
      return 'peligro';
    case 'ausencia':
      return 'informacion';
    default:
      return 'neutro';
  }
}

/** Clave i18n de la etiqueta del estado de hoy (`hrmAsistencia.hoy.estados.*`). */
export function claveEstadoHoy(f: Pick<FilaHoy, 'estado' | 'remoto' | 'ausencia'>): string {
  if (f.estado === 'ausencia') {
    const clase = f.ausencia?.clase ?? 'licencia';
    if (clase === 'vacaciones') return 'vacaciones';
    if (clase === 'incapacidad') return 'incapacidad';
    if (clase === 'justificada') return 'justificada';
    if (clase.startsWith('incapacidad')) return 'incapacidad';
    return 'licencia';
  }
  if (f.estado === 'presente' && f.remoto) return 'presenteRemoto';
  return f.estado;
}

/* ── Filtros ─────────────────────────────────────────────────────────────── */

export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function coincidePersona(p: Pick<PersonaAsistencia, 'nombre' | 'cargo' | 'area'>, texto: string, extra: string[] = []): boolean {
  const q = normalizar(texto);
  if (!q) return true;
  return [p.nombre, p.cargo ?? '', p.area ?? '', ...extra].some((v) => normalizar(v).includes(q));
}

/** Áreas presentes en la lista (para el filtro «Equipo»), ordenadas. */
export function areasDe(filas: readonly Pick<PersonaAsistencia, 'area'>[]): string[] {
  return Array.from(new Set(filas.map((f) => f.area).filter((a): a is string => !!a))).sort((a, b) => a.localeCompare(b, 'es'));
}

/* ── Hojas ───────────────────────────────────────────────────────────────── */

/** Una hoja se aprueba cuando no tiene ajustes ni novedades por aprobar (Figma 20.10.4). */
export function hojaAprobable(f: Pick<FilaHoja, 'estado' | 'pendientes'>): boolean {
  return f.estado === 'por_aprobar' && f.pendientes === 0;
}

/* ── Desglose de horas (20.11.1) ─────────────────────────────────────────── */

export interface DesglosePeriodo {
  total: number;
  ordinarias: number;
  dominicales: number;
  extra: number;
  nocturnas: number;
  porCategoria: Record<CategoriaHora, number>;
  /** Recargos del período: categoría + recargo, con sus minutos (una fila por valor vigente). */
  recargos: Array<{
    categoria: CategoriaHora;
    recargo: number;
    minutos: number;
    fecha: string;
  }>;
}

export function desglosePeriodo(dias: readonly Pick<DiaHoja, 'lineas'>[]): DesglosePeriodo {
  const porCategoria = Object.fromEntries(CATEGORIAS_HORA.map((c) => [c, 0])) as Record<CategoriaHora, number>;
  const recargos = new Map<
    string,
    {
      categoria: CategoriaHora;
      recargo: number;
      minutos: number;
      fecha: string;
    }
  >();
  for (const d of dias) {
    for (const l of d.lineas) {
      porCategoria[l.categoria] = (porCategoria[l.categoria] ?? 0) + l.minutos;
      if (l.categoria === 'ord_diurna') continue;
      const clave = `${l.categoria}|${Number(l.recargo).toFixed(4)}`;
      const r = recargos.get(clave) ?? {
        categoria: l.categoria,
        recargo: Number(l.recargo),
        minutos: 0,
        fecha: l.fecha_local,
      };
      r.minutos += l.minutos;
      recargos.set(clave, r);
    }
  }
  const ordinarias = porCategoria.ord_diurna + porCategoria.ord_nocturna;
  const dominicales = porCategoria.dom_diurna + porCategoria.dom_nocturna;
  const extra = porCategoria.extra_diurna + porCategoria.extra_nocturna + porCategoria.extra_dom_diurna + porCategoria.extra_dom_nocturna;
  return {
    total: ordinarias + dominicales + extra,
    ordinarias,
    dominicales,
    extra,
    nocturnas: porCategoria.ord_nocturna + porCategoria.dom_nocturna,
    porCategoria,
    recargos: Array.from(recargos.values()).sort(
      (a, b) => CATEGORIAS_HORA.indexOf(a.categoria) - CATEGORIAS_HORA.indexOf(b.categoria) || a.recargo - b.recargo
    ),
  };
}

/** Porcentaje entero de una parte sobre el total (0 si el total es 0). */
export function porcentaje(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

/** Columnas de la tabla del desglose: dominical y festiva juntan la ordinaria y la extra de esa clase. */
export function minutosColumna(
  lineas: readonly LineaHoras[],
  columna: 'ord_diurna' | 'ord_nocturna' | 'dom_diurna' | 'dom_nocturna' | 'extra_diurna' | 'extra_nocturna'
): number {
  const incluidas: Record<typeof columna, CategoriaHora[]> = {
    ord_diurna: ['ord_diurna'],
    ord_nocturna: ['ord_nocturna'],
    dom_diurna: ['dom_diurna'],
    dom_nocturna: ['dom_nocturna'],
    extra_diurna: ['extra_diurna', 'extra_dom_diurna'],
    extra_nocturna: ['extra_nocturna', 'extra_dom_nocturna'],
  };
  return lineas.filter((l) => incluidas[columna].includes(l.categoria)).reduce((s, l) => s + l.minutos, 0);
}

/** Días con dos o más valores del recargo dominical (un turno que cruza un cambio de vigencia, 20.11.2). */
export function vigenciasDistintas(tramos: readonly TramoHoras[]): number {
  return new Set(tramos.map((t) => `${t.categoria}|${Number(t.recargo).toFixed(4)}|${t.fecha_local}`)).size > 1
    ? new Set(tramos.map((t) => t.fecha_local)).size
    : 1;
}

/* ── Topes (20.11.3) ─────────────────────────────────────────────────────── */

export type TipoTope = 'semanal' | 'diario' | 'jornada';

/** El tope más grave que pasa la semana: semanal > diario > jornada. */
export function topePrincipal(f: Pick<FilaTope, 'supera_semanal' | 'supera_diario' | 'supera_jornada'>): TipoTope | null {
  if (f.supera_semanal) return 'semanal';
  if (f.supera_diario) return 'diario';
  if (f.supera_jornada) return 'jornada';
  return null;
}

export function tonoTope(t: TipoTope): TonoEstado {
  return t === 'semanal' ? 'peligro' : 'advertencia';
}

/* ── Novedades (20.12) ───────────────────────────────────────────────────── */

export type PestanaNovedades = 'por_aprobar' | 'aprobadas' | 'todas';

export function enPestana(f: Pick<FilaNovedad, 'estado'>, p: PestanaNovedades): boolean {
  if (p === 'por_aprobar') return f.estado === 'pendiente' || f.estado === 'esperando_contraparte';
  if (p === 'aprobadas') return f.estado === 'aprobada';
  return true;
}

export interface ConteoNovedades {
  porAprobar: number;
  aprobadas: number;
  rechazadas: number;
}

export function conteoNovedades(filas: readonly Pick<FilaNovedad, 'estado'>[]): ConteoNovedades {
  return {
    porAprobar: filas.filter((f) => f.estado === 'pendiente' || f.estado === 'esperando_contraparte').length,
    aprobadas: filas.filter((f) => f.estado === 'aprobada').length,
    rechazadas: filas.filter((f) => f.estado === 'rechazada').length,
  };
}

/** De dónde nació (columna «Origen»): la marcación, los turnos, un ajuste manual o alguien de RR. HH. */
export function origenNovedad(f: Pick<FilaNovedad, 'tipo' | 'origen'>): 'marcacion' | 'turnos' | 'ajuste' | 'gestor' | 'empleado' {
  if (f.tipo === 'ajuste_marca') return 'ajuste';
  if (f.tipo === 'cambio_turno') return 'turnos';
  if (f.origen === 'gestor') return 'gestor';
  if (f.origen === 'empleado') return 'empleado';
  return f.tipo === 'ausencia' ? 'turnos' : 'marcacion';
}

/** Estado visible: «Lista para nómina» manda sobre «Aprobada» cuando el día ya pasó a nómina. */
export function estadoVisible(f: Pick<FilaNovedad, 'estado' | 'lista_nomina'>): 'lista_nomina' | EstadoNovedad {
  return f.lista_nomina ? 'lista_nomina' : f.estado;
}

export function tonoNovedad(e: 'lista_nomina' | EstadoNovedad): TonoEstado {
  switch (e) {
    case 'aprobada':
      return 'exito';
    case 'rechazada':
      return 'peligro';
    case 'lista_nomina':
      return 'marca';
    case 'esperando_contraparte':
      return 'neutro';
    default:
      return 'advertencia';
  }
}

/** Se puede marcar el período «lista para nómina»: hay quien gestione y no queda nada por aprobar. */
export function puedeMarcarPeriodo(r: Pick<RespuestaNovedades, 'puede_gestionar' | 'periodo'>, porAprobar: number): boolean {
  return r.puede_gestionar && porAprobar === 0 && !r.periodo.lista_nomina;
}

/** La novedad del día que pasó un tope (para el aviso del diálogo «Revisar»). */
export function alertaTope(f: Pick<FilaNovedad, 'tipo' | 'alertas'>): AlertaDia | null {
  if (f.tipo !== 'horas_extra') return null;
  return f.alertas.find((a) => a.codigo === 'extra_supera_tope_diario' || a.codigo === 'extra_supera_tope_semanal') ?? null;
}

/** Valores vigentes de los recargos en un día (los que entrega `vigencias[fecha]`). */
export interface RecargosDelDia {
  dominical?: number | null;
  nocturno?: number | null;
  extraDiurna?: number | null;
  extraNocturna?: number | null;
}

/**
 * Partes del recargo de una categoría, para leerlo como lo hace la práctica
 * («90 % + 35 %»). Si los valores vigentes no suman el recargo guardado, se
 * muestra el recargo tal cual: manda lo que clasificó el motor.
 */
export function partesRecargo(categoria: CategoriaHora, recargo: number, v: RecargosDelDia): number[] {
  const dom = v.dominical ?? null;
  const noc = v.nocturno ?? null;
  const ed = v.extraDiurna ?? null;
  const en = v.extraNocturna ?? null;
  const candidatas: Record<CategoriaHora, Array<number | null>> = {
    ord_diurna: [],
    ord_nocturna: [noc],
    dom_diurna: [dom],
    dom_nocturna: [dom, noc],
    extra_diurna: [ed],
    extra_nocturna: [en],
    extra_dom_diurna: [dom, ed],
    extra_dom_nocturna: [dom, en],
  };
  const partes = candidatas[categoria];
  if (partes.length === 0) return [];
  if (partes.some((p) => p === null || p === undefined)) return [recargo];
  const suma = (partes as number[]).reduce((s, p) => s + Number(p), 0);
  return Math.abs(suma - recargo) < 0.0005 ? (partes as number[]).map(Number) : [recargo];
}

/** Tramos seguidos con el mismo día local, categoría y recargo se leen como uno (Figma 20.11.2). */
export function agruparTramos(tramos: readonly TramoHoras[]): TramoHoras[] {
  const orden = [...tramos].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
  const out: TramoHoras[] = [];
  for (const t of orden) {
    const u = out[out.length - 1];
    if (u && u.fecha_local === t.fecha_local && u.categoria === t.categoria && Math.abs(u.recargo - t.recargo) < 0.0005 && u.fin === t.inicio) {
      out[out.length - 1] = {
        ...u,
        fin: t.fin,
        minutos: u.minutos + t.minutos,
      };
    } else {
      out.push({ ...t });
    }
  }
  return out;
}

/** Domingos de un mes (`YYYY-MM`), para «2 de 4 domingos del mes». */
export function domingosDelMes(mes: string): number {
  const [a, m] = mes.split('-').map(Number);
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= dias; d++) if (new Date(Date.UTC(a, m - 1, d)).getUTCDay() === 0) n++;
  return n;
}
