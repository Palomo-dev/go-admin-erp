/**
 * Reglas puras de «Mi asistencia» (Figma 20.9.12 y 20.31.4–20.31.8): estado de
 * cada día, método con el que se marcó y qué marca se reclama. Sin React: las
 * prueban `__tests__/miAsistenciaLogica.test.ts`.
 */
import { METODOS_M0, type MetodoM0, type MetodoMarca } from '@/lib/hrm/marcacion/metodos';

export type TipoMarca = 'check_in' | 'check_out' | 'break_start' | 'break_end';

/** Marca del día tal como la devuelve `GET /api/hrm/marcacion/mia` (`marcas[]`). */
export interface MarcaMia {
  id: string;
  tipo: TipoMarca;
  hora: string;
  metodo: string | null;
  punto: string | null;
  reclamo: 'pending' | 'approved' | 'rejected' | null;
}

export interface DiaAsistencia {
  fecha: string;
  festivo: boolean;
  sede: string | null;
  turno: { plantilla: string | null; inicio: string | null; fin: string | null; dia_descanso: boolean } | null;
  entrada: string | null;
  salida: string | null;
  descanso_inicio: string | null;
  descanso_fin: string | null;
  metodo: 'app' | 'qr' | 'manual' | null;
  modo: 'presencial' | 'remoto' | null;
  minutos: number | null;
  tarde_min: number | null;
  revisar: boolean;
  /** Marcación M0: método exacto de la entrada (`attendance_events.method`). */
  metodo_exacto?: string | null;
  /** Hay un reclamo del empleado sin resolver sobre alguna marca del día (R2). */
  reclamo_abierto?: boolean;
  marcas?: MarcaMia[];
}

export type Estado = 'enTurno' | 'aTiempo' | 'tarde' | 'sinSalida' | 'libre' | 'porRevisar' | 'sinMarcar' | 'enReclamo';
export const ESTADOS: readonly Estado[] = ['enTurno', 'aTiempo', 'tarde', 'sinSalida', 'libre', 'porRevisar', 'sinMarcar', 'enReclamo'];

/** Estado del día. Un reclamo abierto manda (20.31.8): es lo que la persona está esperando. */
export function estadoDe(d: DiaAsistencia, hoy: string): Estado {
  if (d.reclamo_abierto) return 'enReclamo';
  if (d.turno?.dia_descanso && !d.entrada) return 'libre';
  if (d.revisar) return 'porRevisar';
  if (d.entrada && !d.salida) return d.fecha === hoy ? 'enTurno' : 'sinSalida';
  if (!d.entrada) return d.turno ? 'sinMarcar' : 'libre';
  if ((d.tarde_min ?? 0) > 0) return 'tarde';
  return 'aTiempo';
}

const METODOS_MARCA: readonly MetodoMarca[] = [
  'celular_ubicacion',
  'qr',
  'nfc_etiqueta',
  'carne',
  'carne_nfc',
  'carne_qr',
  'pin',
  'rostro',
  'huella',
  'remoto',
  'manual',
];

/** Método de una marca: el exacto, o el que se deriva del origen viejo (`app` → celular, `nfc` → etiqueta). */
export function normalizarMetodo(v: string | null | undefined): MetodoMarca | null {
  if (!v) return null;
  if (v === 'nfc') return 'nfc_etiqueta';
  if (v === 'app') return 'celular_ubicacion';
  return (METODOS_MARCA as readonly string[]).includes(v) ? (v as MetodoMarca) : null;
}

/** «Cómo» del día: `metodo_exacto`, si no la entrada de `marcas`, si no el método viejo del día. */
export function metodoDelDia(d: Pick<DiaAsistencia, 'metodo_exacto' | 'metodo' | 'modo' | 'marcas'>): MetodoMarca | null {
  const exacto = normalizarMetodo(d.metodo_exacto);
  if (exacto) return exacto;
  const entrada = ordenarMarcas(d.marcas).find((m) => m.tipo === 'check_in');
  const deMarca = normalizarMetodo(entrada?.metodo);
  if (deMarca) return deMarca;
  if (!d.metodo) return null;
  if (d.metodo === 'manual') return 'manual';
  if (d.metodo === 'qr') return 'qr';
  return d.modo === 'remoto' ? 'remoto' : 'celular_ubicacion';
}

export function ordenarMarcas(marcas: readonly MarcaMia[] | null | undefined): MarcaMia[] {
  return [...(marcas ?? [])].sort((a, b) => Date.parse(a.hora) - Date.parse(b.hora));
}

/** Solo se reclaman días con marcas (20.31.5). */
export function puedeReclamar(d: Pick<DiaAsistencia, 'marcas'>): boolean {
  return (d.marcas?.length ?? 0) > 0;
}

/**
 * Marca que el diálogo propone (20.31.6): la entrada; si ya tiene un reclamo
 * en revisión, la primera que no lo tenga; si todas lo tienen, la primera.
 */
export function marcaPorDefecto(marcas: readonly MarcaMia[] | null | undefined): MarcaMia | null {
  const orden = ordenarMarcas(marcas);
  const libres = orden.filter((m) => m.reclamo !== 'pending');
  return libres.find((m) => m.tipo === 'check_in') ?? libres[0] ?? orden.find((m) => m.tipo === 'check_in') ?? orden[0] ?? null;
}

/**
 * Métodos con que se marca en la sede, para el aviso «En <sede> marcas con …»
 * (20.31.4). Con los métodos de la persona (`fn_hr_mi_metodo_marcacion`) manda
 * la base; sin ellos, los métodos exactos con que marcó esta semana. Solo los
 * de M0: carné, PIN, rostro y huella todavía no funcionan.
 */
export function metodosDeSede(
  metodos: { ubicacion: boolean; qr: boolean; nfc: boolean } | null | undefined,
  dias: readonly Pick<DiaAsistencia, 'metodo_exacto'>[]
): MetodoM0[] {
  if (metodos) {
    return METODOS_M0.filter((m) => (m === 'celular_ubicacion' ? metodos.ubicacion : m === 'qr' ? metodos.qr : metodos.nfc));
  }
  const vistos = new Set(dias.map((d) => normalizarMetodo(d.metodo_exacto)));
  return METODOS_M0.filter((m) => vistos.has(m));
}

/** Errores del reclamo → clave de `hrmMarcacion.reclamo.errores`. `duplicado` es el 23505 de `ajuste_ya_pendiente`. */
export function claveErrorReclamo(codigo: string): string {
  if (codigo === 'ajuste_ya_pendiente' || codigo === 'duplicado') return 'ajuste_ya_pendiente';
  if (codigo === 'marca_antigua' || codigo === 'jornada_cerrada' || codigo === 'sin_permiso') return codigo;
  if (codigo === 'reclamo_hora' || codigo === 'hora_invalida') return 'reclamo_hora';
  if (codigo === 'reclamo_motivo' || codigo === 'motivo_requerido') return 'reclamo_motivo';
  if (codigo === 'reclamo_que') return codigo;
  return 'error_hrm';
}
