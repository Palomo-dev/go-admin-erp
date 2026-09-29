/**
 * Importación CSV de clases y de reservas (docs/design/MEMBRESIAS-FASE-1-2.md §13) — lógica pura.
 *
 * El archivo se lee con el lector del importador de productos (`leerMatriz`: UTF-8 o Windows-1252,
 * separador «,», «;» o tabulador) y los normalizadores compartidos (`importacion/texto.ts`). Aquí:
 * reconocer las columnas (es/en/fr/pt, sin tildes ni mayúsculas), normalizar cada celda al valor
 * que acepta la base (fechas `YYYY-MM-DD`, horas `HH:mm`, estados y niveles de las CHECK) y marcar
 * los errores que se ven sin consultar la base. Lo que depende de la base (miembro, clase,
 * instructor, sede, cupo, duplicadas ya guardadas) lo valida la RPC en la vista previa
 * (`p_solo_validar`) y otra vez al importar: la importación es TODO O NADA.
 *
 * Fechas: la fecha y la hora del archivo son de pared, en la zona de la sede de la clase. El
 * navegador nunca las convierte con su propia zona: la base las interpreta con `fn_timezone_for`;
 * `inicioPrevisto` solo pinta la vista previa con la zona de la organización.
 */
import { filasACsv } from '@/lib/utils/csv';
import { normalizarCabecera, normalizarNombre, parseNumero, textoCelda } from '@/lib/inventario/importacion/texto';
import { instanteEnZona } from './operacion';

export type TipoImportacion = 'clases' | 'reservas';

/** Tope por importación (la RPC tiene el mismo). */
export const MAX_FILAS_IMPORTACION = 500;

// ─── Columnas ───────────────────────────────────────────────────────────────

export interface ColumnaCsv<C extends string> {
  campo: C;
  /** Cabecera de la plantilla (en español, sin tildes). */
  cabecera: string;
  obligatoria: boolean;
  /** Otras cabeceras que se reconocen (se comparan normalizadas). */
  alias: string[];
}

export type CampoClase =
  | 'titulo'
  | 'tipo'
  | 'sede'
  | 'instructor'
  | 'fecha'
  | 'hora'
  | 'duracion'
  | 'capacidad'
  | 'sala'
  | 'nivel'
  | 'estado'
  | 'descripcion'
  | 'equipo';

export type CampoReserva = 'documento' | 'correo' | 'clase' | 'fecha' | 'hora' | 'sede' | 'estado' | 'origen' | 'notas';

export const COLUMNAS_CLASES: ColumnaCsv<CampoClase>[] = [
  { campo: 'titulo', cabecera: 'titulo', obligatoria: true, alias: ['título', 'title', 'nombre', 'clase', 'titre', 'nom', 'cours'] },
  { campo: 'tipo', cabecera: 'tipo', obligatoria: false, alias: ['type', 'tipo de clase', 'class type'] },
  { campo: 'sede', cabecera: 'sede', obligatoria: false, alias: ['sucursal', 'branch', 'site', 'filial', 'unidade'] },
  { campo: 'instructor', cabecera: 'instructor', obligatoria: true, alias: ['correo instructor', 'instructor email', 'coach', 'profesor', 'instrutor', 'moniteur'] },
  { campo: 'fecha', cabecera: 'fecha', obligatoria: true, alias: ['date', 'dia', 'día', 'data'] },
  { campo: 'hora', cabecera: 'hora', obligatoria: true, alias: ['hora inicio', 'hora de inicio', 'time', 'start time', 'heure', 'horario'] },
  { campo: 'duracion', cabecera: 'duracion_min', obligatoria: false, alias: ['duración', 'duracion', 'duration', 'minutos', 'minutes', 'duree', 'duracao'] },
  { campo: 'capacidad', cabecera: 'capacidad', obligatoria: false, alias: ['cupo', 'cupos', 'capacity', 'capacite', 'capacidade'] },
  { campo: 'sala', cabecera: 'sala', obligatoria: false, alias: ['salon', 'salón', 'room', 'espacio', 'salle'] },
  { campo: 'nivel', cabecera: 'nivel', obligatoria: false, alias: ['level', 'dificultad', 'difficulty', 'niveau'] },
  { campo: 'estado', cabecera: 'estado', obligatoria: false, alias: ['status', 'statut'] },
  { campo: 'descripcion', cabecera: 'descripcion', obligatoria: false, alias: ['descripción', 'description', 'descricao'] },
  { campo: 'equipo', cabecera: 'equipo', obligatoria: false, alias: ['equipamiento', 'equipment', 'materiales', 'equipement', 'equipamento'] },
];

export const COLUMNAS_RESERVAS: ColumnaCsv<CampoReserva>[] = [
  { campo: 'documento', cabecera: 'documento', obligatoria: false, alias: ['cedula', 'cédula', 'identificacion', 'identificación', 'document', 'numero de documento', 'documento miembro', 'cpf'] },
  { campo: 'correo', cabecera: 'correo', obligatoria: false, alias: ['email', 'e-mail', 'correo electronico', 'correo electrónico', 'courriel'] },
  { campo: 'clase', cabecera: 'clase', obligatoria: true, alias: ['titulo', 'título', 'class', 'titulo de la clase', 'cours', 'aula'] },
  { campo: 'fecha', cabecera: 'fecha', obligatoria: true, alias: ['date', 'dia', 'día', 'data', 'fecha de la clase'] },
  { campo: 'hora', cabecera: 'hora', obligatoria: true, alias: ['hora inicio', 'hora de inicio', 'time', 'start time', 'heure', 'horario'] },
  { campo: 'sede', cabecera: 'sede', obligatoria: false, alias: ['sucursal', 'branch', 'site', 'filial', 'unidade'] },
  { campo: 'estado', cabecera: 'estado', obligatoria: false, alias: ['status', 'statut', 'asistencia'] },
  { campo: 'origen', cabecera: 'origen', obligatoria: false, alias: ['source', 'canal', 'origine', 'origem'] },
  { campo: 'notas', cabecera: 'notas', obligatoria: false, alias: ['nota', 'notes', 'observaciones', 'comentarios', 'observacoes'] },
];

// ─── Errores ────────────────────────────────────────────────────────────────

/** Errores de archivo (antes de las filas). */
export type ErrorArchivo = 'sin_cabecera' | 'faltan_columnas' | 'sin_filas' | 'demasiadas_filas';

/**
 * Errores por fila. Los primeros los detecta el navegador; los demás los devuelve la RPC con el
 * mismo código (se traducen en `membresias.importar.errores.<codigo>`).
 */
export const ERRORES_FILA = [
  // Navegador
  'titulo_requerido',
  'titulo_muy_largo',
  'instructor_requerido',
  'correo_invalido',
  'fecha_requerida',
  'fecha_invalida',
  'hora_requerida',
  'hora_invalida',
  'duracion_invalida',
  'capacidad_invalida',
  'nivel_invalido',
  'estado_invalido',
  'origen_invalido',
  'miembro_requerido',
  'clase_requerida',
  'duplicada_en_archivo',
  // Base
  'sede_requerida',
  'sede_no_encontrada',
  'sede_ambigua',
  'sede_sin_acceso',
  'instructor_no_encontrado',
  'clase_ya_existe',
  'miembro_no_encontrado',
  'miembro_ambiguo',
  'miembro_no_coincide',
  'clase_no_encontrada',
  'clase_ambigua',
  'clase_cancelada',
  'clase_no_programada',
  'clase_sin_cupo',
  'reserva_ya_existe',
] as const;

export type ErrorFila = (typeof ERRORES_FILA)[number];

export function esErrorFilaConocido(codigo: string): codigo is ErrorFila {
  return (ERRORES_FILA as readonly string[]).includes(codigo);
}

// ─── Normalizadores de celda ────────────────────────────────────────────────

function esFechaReal(a: number, m: number, d: number): boolean {
  if (a < 1900 || a > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

const dos = (n: number) => String(n).padStart(2, '0');

/**
 * Día calendario del archivo → `YYYY-MM-DD`. Acepta `2026-10-05`, `2026/10/05`, `05/10/2026`,
 * `5-10-2026` y `05.10.2026` (día primero, como se escribe en Colombia). Un día que no existe
 * (30 de febrero) es `null`. Nunca pasa por `Date` con la zona del navegador.
 */
export function normalizarFecha(valor: unknown): string | null {
  const s = textoCelda(valor);
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) {
    const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return esFechaReal(a, mes, d) ? `${a}-${dos(mes)}-${dos(d)}` : null;
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) {
    const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return esFechaReal(a, mes, d) ? `${a}-${dos(mes)}-${dos(d)}` : null;
  }
  return null;
}

/**
 * Hora de pared → `HH:mm`. Acepta `7:00`, `07:00`, `07:00:00`, `7:30 pm`, `7:30 p. m.`, `19h30`
 * y `7 am`. Fuera de rango es `null`.
 */
export function normalizarHora(valor: unknown): string | null {
  const s = textoCelda(valor)?.toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  const m = /^(\d{1,2})(?:[:h](\d{2}))?(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] !== undefined ? Number(m[2]) : 0;
  const sufijo = m[4]?.replace(/[.\s]/g, '');
  if (m[2] === undefined && !sufijo) return null; // «7» sola es ambigua
  if (min > 59 || (m[3] !== undefined && Number(m[3]) > 59)) return null;
  if (sufijo) {
    if (h < 1 || h > 12) return null;
    if (sufijo === 'pm' && h !== 12) h += 12;
    if (sufijo === 'am' && h === 12) h = 0;
  }
  if (h > 23) return null;
  return `${dos(h)}:${dos(min)}`;
}

/** Entero positivo de una celda («60», «60,0», «1.000» no: fuera de rango se decide aparte). */
export function enteroCelda(valor: unknown): number | null | 'invalido' {
  if (textoCelda(valor) === undefined) return null;
  const n = parseNumero(valor);
  if (n === null || !Number.isInteger(n) || n < 0) return 'invalido';
  return n;
}

function porAlias<T extends string>(valor: unknown, tabla: Record<string, T>): T | null | 'invalido' {
  const s = normalizarNombre(valor);
  if (!s) return null;
  return tabla[s] ?? 'invalido';
}

const NIVELES: Record<string, 'beginner' | 'intermediate' | 'advanced' | 'all_levels'> = {
  beginner: 'beginner',
  principiante: 'beginner',
  basico: 'beginner',
  inicial: 'beginner',
  debutant: 'beginner',
  iniciante: 'beginner',
  intermediate: 'intermediate',
  intermedio: 'intermediate',
  intermediaire: 'intermediate',
  intermediario: 'intermediate',
  advanced: 'advanced',
  avanzado: 'advanced',
  avance: 'advanced',
  avancado: 'advanced',
  all_levels: 'all_levels',
  'all levels': 'all_levels',
  todos: 'all_levels',
  'todos los niveles': 'all_levels',
  'tous niveaux': 'all_levels',
  'todos os niveis': 'all_levels',
};

const ESTADOS_CLASE: Record<string, 'active' | 'completed'> = {
  active: 'active',
  activa: 'active',
  programada: 'active',
  scheduled: 'active',
  programmee: 'active',
  agendada: 'active',
  completed: 'completed',
  completada: 'completed',
  realizada: 'completed',
  terminee: 'completed',
  concluida: 'completed',
};

const ESTADOS_RESERVA: Record<string, 'booked' | 'checked_in' | 'no_show' | 'cancelled'> = {
  booked: 'booked',
  reservada: 'booked',
  reservado: 'booked',
  reservee: 'booked',
  checked_in: 'checked_in',
  'checked in': 'checked_in',
  asistio: 'checked_in',
  asistida: 'checked_in',
  attended: 'checked_in',
  present: 'checked_in',
  compareceu: 'checked_in',
  no_show: 'no_show',
  'no show': 'no_show',
  'no asistio': 'no_show',
  inasistencia: 'no_show',
  absent: 'no_show',
  faltou: 'no_show',
  cancelled: 'cancelled',
  cancelada: 'cancelled',
  anulada: 'cancelled',
  annulee: 'cancelled',
};

const ORIGENES: Record<string, 'staff' | 'app' | 'web' | 'kiosk'> = {
  staff: 'staff',
  recepcion: 'staff',
  personal: 'staff',
  accueil: 'staff',
  app: 'app',
  aplicacion: 'app',
  web: 'web',
  'sitio web': 'web',
  kiosk: 'kiosk',
  kiosco: 'kiosk',
  quiosque: 'kiosk',
  borne: 'kiosk',
};

export const normalizarNivel = (v: unknown) => porAlias(v, NIVELES);
export const normalizarEstadoClase = (v: unknown) => porAlias(v, ESTADOS_CLASE);
export const normalizarEstadoReserva = (v: unknown) => porAlias(v, ESTADOS_RESERVA);
export const normalizarOrigen = (v: unknown) => porAlias(v, ORIGENES);

const CORREO = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

// ─── Cabecera ───────────────────────────────────────────────────────────────

export interface MapeoCabecera<C extends string> {
  /** Índice de columna por campo reconocido. */
  indices: Partial<Record<C, number>>;
  faltantes: C[];
  /** Cabeceras que no corresponden a ningún campo (se ignoran). */
  ignoradas: string[];
}

export function mapearCabecera<C extends string>(cabecera: readonly unknown[], columnas: ColumnaCsv<C>[]): MapeoCabecera<C> {
  const porNombre = new Map<string, C>();
  for (const c of columnas) {
    for (const n of [c.cabecera, c.campo, ...c.alias]) {
      const k = normalizarCabecera(n);
      if (!porNombre.has(k)) porNombre.set(k, c.campo);
    }
  }
  const indices: Partial<Record<C, number>> = {};
  const ignoradas: string[] = [];
  cabecera.forEach((celda, i) => {
    const k = normalizarCabecera(celda);
    if (!k) return;
    const campo = porNombre.get(k);
    if (campo && indices[campo] === undefined) indices[campo] = i;
    else ignoradas.push(String(celda));
  });
  const faltantes = columnas.filter((c) => c.obligatoria && indices[c.campo] === undefined).map((c) => c.campo);
  return { indices, faltantes, ignoradas };
}

// ─── Filas ──────────────────────────────────────────────────────────────────

export interface FilaClaseCsv {
  fila: number;
  titulo: string | null;
  tipo: string | null;
  sede: string | null;
  instructor: string | null;
  fecha: string | null;
  hora: string | null;
  duracion: number | null;
  capacidad: number | null;
  sala: string | null;
  nivel: string | null;
  estado: string | null;
  descripcion: string | null;
  equipo: string | null;
}

export interface FilaReservaCsv {
  fila: number;
  documento: string | null;
  correo: string | null;
  clase: string | null;
  fecha: string | null;
  hora: string | null;
  sede: string | null;
  estado: string | null;
  origen: string | null;
  notas: string | null;
}

export interface FilaLeida<T> {
  datos: T;
  errores: ErrorFila[];
}

export interface Lectura<T> {
  error: ErrorArchivo | null;
  faltantes: string[];
  ignoradas: string[];
  filas: FilaLeida<T>[];
}

function filaVacia(fila: readonly unknown[] | undefined): boolean {
  return !fila || fila.every((c) => textoCelda(c) === undefined);
}

/** Primera fila no vacía = cabecera. */
function cabeceraDe(matriz: readonly (readonly unknown[])[]): number {
  return matriz.findIndex((f) => !filaVacia(f));
}

function leer<C extends string, T>(
  matriz: readonly (readonly unknown[])[],
  columnas: ColumnaCsv<C>[],
  convertir: (celda: (c: C) => unknown, fila: number) => FilaLeida<T>,
  clave: (t: T) => string | null,
): Lectura<T> {
  const iCab = cabeceraDe(matriz);
  if (iCab === -1) return { error: 'sin_cabecera', faltantes: [], ignoradas: [], filas: [] };
  const mapeo = mapearCabecera(matriz[iCab], columnas);
  if (mapeo.faltantes.length > 0) {
    const cab = new Map(columnas.map((c) => [c.campo, c.cabecera]));
    return { error: 'faltan_columnas', faltantes: mapeo.faltantes.map((f) => cab.get(f) ?? f), ignoradas: mapeo.ignoradas, filas: [] };
  }
  const filas: FilaLeida<T>[] = [];
  const vistas = new Set<string>();
  for (let i = iCab + 1; i < matriz.length; i++) {
    const f = matriz[i];
    if (filaVacia(f)) continue;
    const celda = (c: C) => {
      const idx = mapeo.indices[c];
      return idx === undefined ? undefined : f[idx];
    };
    const leida = convertir(celda, i + 1);
    const k = clave(leida.datos);
    if (k) {
      if (vistas.has(k)) leida.errores.push('duplicada_en_archivo');
      else vistas.add(k);
    }
    filas.push(leida);
  }
  if (filas.length === 0) return { error: 'sin_filas', faltantes: [], ignoradas: mapeo.ignoradas, filas };
  if (filas.length > MAX_FILAS_IMPORTACION) return { error: 'demasiadas_filas', faltantes: [], ignoradas: mapeo.ignoradas, filas };
  return { error: null, faltantes: [], ignoradas: mapeo.ignoradas, filas };
}

const recortado = (v: unknown, max: number): string | null => {
  const s = textoCelda(v);
  return s ? s.slice(0, max) : null;
};

function fechaYHora(celda: (c: 'fecha' | 'hora') => unknown, errores: ErrorFila[]): { fecha: string | null; hora: string | null } {
  const crudaFecha = textoCelda(celda('fecha'));
  const crudaHora = textoCelda(celda('hora'));
  const fecha = normalizarFecha(crudaFecha);
  const hora = normalizarHora(crudaHora);
  if (!crudaFecha) errores.push('fecha_requerida');
  else if (!fecha) errores.push('fecha_invalida');
  if (!crudaHora) errores.push('hora_requerida');
  else if (!hora) errores.push('hora_invalida');
  return { fecha, hora };
}

/** Matriz del archivo de clases → filas normalizadas con sus errores locales. */
export function leerClases(matriz: readonly (readonly unknown[])[]): Lectura<FilaClaseCsv> {
  return leer<CampoClase, FilaClaseCsv>(
    matriz,
    COLUMNAS_CLASES,
    (celda, fila) => {
      const errores: ErrorFila[] = [];
      const titulo = textoCelda(celda('titulo')) ?? null;
      if (!titulo) errores.push('titulo_requerido');
      else if (titulo.length > 200) errores.push('titulo_muy_largo');
      const instructor = textoCelda(celda('instructor'))?.toLowerCase() ?? null;
      if (!instructor) errores.push('instructor_requerido');
      else if (!CORREO.test(instructor)) errores.push('correo_invalido');
      const { fecha, hora } = fechaYHora(celda, errores);
      const duracion = enteroCelda(celda('duracion'));
      if (duracion === 'invalido' || (duracion !== null && (duracion < 5 || duracion > 480))) errores.push('duracion_invalida');
      const capacidad = enteroCelda(celda('capacidad'));
      if (capacidad === 'invalido' || (capacidad !== null && (capacidad < 1 || capacidad > 1000))) errores.push('capacidad_invalida');
      const nivel = normalizarNivel(celda('nivel'));
      if (nivel === 'invalido') errores.push('nivel_invalido');
      const estado = normalizarEstadoClase(celda('estado'));
      if (estado === 'invalido') errores.push('estado_invalido');
      return {
        errores,
        datos: {
          fila,
          titulo,
          tipo: recortado(celda('tipo'), 60),
          sede: textoCelda(celda('sede')) ?? null,
          instructor,
          fecha,
          hora,
          duracion: typeof duracion === 'number' ? duracion : null,
          capacidad: typeof capacidad === 'number' ? capacidad : null,
          sala: recortado(celda('sala'), 120),
          nivel: nivel === 'invalido' ? null : nivel,
          estado: estado === 'invalido' ? null : estado,
          descripcion: recortado(celda('descripcion'), 2000),
          equipo: recortado(celda('equipo'), 500),
        },
      };
    },
    (d) => (d.titulo && d.fecha && d.hora ? `${normalizarNombre(d.titulo)}|${normalizarNombre(d.sede)}|${d.fecha}|${d.hora}` : null),
  );
}

/** Documento comparable: sin puntos, guiones ni espacios, en mayúsculas («1.020.304» = «1020304»). */
export function documentoComparable(doc: string | null | undefined): string {
  return (doc ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

/** Matriz del archivo de reservas → filas normalizadas con sus errores locales. */
export function leerReservas(matriz: readonly (readonly unknown[])[]): Lectura<FilaReservaCsv> {
  return leer<CampoReserva, FilaReservaCsv>(
    matriz,
    COLUMNAS_RESERVAS,
    (celda, fila) => {
      const errores: ErrorFila[] = [];
      const documento = textoCelda(celda('documento')) ?? null;
      const correo = textoCelda(celda('correo'))?.toLowerCase() ?? null;
      if (!documento && !correo) errores.push('miembro_requerido');
      if (correo && !CORREO.test(correo)) errores.push('correo_invalido');
      const clase = textoCelda(celda('clase')) ?? null;
      if (!clase) errores.push('clase_requerida');
      const { fecha, hora } = fechaYHora(celda, errores);
      const estado = normalizarEstadoReserva(celda('estado'));
      if (estado === 'invalido') errores.push('estado_invalido');
      const origen = normalizarOrigen(celda('origen'));
      if (origen === 'invalido') errores.push('origen_invalido');
      return {
        errores,
        datos: {
          fila,
          documento,
          correo,
          clase,
          fecha,
          hora,
          sede: textoCelda(celda('sede')) ?? null,
          estado: estado === 'invalido' ? null : estado,
          origen: origen === 'invalido' ? null : origen,
          notas: recortado(celda('notas'), 1000),
        },
      };
    },
    (d) => {
      const miembro = documentoComparable(d.documento) || d.correo;
      return miembro && d.clase && d.fecha && d.hora ? `${miembro}|${normalizarNombre(d.clase)}|${d.fecha}|${d.hora}` : null;
    },
  );
}

/**
 * Inicio previsto (instante ISO con offset) de una fecha + hora de pared en la zona dada. Solo
 * para la vista previa: el valor que se guarda lo calcula la base con la zona de la sede.
 */
export function inicioPrevisto(fecha: string | null, hora: string | null, zona: string): string | null {
  if (!fecha || !hora) return null;
  return instanteEnZona(fecha, hora, zona);
}

// ─── Cuerpo para la RPC y reporte combinado ─────────────────────────────────

/** Filas sin errores locales, con el número de fila del archivo (para el reporte de la base). */
export function filasParaServidor<T extends { fila: number }>(lectura: Lectura<T>): T[] {
  return lectura.filas.filter((f) => f.errores.length === 0).map((f) => f.datos);
}

export interface FilaReporte {
  fila: number;
  errores: string[];
  inicio: string | null;
  miembro: string | null;
  clase: string | null;
}

/**
 * Une los errores locales con los de la vista previa de la base (por número de fila). Una fila
 * con errores locales no se envía a la base, así que sus errores son solo los locales.
 */
export function combinarReporte<T extends { fila: number }>(
  lectura: Lectura<T>,
  servidor: Array<{ fila: number; errores: string[]; inicio?: string | null; miembro?: string | null; clase?: string | null }> | null,
): FilaReporte[] {
  const porFila = new Map((servidor ?? []).map((s) => [s.fila, s]));
  return lectura.filas.map((f) => {
    const s = porFila.get(f.datos.fila);
    const errores = Array.from(new Set([...f.errores, ...(s?.errores ?? [])]));
    return { fila: f.datos.fila, errores, inicio: s?.inicio ?? null, miembro: s?.miembro ?? null, clase: s?.clase ?? null };
  });
}

export function resumenReporte(reporte: FilaReporte[]): { total: number; validas: number; conError: number } {
  const conError = reporte.filter((r) => r.errores.length > 0).length;
  return { total: reporte.length, validas: reporte.length - conError, conError };
}

// ─── Plantillas ─────────────────────────────────────────────────────────────

const EJEMPLO_CLASES: Array<Array<string | number>> = [
  ['Yoga matutino', 'yoga', 'Principal', 'instructor@ejemplo.com', '2026-10-05', '07:00', 60, 15, 'Salón 1', 'principiante', 'programada', 'Trae tu tapete', 'Tapete'],
  ['Spinning', 'spinning', 'Principal', 'instructor@ejemplo.com', '06/10/2026', '6:30 pm', 45, 20, 'Salón 2', 'intermedio', '', '', 'Bicicleta'],
];

const EJEMPLO_RESERVAS: Array<Array<string | number>> = [
  ['1020304050', '', 'Yoga matutino', '2026-10-05', '07:00', '', 'reservada', 'recepcion', ''],
  ['', 'miembro@ejemplo.com', 'Spinning', '06/10/2026', '18:30', 'Principal', 'asistio', 'web', 'Migrada del sistema anterior'],
];

/** CSV de la plantilla (separador «;», BOM, celdas protegidas contra fórmulas). */
export function plantillaCsv(tipo: TipoImportacion): string {
  return tipo === 'clases'
    ? filasACsv(COLUMNAS_CLASES.map((c) => c.cabecera), EJEMPLO_CLASES)
    : filasACsv(COLUMNAS_RESERVAS.map((c) => c.cabecera), EJEMPLO_RESERVAS);
}
